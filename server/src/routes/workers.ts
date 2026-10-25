import { Router } from "express";
import mongoose, { Types } from "mongoose";
import { Worker, Attendance, WageSettlement } from "../models/people.js";
import { Transaction } from "../models/finance.js";
import { Project } from "../models/project.js";
import { AuditLog } from "../models/misc.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { z, type ZodTypeAny } from "zod";
import { workerSchema, workerUpdateSchema, attendanceSchema, attendanceBulkSchema, settlementSchema, voidSchema } from "../validation.js";
import { ApiError } from "../errors.js";
import { calcWagesForWorker, advanceBalance } from "../calc/wages.js";
import { todayIST } from "../calc/money.js";
import { withTx } from "../tx.js";

export const workersRouter = Router();
workersRouter.use(requireAuth);

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

workersRouter.get("/", async (req: AuthedRequest, res) => {
  const q = String(req.query.q || "").trim();
  const active = req.query.active;
  const filter: Record<string, unknown> = { owner: req.ownerId };
  if (active === "true") filter.active = true;
  if (active === "false") filter.active = false;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { phone: rx }, { role: rx }];
  }
  const workers = await Worker.find(filter).sort({ active: -1, name: 1 }).lean();

  const today = todayIST();
  const withBalances = await Promise.all(
    (workers as any[]).map(async (w) => {
      const calc = await calcWagesForWorker(String(w._id), req.ownerId!, "2000-01-01", today);
      return { ...w, wageDue: calc?.netWagesDue ?? 0, advanceBalance: calc?.advancesOutstanding ?? 0, earnedAllTime: calc?.earnedWages ?? 0 };
    })
  );
  res.json({ workers: withBalances });
});

workersRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(workerSchema, req.body);
    const worker = await Worker.create({ ...emptyToUndef(data as any), owner: req.ownerId });
    await AuditLog.create({ owner: req.ownerId, action: "worker.create", entity: "Worker", entityId: worker._id, summary: `Added worker ${worker.name}` });
    res.status(201).json({ worker });
  } catch (e) {
    next(e);
  }
});

workersRouter.put("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(workerUpdateSchema, req.body);
    const worker = await Worker.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: emptyToUndef(data as any) }, { new: true, runValidators: true });
    if (!worker) throw new ApiError(404, "Worker not found");
    await AuditLog.create({ owner: req.ownerId, action: "worker.update", entity: "Worker", entityId: worker._id, summary: `Updated worker ${worker.name}` });
    res.json({ worker });
  } catch (e) {
    next(e);
  }
});

workersRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const worker = await Worker.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: { active: false } }, { new: true });
    if (!worker) throw new ApiError(404, "Worker not found");
    await AuditLog.create({ owner: req.ownerId, action: "worker.deactivate", entity: "Worker", entityId: worker._id, summary: `Deactivated worker ${worker.name}` });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

workersRouter.get("/attendance", async (req: AuthedRequest, res) => {
  const { from, to, worker, project } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { owner: req.ownerId };
  if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (worker) filter.worker = new Types.ObjectId(worker);
  if (project) filter.project = new Types.ObjectId(project);
  const records = await Attendance.find(filter).sort({ date: -1 }).populate("worker", "name").populate("project", "name").lean();
  res.json({ records });
});

workersRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const worker = await Worker.findOne({ _id: req.params.id, owner: req.ownerId }).lean();
    if (!worker) throw new ApiError(404, "Worker not found");
    const [attendance, txns, settlements, advanceBal] = await Promise.all([
      Attendance.find({ owner: req.ownerId, worker: worker._id }).sort({ date: -1 }).limit(120).lean(),
      Transaction.find({ owner: req.ownerId, worker: worker._id, status: "active" }).sort({ date: -1 }).populate("project", "name").lean(),
      WageSettlement.find({ owner: req.ownerId, worker: worker._id, status: "active" }).sort({ to: -1 }).lean(),
      advanceBalance(String(worker._id), req.ownerId!),
    ]);
    const calc = await calcWagesForWorker(String(worker._id), req.ownerId!, "2000-01-01", todayIST());
    res.json({ worker, attendance, txns, settlements, advanceBalance: advanceBal, wageCalc: calc });
  } catch (e) {
    next(e);
  }
});

