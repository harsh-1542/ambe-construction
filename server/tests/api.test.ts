import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import express from "express";
import type { Server } from "node:http";
import request from "supertest";

import { connectDb, disconnectDb } from "../src/db.js";
import cookieParser from "cookie-parser";
import { errorHandler, notFoundHandler } from "../src/errors.js";
import { authRouter } from "../src/routes/auth.js";
import { projectsRouter } from "../src/routes/projects.js";
import { moneyRouter } from "../src/routes/money.js";
import { workersRouter } from "../src/routes/workers.js";
import { suppliersRouter } from "../src/routes/suppliers.js";
import { tasksRouter, diaryRouter, notesRouter } from "../src/routes/misc.js";
import { docsRouter } from "../src/routes/docs.js";
import { dashboardRouter } from "../src/routes/dashboard.js";
import { searchRouter } from "../src/routes/search.js";
import { reportsRouter } from "../src/routes/reports.js";

let app: express.Express;
let server: Server;
let baseURL: string;
let cookie = "";

const api = () => request(baseURL);

async function start() {
  app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/money", moneyRouter);
  app.use("/api/workers", workersRouter);
  app.use("/api/suppliers", suppliersRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/diary", diaryRouter);
  app.use("/api/notes", notesRouter);
  app.use("/api/documents", docsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/reports", reportsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseURL = `http://127.0.0.1:${(server.address() as any).port}`;
      resolve();
    });
  });
}

let ownerId: string;

beforeAll(async () => {
  process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ambe_test";
  await connectDb();
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  await start();
});

afterAll(async () => {
  server.close();
  await disconnectDb();
});

describe("auth & setup", () => {
  it("starts with needsSetup=true", async () => {
    const r = await api().get("/api/auth/status");
    expect(r.status).toBe(200);
    expect(r.body.needsSetup).toBe(true);
  });

  it("creates the owner, refuses a second owner, requires auth", async () => {
    const r = await api().post("/api/auth/setup").send({ name: "Ambe Owner", username: "owner", password: "strongpass123" });
    expect(r.status).toBe(201);
    cookie = r.headers["set-cookie"][0].split(";")[0];
    expect(r.body.needsSetupWizard).toBe(true);

    const second = await api().post("/api/auth/setup").send({ name: "X", username: "secondowner", password: "whatever123" });
    expect(second.status).toBe(403);

    const me = await api().get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe("owner");
    ownerId = me.body.id;

    const anon = await api().get("/api/auth/me");
    expect(anon.status).toBe(401);
  });

  it("logs in and rejects wrong passwords", async () => {
    const ok = await api().post("/api/auth/login").send({ username: "owner", password: "strongpass123" });
    expect(ok.status).toBe(200);
    const bad = await api().post("/api/auth/login").send({ username: "owner", password: "wrong" });
    expect(bad.status).toBe(401);
  });
});

describe("projects", () => {
  let projectId: string;

  it("creates a project with validation", async () => {
    const bad = await api().post("/api/projects").set("Cookie", cookie).send({ name: "", customerName: "x", contractAmount: -5 });
    expect(bad.status).toBe(400);

    const r = await api().post("/api/projects").set("Cookie", cookie).send({
      name: "Patel House",
      customerName: "Bharat Patel",
      customerPhone: "9876543210",
      type: "residential",
      status: "active",
      contractAmount: 5_000_000,
      estimatedCost: 3_000_000,
      startDate: "2026-10-01",
      expectedEndDate: "2027-06-30",
      progress: 10,
    });
    expect(r.status).toBe(201);
    projectId = r.body.project._id;
    expect(r.body.project.fin.revisedContract).toBe(5_000_000);
    expect(r.body.project.fin.customerOutstanding).toBe(5_000_000);
  });

  it("updates a project", async () => {
    const r = await api().put(`/api/projects/${projectId}`).set("Cookie", cookie).send({ progress: 25, notes: "Foundation done" });
    expect(r.status).toBe(200);
    expect(r.body.project.progress).toBe(25);
  });

  it("adds and approves variations affecting revised contract", async () => {
    const v = await api().post(`/api/projects/${projectId}/variations`).set("Cookie", cookie).send({
      description: "Compound wall",
      amount: 250_000,
      date: "2026-10-10",
      approved: true,
    });
    expect(v.status).toBe(201);
    expect(v.body.fin.revisedContract).toBe(5_250_000);

    const un = await api().post(`/api/projects/${projectId}/variations`).set("Cookie", cookie).send({
      description: "Rumoured extra",
      amount: 100_000,
      date: "2026-10-11",
      approved: false,
    });
    expect(un.body.fin.revisedContract).toBe(5_250_000); // unapproved does not count
  });

  it("prevents cross-owner access", async () => {
    // create a second user directly
    const { User } = await import("../src/models/user.js");
    const other = await User.create({ name: "Other", username: `other-${Date.now()}`, passwordHash: "x" });
    const { signToken } = await import("../src/auth.js");
    const otherCookie = `token=${signToken(String(other._id))}`;
    const r = await api().get(`/api/projects/${projectId}`).set("Cookie", otherCookie);
    expect(r.status).toBe(404); // must not reveal existence
  });
});

