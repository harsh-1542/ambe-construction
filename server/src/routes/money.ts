import { Router } from "express";
import { Types } from "mongoose";
import { Transaction, EXPENSE_CATEGORIES, OTHER_INCOME_CATEGORIES } from "../models/finance.js";
import { Project } from "../models/project.js";
import { SupplierBill } from "../models/supplier.js";
import { WageSettlement } from "../models/people.js";
import { AuditLog } from "../models/misc.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { z, type ZodTypeAny } from "zod";
import {
  customerPaymentSchema,
  otherIncomeSchema,
  expenseSchema,
  workerAdvanceSchema,
  supplierPaymentSchema,
  ownerCapitalSchema,
  voidSchema,
} from "../validation.js";
import { ApiError } from "../errors.js";
import { computeProjectFinancials } from "../calc/projectFinancials.js";
import { todayIST } from "../calc/money.js";

export const moneyRouter = Router();
moneyRouter.use(requireAuth);

function parseOr400<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new ApiError(400, "Please check the form", (r.error.flatten() as any).fieldErrors);
  return r.data;
}

function emptyToUndef(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = v === "" ? undefined : v;
  return out;
}

async function projectExistsForOwner(id: string, ownerId: string) {
  const p = await Project.findOne({ _id: id, owner: ownerId });
  if (!p) throw new ApiError(404, "Project not found");
  return p;
}

async function audit(ownerId: string, action: string, entityId: Types.ObjectId | undefined, summary: string, changes?: unknown) {
  await AuditLog.create({ owner: ownerId, action, entity: "Transaction", entityId, summary, changes });
}

/** GET /api/money/txns?type=&project=&worker=&supplier=&from=&to=&q=&page= */
moneyRouter.get("/txns", async (req: AuthedRequest, res) => {
  const ownerId = req.ownerId!;
  const { type, project, worker, supplier, from, to, method, opening } = req.query as Record<string, string>;
  const q = String(req.query.q || "").trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(5, Number(req.query.limit || 50)));

  const filter: Record<string, unknown> = { owner: new Types.ObjectId(ownerId), status: "active" };
  if (type) filter.type = { $in: type.split(",") };
  if (project) filter.project = new Types.ObjectId(project);
  if (worker) filter.worker = new Types.ObjectId(worker);
  if (supplier) filter.supplier = new Types.ObjectId(supplier);
  if (method) filter.method = method;
  if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (opening === "false") filter.openingBalance = false;
  if (opening === "only") filter.openingBalance = true;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ description: rx }, { paidTo: rx }, { refNo: rx }, { notes: rx }];
  }

  const [txns, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("project", "name customerName")
      .populate("worker", "name")
      .populate("supplier", "name")
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  const sumAgg = await Transaction.aggregate<{ total: number }>([
    { $match: filter },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  res.json({ txns, total, page, pages: Math.ceil(total / limit) || 1, sum: sumAgg[0]?.total ?? 0 });
});

/** GET /api/money/txns/:id */
moneyRouter.get("/txns/:id", async (req: AuthedRequest, res, next) => {
  try {
    const t = await Transaction.findOne({ _id: req.params.id, owner: req.ownerId })
      .populate("project", "name customerName")
      .populate("worker", "name")
      .populate("supplier", "name")
      .lean();
    if (!t) throw new ApiError(404, "Transaction not found");
    res.json(t);
  } catch (e) {
    next(e);
  }
});

/** POST /api/money/customer-payment */
moneyRouter.post("/customer-payment", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(customerPaymentSchema, req.body);
    const project = await projectExistsForOwner(data.project, req.ownerId!);
    if (data.installment) {
      const inst = project.installments?.find((i: any) => String(i._id) === data.installment);
      if (!inst) throw new ApiError(400, "That installment does not belong to this project");
    }
    const tx = await Transaction.create({
      owner: req.ownerId,
      type: "customer_payment",
      project: project._id,
      installment: data.installment || undefined,
      amount: data.amount,
      date: data.date,
      method: data.method,
      refNo: data.refNo || undefined,
      paidTo: data.paidTo || project.customerName,
      description: data.description || undefined,
      notes: data.notes || undefined,
      clientRequestId: data.clientRequestId || undefined,
    });
    await audit(req.ownerId!, "transaction.customer_payment", tx._id, `Customer payment ₹${(data.amount / 100).toLocaleString("en-IN")} on ${project.name}`);
    const fin = await computeProjectFinancials(String(project._id), req.ownerId!);
    res.status(201).json({ txn: tx, fin });
  } catch (e) {
    next(e);
  }
});

