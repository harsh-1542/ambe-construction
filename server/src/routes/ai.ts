import { Router } from "express";
import { config } from "../config.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { ApiError } from "../errors.js";
import type { IProject } from "../models/project.js";

export const aiRouter = Router();

/**
 * AI assistant — only functional when OPENAI_API_KEY is configured.
 * It answers business questions using a compact factual snapshot of the owner's data
 * and can draft a structured quick-entry payload for review. It never writes to the
 * database directly; anything it drafts must go through the normal (validated) APIs
 * after the owner confirms in the UI.
 */
aiRouter.get("/status", requireAuth, (_req: AuthedRequest, res) => {
  res.json({ available: !!config.openaiKey });
});

aiRouter.post("/ask", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!config.openaiKey) throw new ApiError(503, "AI assistant is not configured. Ask your developer to set OPENAI_API_KEY.");

    const question = String(req.body?.question || "").slice(0, 500);
    if (!question) throw new ApiError(400, "Type a question first");

    // Build a factual snapshot (numbers only, computed the same way as the dashboard)
    const { Types } = await import("mongoose");
    const { Project } = await import("../models/project.js");
    const { Transaction } = await import("../models/finance.js");
    const { Worker } = await import("../models/people.js");
    const { SupplierBill } = await import("../models/supplier.js");
    const { computeProjectFinancialsFromDocs } = await import("../calc/projectFinancials.js");
    const { calcWagesForWorker } = await import("../calc/wages.js");
    const { todayIST } = await import("../calc/money.js");
    const ownerId = req.ownerId!;
    const today = todayIST();

    const projects = (await Project.find({ owner: ownerId, archived: false }).lean()) as unknown as (IProject & { _id: any })[];
    const fins = await Promise.all(projects.map((p) => computeProjectFinancialsFromDocs(p)));
    const workers = (await Worker.find({ owner: ownerId, active: true }).lean()) as any[];
    let wagesDue = 0;
    for (const w of workers) {
      const c = await calcWagesForWorker(String(w._id), ownerId, "2000-01-01", today);
      if (c && c.netWagesDue > 0) wagesDue += c.netWagesDue;
    }
    const billAgg = await SupplierBill.aggregate<{ total: number; paid: number }>([
      { $match: { owner: new Types.ObjectId(ownerId) } },
      { $group: { _id: null, total: { $sum: "$total" }, paid: { $sum: "$amountPaid" } } },
    ]);
    const supplierOutstanding = Math.max(0, (billAgg[0]?.total ?? 0) - (billAgg[0]?.paid ?? 0));

    const snapshot = {
      today,
      projects: projects.map((p, i) => ({
        name: p.name,
        customer: p.customerName,
        status: p.status,
        progress: p.progress,
        contract: fins[i]!.revisedContract / 100,
        received: fins[i]!.paymentsReceived / 100,
        outstanding: fins[i]!.customerOutstanding / 100,
        spent: fins[i]!.expensesRecorded / 100,
      })),
      workers: workers.map((w) => ({ name: w.name, wageType: w.wageType, wageRate: w.wageRate / 100 })),
      wagesDueToWorkers: wagesDue / 100,
      owedToSuppliers: supplierOutstanding / 100,
    };

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: config.openaiKey });
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      messages: [
        {
          role: "system",
          content:
            "You are the assistant inside Ambe Construction OS, a construction business tool. Answer briefly in plain language using ONLY the JSON snapshot provided. Amounts are in rupees. If the snapshot lacks the answer, say what's missing. The user may write in English, Hindi or Gujarati; reply in the language of the question.",
        },
        { role: "user", content: `Snapshot: ${JSON.stringify(snapshot)}\n\nQuestion: ${question}` },
      ],
      max_tokens: 400,
    });

    res.json({ answer: completion.choices[0]?.message?.content?.trim() || "I could not answer that.", snapshotUsed: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Draft a quick-entry from natural language. Returns a structured suggestion only —
 * the client shows it in a review form and posts to the normal validated endpoints.
 */
aiRouter.post("/draft-entry", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!config.openaiKey) throw new ApiError(503, "AI assistant is not configured.");
    const text = String(req.body?.text || "").slice(0, 300);
    if (!text) throw new ApiError(400, "Type the entry first");

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: config.openaiKey });
    const completion = await openai.chat.completions.create({
      model: config.openaiModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Extract a transaction draft from the text (may be English/Hindi/Gujarati). Return JSON: {"kind": "expense"|"customer_payment"|"worker_advance"|"supplier_bill"|"task", "amountRupees": number|null, "date": "YYYY-MM-DD"|null, "personOrSite": string|null, "category": string|null, "description": string|null, "missing": string[]}. Today is ' +
            new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) +
            ". Never invent values; use null.",
        },
        { role: "user", content: text },
      ],
      max_tokens: 250,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    res.json({ draft: JSON.parse(raw) });
  } catch (e) {
    next(e);
  }
});