describe("customer payments & outstanding", () => {
  let projectId: string;

  beforeAll(async () => {
    const r = await api().post("/api/projects").set("Cookie", cookie).send({
      name: "Shah Shop",
      customerName: "Nilesh Shah",
      type: "shop",
      status: "active",
      contractAmount: 2_000_000,
    });
    projectId = r.body.project._id;
  });

  it("records partial payments and tracks outstanding", async () => {
    const p1 = await api().post("/api/money/customer-payment").set("Cookie", cookie).send({
      project: projectId,
      amount: 500_000,
      date: "2026-10-05",
      method: "upi",
    });
    expect(p1.status).toBe(201);
    expect(p1.body.fin.customerOutstanding).toBe(1_500_000);

    const p2 = await api().post("/api/money/customer-payment").set("Cookie", cookie).send({
      project: projectId,
      amount: 300_000,
      date: "2026-10-15",
      method: "cash",
      refNo: "REF-88",
    });
    expect(p2.body.fin.customerOutstanding).toBe(1_200_000);
    expect(p2.body.fin.paymentsReceived).toBe(800_000);

    const receipt = await api().get(`/api/reports/receipt/${p1.body.txn._id}`).set("Cookie", cookie);
    expect(receipt.status).toBe(200);
    expect(receipt.headers["content-type"]).toContain("pdf");
    expect(receipt.body.length).toBeGreaterThan(1000);
  });

  it("validates amounts and rejects bad references", async () => {
    const bad = await api().post("/api/money/customer-payment").set("Cookie", cookie).send({
      project: projectId,
      amount: 0,
      date: "2026-10-05",
    });
    expect(bad.status).toBe(400);

    const badRef = await api().post("/api/money/customer-payment").set("Cookie", cookie).send({
      project: "0".repeat(24),
      amount: 500,
      date: "2026-10-05",
    });
    expect(badRef.status).toBe(404);
  });

  it("supports edit and void with balance recalculation", async () => {
    const list = await api().get(`/api/money/txns?project=${projectId}`).set("Cookie", cookie);
    const txn = list.body.txns[0];

    const edited = await api().put(`/api/money/txns/${txn._id}`).set("Cookie", cookie).send({ amount: txn.amount + 50_000 });
    expect(edited.status).toBe(200);
    const afterEdit = await api().get(`/api/projects/${projectId}`).set("Cookie", cookie);
    expect(afterEdit.body.fin.paymentsReceived).toBe(850_000);

    const voided = await api().post(`/api/money/txns/${txn._id}/void`).set("Cookie", cookie).send({ reason: "Duplicate entry made by mistake" });
    expect(voided.status).toBe(200);
    const afterVoid = await api().get(`/api/projects/${projectId}`).set("Cookie", cookie);
    // txn was the newest payment (300k, edited to 350k); voiding leaves the 500k one
    expect(afterVoid.body.fin.paymentsReceived).toBe(500_000);
    expect(afterVoid.body.fin.customerOutstanding).toBe(1_500_000);
  });

  it("blocks duplicate clientRequestId submissions", async () => {
    const body = { project: projectId, amount: 111, date: "2026-10-16", clientRequestId: "abc-123" };
    const r1 = await api().post("/api/money/customer-payment").set("Cookie", cookie).send(body);
    expect(r1.status).toBe(201);
    const r2 = await api().post("/api/money/customer-payment").set("Cookie", cookie).send(body);
    expect(r2.status).toBe(409);
  });
});