/** POST /api/money/other-income */
moneyRouter.post("/other-income", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(otherIncomeSchema, req.body);
    const tx = await Transaction.create({
      owner: req.ownerId,
      type: "other_income",
      category: data.category,
      project: data.project || undefined,
      amount: data.amount,
      date: data.date,
      method: data.method,
      refNo: data.refNo || undefined,
      paidTo: data.paidTo || undefined,
      description: data.description || undefined,
      notes: data.notes || undefined,
      clientRequestId: data.clientRequestId || undefined,
    });
    await audit(req.ownerId!, "transaction.other_income", tx._id, `Other income ₹${(data.amount / 100).toLocaleString("en-IN")}`);
    res.status(201).json({ txn: tx });
  } catch (e) {
    next(e);
  }
});

/** POST /api/money/expense */
moneyRouter.post("/expense", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(expenseSchema, req.body);
    if (!EXPENSE_CATEGORIES.includes(data.category as any)) throw new ApiError(400, "Unknown expense category");
    if (data.project) await projectExistsForOwner(data.project, req.ownerId!);
    const tx = await Transaction.create({
      owner: req.ownerId,
      type: "expense",
      category: data.category,
      project: data.project || undefined,
      amount: data.amount,
      date: data.date,
      method: data.method,
      refNo: data.refNo || undefined,
      paidTo: data.paidTo || undefined,
      description: data.description || undefined,
      notes: data.notes || undefined,
      clientRequestId: data.clientRequestId || undefined,
    });
    await audit(req.ownerId!, "transaction.expense", tx._id, `Expense ₹${(data.amount / 100).toLocaleString("en-IN")} (${data.category})${data.project ? "" : " — general"}`);
    const fin = data.project ? await computeProjectFinancials(data.project, req.ownerId!) : null;
    res.status(201).json({ txn: tx, fin });
  } catch (e) {
    next(e);
  }
});

/** POST /api/money/supplier-payment — pays supplier bills, optionally across several bills. */
moneyRouter.post("/supplier-payment", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(supplierPaymentSchema, req.body);

    if (data.billAllocations.length > 0) {
      const allocTotal = data.billAllocations.reduce((s, a) => s + a.amount, 0);
      if (allocTotal !== data.amount) {
        throw new ApiError(400, `Bill allocations add up to ₹${(allocTotal / 100).toLocaleString("en-IN")} but payment is ₹${(data.amount / 100).toLocaleString("en-IN")}`);
      }
      const billIds = data.billAllocations.map((a) => new Types.ObjectId(a.bill));
      const bills = await SupplierBill.find({ _id: { $in: billIds }, owner: req.ownerId, supplier: data.supplier });
      if (bills.length !== new Set(data.billAllocations.map((a) => a.bill)).size) {
        throw new ApiError(400, "One or more bills do not belong to this supplier");
      }
    }

    const tx = await Transaction.create({
      owner: req.ownerId,
      type: "supplier_payment",
      supplier: data.supplier,
      project: data.project || undefined,
      amount: data.amount,
      date: data.date,
      method: data.method,
      refNo: data.refNo || undefined,
      description: data.description || undefined,
      notes: data.notes || undefined,
      billAllocations: data.billAllocations.map((a) => ({ bill: new Types.ObjectId(a.bill), amount: a.amount })),
      clientRequestId: data.clientRequestId || undefined,
    });

    // update denormalised amountPaid on each allocated bill
    for (const a of data.billAllocations) {
      await SupplierBill.updateOne({ _id: a.bill, owner: req.ownerId }, { $inc: { amountPaid: a.amount } });
    }

    await audit(req.ownerId!, "transaction.supplier_payment", tx._id, `Supplier payment ₹${(data.amount / 100).toLocaleString("en-IN")}`);
    res.status(201).json({ txn: tx });
  } catch (e) {
    next(e);
  }
});