/** Wage preview for a period — the owner reviews this before recording a settlement. */
workersRouter.get("/:id/wage-calc", async (req: AuthedRequest, res, next) => {
  try {
    const from = String(req.query.from || "2000-01-01");
    const to = String(req.query.to || todayIST());
    const calc = await calcWagesForWorker(req.params.id, req.ownerId!, from, to);
    if (!calc) throw new ApiError(404, "Worker not found");
    res.json(calc);
  } catch (e) {
    next(e);
  }
});

// Attendance
workersRouter.post("/attendance", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(attendanceSchema, req.body);
    const doc = await Attendance.findOneAndUpdate(
      { owner: req.ownerId, worker: data.worker, date: data.date },
      { $set: { ...data, owner: req.ownerId, rateOverride: data.rateOverride ?? undefined, extraAmount: data.extraAmount ?? undefined, note: data.note || undefined } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ attendance: doc });
  } catch (e) {
    next(e);
  }
});

/** Bulk mark attendance for a day — the fast mobile flow. */
workersRouter.post("/attendance/bulk", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(attendanceBulkSchema, req.body);
    const ops = data.entries.map((e) => ({
      updateOne: {
        filter: { owner: req.ownerId, worker: new Types.ObjectId(e.worker), date: data.date },
        update: {
          $set: {
            owner: req.ownerId,
            worker: new Types.ObjectId(e.worker),
            project: data.project ? new Types.ObjectId(data.project) : undefined,
            date: data.date,
            status: e.status,
            extraAmount: e.extraAmount ?? undefined,
          },
        },
        upsert: true,
      },
    }));
    await Attendance.bulkWrite(ops as any[]);
    res.status(201).json({ ok: true, count: ops.length, date: data.date });
  } catch (e) {
    next(e);
  }
});

// Wage settlements
workersRouter.post("/settlements", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(settlementSchema, req.body);
    const created = await withTx(async (session) => {
      // prevent double-paying the same period
      const overlap = await WageSettlement.findOne({
        owner: req.ownerId,
        worker: data.worker,
        status: "active",
        from: { $lte: data.to },
        to: { $gte: data.from },
      }).session(session as never);
      if (overlap) {
        throw new ApiError(409, `Period ${overlap.from} to ${overlap.to} was already settled. Change the dates or edit that settlement.`);
      }

      const [settlement] = await WageSettlement.create(
        [
          {
            owner: req.ownerId,
            worker: data.worker,
            from: data.from,
            to: data.to,
            grossSettled: data.grossSettled,
            advanceDeducted: data.advanceDeducted,
            amountPaid: data.amountPaid,
            includesOpeningDue: data.includesOpeningDue,
            note: data.note || undefined,
          },
        ],
        session ? { session } : {}
      );

      const [tx] = await Transaction.create(
        [
          {
            owner: req.ownerId,
            type: "worker_wage",
            worker: data.worker,
            project: data.project || undefined,
            settlement: settlement._id,
            amount: data.amountPaid,
            date: data.date,
            method: data.method,
            paidTo: "Worker",
            description: `Wage settlement ${data.from} → ${data.to}`,
          },
        ],
        session ? { session } : {}
      );

      settlement.paymentTx = tx._id;
      await settlement.save(session ? { session } : {});
      return { settlement, txn: tx };
    });

    await AuditLog.create({ owner: req.ownerId, action: "settlement.create", entity: "WageSettlement", entityId: created.settlement._id, summary: `Settled wages ${data.from}→${data.to}, paid ₹${(data.amountPaid / 100).toLocaleString("en-IN")}, advance recovered ₹${(data.advanceDeducted / 100).toLocaleString("en-IN")}` });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

workersRouter.post("/settlements/:id/void", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(voidSchema, req.body);
    const result = await withTx(async (session) => {
      const s = await WageSettlement.findOne({ _id: req.params.id, owner: req.ownerId, status: "active" }).session(session as never);
      if (!s) throw new ApiError(404, "Settlement not found (or already void)");
      s.status = "void";
      s.voidReason = data.reason;
      await s.save(session ? { session } : {});
      if (s.paymentTx) {
        await Transaction.updateOne({ _id: s.paymentTx, owner: req.ownerId }, { $set: { status: "void", voidReason: `Settlement voided: ${data.reason}`, voidedAt: new Date() } }, session ? { session } : {});
      }
      return s;
    });
    await AuditLog.create({ owner: req.ownerId, action: "settlement.void", entity: "WageSettlement", entityId: result._id, summary: `Voided wage settlement: ${data.reason}` });
    res.json({ settlement: result });
  } catch (e) {
    next(e);
  }
});

export { Worker as WorkerModel, Project as ProjectModel };