describe("workers, attendance, settlements, advances", () => {
  let workerId: string;

  it("creates workers and marks bulk attendance", async () => {
    const w = await api().post("/api/workers").set("Cookie", cookie).send({ name: "Ramesh K", wageType: "daily", wageRate: 80_000, phone: "9000000001" });
    expect(w.status).toBe(201);
    workerId = w.body.worker._id;

    const w2 = await api().post("/api/workers").set("Cookie", cookie).send({ name: "Suresh P", wageType: "daily", wageRate: 70_000 });

    const bulk = await api().post("/api/workers/attendance/bulk").set("Cookie", cookie).send({
      date: "2026-10-20",
      entries: [
        { worker: workerId, status: "present" },
        { worker: w2.body.worker._id, status: "half" },
      ],
    });
    expect(bulk.status).toBe(201);
    expect(bulk.body.count).toBe(2);

    // re-mark: upsert, no duplicate
    const bulk2 = await api().post("/api/workers/attendance/bulk").set("Cookie", cookie).send({
      date: "2026-10-20",
      entries: [{ worker: workerId, status: "half" }],
    });
    expect(bulk2.status).toBe(201);
    const recs = await api().get(`/api/workers/attendance?from=2026-10-20&to=2026-10-20&worker=${workerId}`).set("Cookie", cookie);
    expect(recs.body.records.length).toBe(1);
    expect(recs.body.records[0].status).toBe("half");
  });

  it("gives an advance and it counts against wages", async () => {
    const adv = await api().post("/api/money/worker-advance").set("Cookie", cookie).send({
      worker: workerId,
      amount: 10_000,
      date: "2026-10-05",
      method: "cash",
    });
    expect(adv.status).toBe(201);

    const calc = await api().get(`/api/workers/${workerId}/wage-calc?from=2026-10-01&to=2026-10-31`).set("Cookie", cookie);
    // 1 half day @ ₹800 → 400 earned minus ₹100 advance
    expect(calc.body.advancesOutstanding).toBe(10_000);
    expect(calc.body.netWagesDue).toBe(30_000);

    // settlement below deducts the advance; netWagesDue reaches 0 after settle
    const s = await api().post("/api/workers/settlements").set("Cookie", cookie).send({
      worker: workerId,
      from: "2026-10-01",
      to: "2026-10-31",
      grossSettled: calc.body.earnedWages,
      advanceDeducted: 10_000,
      amountPaid: 30_000,
      method: "cash",
      date: "2026-10-31",
    });
    expect(s.status).toBe(201);
    const after = await api().get(`/api/workers/${workerId}/wage-calc?from=2026-10-01&to=2026-10-31`).set("Cookie", cookie);
    expect(after.body.netWagesDue).toBe(0);
    expect(after.body.advancesOutstanding).toBe(0);

    // store settlementId for the void test
    (globalThis as any).__settlementId = s.body.settlement._id;
  });

  it("prevents double settlement of the same period", async () => {
    const dup = await api().post("/api/workers/settlements").set("Cookie", cookie).send({
      worker: workerId,
      from: "2026-10-15",
      to: "2026-11-15",
      grossSettled: 100,
      advanceDeducted: 0,
      amountPaid: 100,
      method: "cash",
      date: "2026-11-15",
    });
    expect(dup.status).toBe(409); // overlaps the settled Oct 1–31 period
  });

  it("voids a settlement and restores dues", async () => {
    const settlementId = (globalThis as any).__settlementId;
    const v = await api().post(`/api/workers/settlements/${settlementId}/void`).set("Cookie", cookie).send({ reason: "Paid the wrong person" });
    expect(v.status).toBe(200);
    const calc = await api().get(`/api/workers/${workerId}/wage-calc?from=2026-10-01&to=2026-10-31`).set("Cookie", cookie);
    expect(calc.body.settlementsPaid).toBe(0);
    expect(calc.body.advancesOutstanding).toBe(10_000);
    expect(calc.body.netWagesDue).toBe(30_000);
  });

  it("records a plain expense", async () => {
    const w = await api().post("/api/money/expense").set("Cookie", cookie).send({
      category: "labor",
      amount: 100_000,
      date: "2026-10-01",
      method: "cash",
    });
    expect(w.status).toBe(201);
  });
});