/** POST /api/money/worker-advance — money handed to a worker ahead of wages. */
moneyRouter.post("/worker-advance", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(workerAdvanceSchema, req.body);
    const { Worker } = await import("../models/people.js");
    const worker = await Worker.findOne({ _id: data.worker, owner: req.ownerId });
    if (!worker) throw new ApiError(404, "Worker not found");
    if (data.project) await projectExistsForOwner(data.project, req.ownerId!);
    const tx = await Transaction.create({
      owner: req.ownerId,
      type: "worker_advance",
      worker: worker._id,
      project: data.project || undefined,
      amount: data.amount,
      date: data.date,
      method: data.method,
      paidTo: worker.name,
      description: data.description || `Advance to ${worker.name}`,
      notes: data.notes || undefined,
      clientRequestId: data.clientRequestId || undefined,
    });
    await audit(req.ownerId!, "transaction.worker_advance", tx._id, `Advance ₹${(data.amount / 100).toLocaleString("en-IN")} to ${worker.name}`);
    res.status(201).json({ txn: tx });
  } catch (e) {
    next(e);
  }
});

/** POST /api/money/owner-capital — opening cash injection (not income). */
moneyRouter.post("/owner-capital", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(ownerCapitalSchema, req.body);
    const tx = await Transaction.create({
      owner: req.ownerId,
      type: "owner_capital",
      amount: data.amount,
      date: data.date,
      method: data.method,
      description: data.description || "Opening cash / capital",
      notes: data.notes || undefined,
      openingBalance: true,
      clientRequestId: data.clientRequestId || undefined,
    });
    await audit(req.ownerId!, "transaction.owner_capital", tx._id, `Opening balance ₹${(data.amount / 100).toLocaleString("en-IN")}`);
    res.status(201).json({ txn: tx });
  } catch (e) {
    next(e);
  }
});

/**
 * PUT /api/money/txns/:id — edit a transaction's editable fields.
 * Amount/date edits keep an audit trail. Type is immutable; void + re-enter instead.
 */
