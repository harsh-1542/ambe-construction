import { Router } from "express";
import { Types } from "mongoose";
import { Project, Variation } from "../models/project.js";
import { Transaction } from "../models/finance.js";
import { SupplierBill } from "../models/supplier.js";
import { Attendance } from "../models/people.js";
import { Task, SiteDiaryEntry, Note, DocumentFile, AuditLog } from "../models/misc.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { z, type ZodTypeAny } from "zod";
import { projectSchema, projectUpdateSchema, variationSchema, installmentSchema } from "../validation.js";
import { ApiError } from "../errors.js";
import { computeProjectFinancials } from "../calc/projectFinancials.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

function parseOr400<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new ApiError(400, "Please check the form", (r.error.flatten() as any).fieldErrors);
  return r.data;
}

function emptyToUndef<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = v === "" ? undefined : v;
  return out as T;
}

// List with search/filter/sort/pagination
projectsRouter.get("/", async (req: AuthedRequest, res) => {
  const ownerId = req.ownerId!;
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "");
  const includeArchived = req.query.archived === "true";
  const sort = String(req.query.sort || "updatedAt");
  const dir = req.query.dir === "asc" ? 1 : -1;
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(5, Number(req.query.limit || 50)));

  const filter: Record<string, unknown> = { owner: new Types.ObjectId(ownerId) };
  if (!includeArchived) filter.archived = false;
  if (status && status !== "all") filter.status = status;
  if (q) filter.$or = [{ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { customerName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { customerPhone: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }];

  const sortField = ["updatedAt", "name", "createdAt", "contractAmount", "progress"].includes(sort) ? sort : "updatedAt";
  const [projects, total] = await Promise.all([
    Project.find(filter).sort({ [sortField]: dir }).skip((page - 1) * limit).limit(limit).lean(),
    Project.countDocuments(filter),
  ]);

  // attach lightweight financials for list display
  const { computeProjectFinancialsFromDocs } = await import("../calc/projectFinancials.js");
  const withFin = await Promise.all(
    (projects as any[]).map(async (p) => {
      const fin = await computeProjectFinancialsFromDocs(p);
      return { ...p, fin };
    })
  );

  res.json({ projects: withFin, total, page, pages: Math.ceil(total / limit) || 1 });
});

projectsRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(projectSchema, req.body);
    const project = await Project.create({ ...emptyToUndef(data as any), owner: req.ownerId });
    await AuditLog.create({ owner: req.ownerId, action: "project.create", entity: "Project", entityId: project._id, summary: `Created project ${project.name}` });
    const fin = await computeProjectFinancials(String(project._id), req.ownerId!);
    res.status(201).json({ project: { ...project.toObject(), fin } });
  } catch (e) {
    next(e);
  }
});

projectsRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, owner: req.ownerId }).lean();
    if (!project) throw new ApiError(404, "Project not found");
    const fin = await computeProjectFinancials(String(project._id), req.ownerId!);

    const [variations, payments, expenses, tasks, diary, docs, notes, bills, attendance] = await Promise.all([
      Variation.find({ owner: req.ownerId, project: project._id }).sort({ date: -1 }).lean(),
      Transaction.find({ owner: req.ownerId, project: project._id, type: { $in: ["customer_payment", "other_income"] }, status: "active" }).sort({ date: -1 }).lean(),
      Transaction.find({ owner: req.ownerId, project: project._id, type: { $in: ["expense", "worker_wage", "worker_advance", "supplier_payment"] }, status: "active" }).sort({ date: -1 }).limit(200).lean(),
      Task.find({ owner: req.ownerId, project: project._id }).sort({ dueDate: 1 }).lean(),
      SiteDiaryEntry.find({ owner: req.ownerId, project: project._id }).sort({ date: -1 }).limit(60).lean(),
      DocumentFile.find({ owner: req.ownerId, project: project._id }).sort({ createdAt: -1 }).lean(),
      Note.find({ owner: req.ownerId, project: project._id }).sort({ updatedAt: -1 }).lean(),
      SupplierBill.find({ owner: req.ownerId, project: project._id }).sort({ billDate: -1 }).lean(),
      Attendance.aggregate([
        { $match: { owner: new Types.ObjectId(req.ownerId!), project: project._id } },
        { $group: { _id: "$worker", days: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } } } },
        { $lookup: { from: "workers", localField: "_id", foreignField: "_id", as: "worker" } },
        { $unwind: "$worker" },
        { $project: { name: "$worker.name", role: "$worker.role", days: 1, present: 1 } },
        { $sort: { days: -1 } },
      ]),
    ]);

    const allTx = await Transaction.find({ owner: req.ownerId, project: project._id, status: "active" }).sort({ date: -1, createdAt: -1 }).limit(300).lean();

    res.json({ project, fin, variations, payments, expenses, tasks, diary, docs, notes, bills, attendance, allTransactions: allTx });
  } catch (e) {
    next(e);
  }
});