describe("supplier bills and payments", () => {
  let supplierId: string;
  let billId: string;

  it("creates supplier and bill with validation", async () => {
    const s = await api().post("/api/suppliers").set("Cookie", cookie).send({ name: "Cement House", phone: "9812345678" });
    expect(s.status).toBe(201);
    supplierId = s.body.supplier._id;

    const badTotal = await api().post("/api/suppliers/bills").set("Cookie", cookie).send({
      supplier: supplierId,
      billDate: "2026-10-05",
      description: "50 bags cement",
      items: [{ description: "Cement bag", qty: 50, unit: "bags", unitPrice: 8_000 }],
      subtotal: 400_000,
      tax: 20_000,
      total: -1,
    });
    expect(badTotal.status).toBe(400);

    const b = await api().post("/api/suppliers/bills").set("Cookie", cookie).send({
      supplier: supplierId,
      billDate: "2026-10-05",
      dueDate: "2026-11-05",
      description: "50 bags cement",
      items: [{ description: "Cement bag", qty: 50, unit: "bags", unitPrice: 8_000 }],
      subtotal: 400_000,
      tax: 20_000,
      total: 420_000,
    });
    expect(b.status).toBe(201);
    billId = b.body.bill._id;
  });

  it("partial supplier payment updates outstanding", async () => {
    const pay = await api().post("/api/money/supplier-payment").set("Cookie", cookie).send({
      supplier: supplierId,
      amount: 200_000,
      date: "2026-10-10",
      method: "bank",
      billAllocations: [{ bill: billId, amount: 200_000 }],
    });
    expect(pay.status).toBe(201);

    const det = await api().get(`/api/suppliers/${supplierId}`).set("Cookie", cookie);
    expect(det.body.outstanding).toBe(220_000);

    // allocation mismatch rejected
    const bad = await api().post("/api/money/supplier-payment").set("Cookie", cookie).send({
      supplier: supplierId,
      amount: 100,
      date: "2026-10-10",
      billAllocations: [{ bill: billId, amount: 999 }],
    });
    expect(bad.status).toBe(400);
  });

  it("voids supplier payment and restores bill", async () => {
    const txns = await api().get(`/api/money/txns?type=supplier_payment`).set("Cookie", cookie);
    const txnId = txns.body.txns[0]._id;
    const v = await api().post(`/api/money/txns/${txnId}/void`).set("Cookie", cookie).send({ reason: "Cheque bounced" });
    expect(v.status).toBe(200);

    const det = await api().get(`/api/suppliers/${supplierId}`).set("Cookie", cookie);
    expect(det.body.outstanding).toBe(420_000);
  });
});