moneyRouter.put("/txns/:id", async (req: AuthedRequest, res, next) => {
  try {
    const t = await Transaction.findOne({ _id: req.params.id, owner: req.ownerId });
    if (!t) throw new ApiError(404, "Transaction not found");
    if (t.type === "worker_wage" && t.settlement) throw new ApiError(400, "This wage payment belongs to a settlement. Void the settlement instead.");

    const editable = ["amount", "date", "method", "refNo", "description", "notes", "paidTo"] as const;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of editable) {
      if (k in req.body && (req.body as any)[k] !== undefined) {
        const newVal = (req.body as any)[k] === "" ? undefined : (req.body as any)[k];
        if (k === "amount") {
          const amt = Number(newVal);
          if (!Number.isInteger(amt) || amt < 1) throw new ApiError(400, "Amount must be a positive whole number of paise");
          if (amt === t.amount) continue;
          changes[k] = { from: t.amount, to: amt };
          t.amount = amt;
        } else if (String(t.get(k) ?? "") !== String(newVal ?? "")) {
          changes[k] = { from: t.get(k), to: newVal };
          t.set(k, newVal);
        }
      }
    }
    await t.save();

    // keep denormalised bill allocations consistent if amount changed on a supplier payment
    if (t.type === "supplier_payment" && changes["amount"]) {
      const delta = (changes["amount"].to as number) - (changes["amount"].from as number);
      if (t.billAllocations.length > 0 && delta !== 0) {
        // scale the single allocation proportionally when there is exactly one; refuse multi-bill amount edits
        if (t.billAllocations.length > 1) throw new ApiError(400, "This payment covers several bills. Void it and re-enter instead of editing the amount.");
        await SupplierBill.updateOne({ _id: t.billAllocations[0].bill, owner: req.ownerId }, { $inc: { amountPaid: delta } });
      }
    }

    await audit(req.ownerId!, "transaction.edit", t._id, `Edited ${t.type}`, changes);
    res.json({ txn: t });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/money/txns/:id/void — correction workflow. Never hard-deletes.
 * Rolls back denormalised state (bill amountPaid, settlement link) so balances stay right.
 */
moneyRouter.post("/txns/:id/void", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(voidSchema, req.body);
    const t = await Transaction.findOne({ _id: req.params.id, owner: req.ownerId });
    if (!t) throw new ApiError(404, "Transaction not found");
    if (t.status === "void") throw new ApiError(400, "Already voided");
    if (t.type === "worker_wage" && t.settlement) {
      throw new ApiError(400, "Void the wage settlement from the worker page — that also voids this payment correctly.");
    }
    if (t.type === "supplier_payment") {
      for (const a of t.billAllocations) {
        await SupplierBill.updateOne({ _id: a.bill, owner: req.ownerId }, { $inc: { amountPaid: -a.amount } });
      }
    }
    t.status = "void";
    t.voidReason = data.reason;
    t.voidedAt = new Date();
    await t.save();
    await audit(req.ownerId!, "transaction.void", t._id, `Voided ${t.type} ₹${(t.amount / 100).toLocaleString("en-IN")}: ${data.reason}`, { amount: t.amount, type: t.type });
    res.json({ txn: t });
  } catch (e) {
    next(e);
  }
});

/** GET /api/money/summary?from=&to= — Money In / Out / totals for the Money page. */
moneyRouter.get("/summary", async (req: AuthedRequest, res) => {
  const ownerId = req.ownerId!;
  const from = String(req.query.from || "2000-01-01");
  const to = String(req.query.to || todayIST());
  const base: Record<string, unknown> = { owner: new Types.ObjectId(ownerId), status: "active", date: { $gte: from, $lte: to } };

  const byType = await Transaction.aggregate<{ _id: string; total: number; count: number }>([
    { $match: base },
    { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  const expensesByCategory = await Transaction.aggregate<{ _id: string; total: number }>([
    { $match: { ...base, type: "expense" } },
    { $group: { _id: "$category", total: { $sum: "$amount" } } },
    { $sort: { total: -1 } },
  ]);
  const byMethod = await Transaction.aggregate<{ _id: string; total: number }>([
    { $match: base },
    { $group: { _id: "$method", total: { $sum: "$amount" } } },
  ]);

  const get = (t: string) => byType.find((r) => r._id === t)?.total ?? 0;
  res.json({
    from,
    to,
    moneyIn: {
      customerPayments: get("customer_payment"),
      otherIncome: get("other_income"),
      total: get("customer_payment") + get("other_income"),
    },
    moneyOut: {
      expenses: get("expense"),
      wages: get("worker_wage"),
      advances: get("worker_advance"),
      supplierPayments: get("supplier_payment"),
      total: get("expense") + get("worker_wage") + get("worker_advance") + get("supplier_payment"),
    },
    ownerCapital: get("owner_capital"),
    expensesByCategory,
    byMethod,
    counts: Object.fromEntries(byType.map((r) => [r._id, r.count])),
  });
});

/** Receipt PDF for a customer payment is served from /api/reports/receipt/:txnId (see reports route). */

export const expenseCategories = EXPENSE_CATEGORIES;
export const otherIncomeCategories = OTHER_INCOME_CATEGORIES;