projectsRouter.put("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(projectUpdateSchema, req.body);
    const project = await Project.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: emptyToUndef(data as any) }, { new: true, runValidators: true });
    if (!project) throw new ApiError(404, "Project not found");
    await AuditLog.create({ owner: req.ownerId, action: "project.update", entity: "Project", entityId: project._id, summary: `Updated project ${project.name}` });
    const fin = await computeProjectFinancials(String(project._id), req.ownerId!);
    res.json({ project: { ...project.toObject(), fin } });
  } catch (e) {
    next(e);
  }
});

projectsRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    // archive, never hard-delete: preserves financial history
    const project = await Project.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: { archived: true } }, { new: true });
    if (!project) throw new ApiError(404, "Project not found");
    await AuditLog.create({ owner: req.ownerId, action: "project.archive", entity: "Project", entityId: project._id, summary: `Archived project ${project.name}` });
    res.json({ ok: true, archived: true });
  } catch (e) {
    next(e);
  }
});

projectsRouter.post("/:id/unarchive", async (req: AuthedRequest, res, next) => {
  try {
    const project = await Project.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: { archived: false } }, { new: true });
    if (!project) throw new ApiError(404, "Project not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Variations (extra work)
projectsRouter.post("/:id/variations", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(variationSchema, req.body);
    const project = await Project.findOne({ _id: req.params.id, owner: req.ownerId });
    if (!project) throw new ApiError(404, "Project not found");
    const v = await Variation.create({ ...data, project: project._id, owner: req.ownerId, approvedDate: data.approved ? data.date : undefined });
    await AuditLog.create({ owner: req.ownerId, action: "variation.create", entity: "Variation", entityId: v._id, summary: `Added variation ₹${data.amount / 100} on ${project.name}` });
    const fin = await computeProjectFinancials(String(project._id), req.ownerId!);
    res.status(201).json({ variation: v, fin });
  } catch (e) {
    next(e);
  }
});

projectsRouter.put("/:id/variations/:vid", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(variationSchema.partial(), req.body);
    const v = await Variation.findOneAndUpdate({ _id: req.params.vid, owner: req.ownerId, project: req.params.id }, { $set: data }, { new: true, runValidators: true });
    if (!v) throw new ApiError(404, "Variation not found");
    await AuditLog.create({ owner: req.ownerId, action: "variation.update", entity: "Variation", entityId: v._id, summary: `Updated variation` });
    const fin = await computeProjectFinancials(String(req.params.id), req.ownerId!);
    res.json({ variation: v, fin });
  } catch (e) {
    next(e);
  }
});

projectsRouter.delete("/:id/variations/:vid", async (req: AuthedRequest, res, next) => {
  try {
    const v = await Variation.findOneAndDelete({ _id: req.params.vid, owner: req.ownerId, project: req.params.id });
    if (!v) throw new ApiError(404, "Variation not found");
    await AuditLog.create({ owner: req.ownerId, action: "variation.delete", entity: "Variation", entityId: v._id, summary: `Removed variation` });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Installments
projectsRouter.post("/:id/installments", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(installmentSchema, req.body);
    const project = await Project.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $push: { installments: data } }, { new: true });
    if (!project) throw new ApiError(404, "Project not found");
    res.status(201).json({ project });
  } catch (e) {
    next(e);
  }
});

projectsRouter.delete("/:id/installments/:iid", async (req: AuthedRequest, res, next) => {
  try {
    const project = await Project.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $pull: { installments: { _id: req.params.iid } } }, { new: true });
    if (!project) throw new ApiError(404, "Project not found");
    res.json({ project });
  } catch (e) {
    next(e);
  }
});