describe("tasks, diary, notes, search, dashboard", () => {
  it("manages tasks with complete/reschedule", async () => {
    const t = await api().post("/api/tasks").set("Cookie", cookie).send({ title: "Call Patel about installment", category: "call", dueDate: "2026-10-20", priority: "high" });
    expect(t.status).toBe(201);
    const id = t.body.task._id;

    const overdue = await api().get("/api/tasks?when=overdue").set("Cookie", cookie);
    expect(overdue.body.tasks.some((x: any) => x._id === id)).toBe(true);

    await api().post(`/api/tasks/${id}/reschedule`).set("Cookie", cookie).send({ dueDate: "2099-01-01" });
    const done = await api().post(`/api/tasks/${id}/complete`).set("Cookie", cookie);
    expect(done.status).toBe(200);
    const reopen = await api().post(`/api/tasks/${id}/reopen`).set("Cookie", cookie);
    expect(reopen.body.task.status).toBe("todo");
  });

  it("completing a task does not mark any payment as paid", async () => {
    // explicit regression: task completion must never touch transactions
    const before = await api().get("/api/money/txns").set("Cookie", cookie);
    const t = await api().post("/api/tasks").set("Cookie", cookie).send({ title: "Follow up payment", dueDate: "2026-10-01", category: "payment" });
    await api().post(`/api/tasks/${t.body.task._id}/complete`).set("Cookie", cookie);
    const after = await api().get("/api/money/txns").set("Cookie", cookie);
    expect(after.body.txns.map((x: any) => x.status)).toEqual(before.body.txns.map((x: any) => x.status));
  });

  it("adds a diary entry with photos and updates progress", async () => {
    const projects = await api().get("/api/projects").set("Cookie", cookie);
    const projectId = projects.body.projects[0]._id;

    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082", "hex");
    const up = await api().post("/api/documents").set("Cookie", cookie).field("title", "Slab photo").field("category", "site_photo").field("project", projectId).attach("file", png, { filename: "slab.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    expect(up.body.doc.storage).toBe("local");

    const entry = await api().post("/api/diary").set("Cookie", cookie).send({
      project: projectId,
      date: "2026-10-21",
      workDone: "Slab casting completed",
      workersPresent: 8,
      progress: 45,
      photoIds: [up.body.doc._id],
    });
    expect(entry.status).toBe(201);

    const proj = await api().get(`/api/projects/${projectId}`).set("Cookie", cookie);
    expect(proj.body.project.progress).toBe(45);

    const file = await api().get(`/api/documents/${up.body.doc._id}/file`).set("Cookie", cookie);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
  });

  it("global search finds people, projects and transactions", async () => {
    const r = await api().get("/api/search?q=Patel").set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.body.results.length).toBeGreaterThan(0);
    const kinds = r.body.results.map((x: any) => x.kind);
    expect(kinds).toContain("project");
  });

  it("dashboard returns real computed figures", async () => {
    const d = await api().get("/api/dashboard").set("Cookie", cookie);
    expect(d.status).toBe(200);
    expect(d.body.cards.activeSites).toBeGreaterThan(0);
    // totals must match what we recorded
    const projects = await api().get("/api/projects").set("Cookie", cookie);
    const expectedOutstanding = projects.body.projects.reduce((s: number, p: any) => s + Math.max(0, p.fin.customerOutstanding), 0);
    expect(d.body.cards.customerOutstanding).toBe(expectedOutstanding);
  });
});

describe("money summary & reports agree with transactions", () => {
  it("summary totals match recorded transactions", async () => {
    const all = await api().get("/api/money/txns?limit=200").set("Cookie", cookie);
    const customerPayments = all.body.txns.filter((t: any) => t.type === "customer_payment").reduce((s: number, t: any) => s + t.amount, 0);
    const summary = await api().get("/api/money/summary?from=2000-01-01").set("Cookie", cookie);
    // summary includes active only; list also active only
    expect(summary.body.moneyIn.customerPayments).toBe(customerPayments);
  });

  it("expense excel export works", async () => {
    const r = await api()
      .get("/api/reports/expenses?format=excel&from=2000-01-01")
      .set("Cookie", cookie)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("spreadsheetml");
    expect(Buffer.isBuffer(r.body) || typeof r.body === "string").toBe(true);
    expect(r.body.length).toBeGreaterThan(500);
  });

  it("customer outstanding pdf works", async () => {
    const r = await api().get("/api/reports/customer-outstanding").set("Cookie", cookie);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("pdf");
  });

  it("audit log records financial changes", async () => {
    const { AuditLog } = await import("../src/models/misc.js");
    const logs = await AuditLog.find({ owner: ownerId });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("transaction.customer_payment");
    expect(actions).toContain("transaction.void");
  });
});
