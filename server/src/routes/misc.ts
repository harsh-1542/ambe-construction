import { Router } from "express";
import { Types } from "mongoose";
import { Task, Note, SiteDiaryEntry, DocumentFile, AuditLog } from "../models/misc.js";
import { Project } from "../models/project.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { z, type ZodTypeAny } from "zod";
import { taskSchema, taskUpdateSchema, diarySchema, noteSchema } from "../validation.js";
import { ApiError } from "../errors.js";
import { todayIST } from "../calc/money.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

export const diaryRouter = Router();
diaryRouter.use(requireAuth);

export const notesRouter = Router();
notesRouter.use(requireAuth);

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

// ── Tasks ────────────────────────────────────────────────────
tasksRouter.get("/", async (req: AuthedRequest, res) => {
  const { status, when, project, priority, q } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { owner: req.ownerId };
  if (project) filter.project = new Types.ObjectId(project);
  if (priority) filter.priority = priority;
  if (status && status !== "all") filter.status = status;
  const today = todayIST();
  if (when === "today") filter.dueDate = today;
  if (when === "overdue") {
    filter.dueDate = { $lt: today };
    filter.status = { $ne: "done" };
  }
  if (when === "upcoming") {
    filter.dueDate = { $gte: today };
    filter.status = { $ne: "done" };
  }
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { notes: rx }];
  }

  const sortDir = when === "overdue" ? 1 : -1;
  const tasks = await Task.find(filter).sort({ dueDate: sortDir, priority: -1 }).populate("project", "name").lean();
  res.json({ tasks });
});

tasksRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(taskSchema, req.body);
    const task = await Task.create({ ...emptyToUndef(data as any), owner: req.ownerId, dueTime: data.dueTime || undefined, notes: data.notes || undefined });
    res.status(201).json({ task });
  } catch (e) {
    next(e);
  }
});

tasksRouter.put("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(taskUpdateSchema, req.body);
    if (data.status === "done") (data as any).doneAt = new Date();
    if (data.status && data.status !== "done") (data as any).doneAt = null;
    const task = await Task.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: { ...emptyToUndef(data as any), ...((data as any).doneAt === null ? {} : {}) } }, { new: true, runValidators: true });
    if (!task) throw new ApiError(404, "Task not found");
    res.json({ task });
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/:id/complete", async (req: AuthedRequest, res, next) => {
  try {
    const task = await Task.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: { status: "done", doneAt: new Date() } }, { new: true });
    if (!task) throw new ApiError(404, "Task not found");
    res.json({ task });
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/:id/reopen", async (req: AuthedRequest, res, next) => {
  try {
    const task = await Task.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: { status: "todo", doneAt: null } }, { new: true });
    if (!task) throw new ApiError(404, "Task not found");
    res.json({ task });
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/:id/reschedule", async (req: AuthedRequest, res, next) => {
  try {
    const { dueDate } = req.body as { dueDate?: string };
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new ApiError(400, "Provide a date YYYY-MM-DD");
    const task = await Task.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: { dueDate, status: "todo", doneAt: null } }, { new: true });
    if (!task) throw new ApiError(404, "Task not found");
    res.json({ task });
  } catch (e) {
    next(e);
  }
});

tasksRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
    if (!task) throw new ApiError(404, "Task not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── Site diary ───────────────────────────────────────────────
diaryRouter.get("/", async (req: AuthedRequest, res) => {
  const { project, from, to } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { owner: req.ownerId };
  if (project) filter.project = new Types.ObjectId(project);
  if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const entries = await SiteDiaryEntry.find(filter).sort({ date: -1 }).populate("project", "name").populate("photos").lean();
  res.json({ entries });
});

diaryRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(diarySchema, req.body);
    const project = await Project.findOne({ _id: data.project, owner: req.ownerId });
    if (!project) throw new ApiError(404, "Project not found");

    const photos = await DocumentFile.find({ _id: { $in: data.photoIds }, owner: req.ownerId });
    if (photos.length !== data.photoIds.length) throw new ApiError(400, "One or more photos were not found");

    const entry = await SiteDiaryEntry.create({
      owner: req.ownerId,
      project: data.project,
      date: data.date,
      workDone: data.workDone || undefined,
      workersPresent: data.workersPresent ?? undefined,
      materialsDelivered: data.materialsDelivered || undefined,
      issues: data.issues || undefined,
      decisions: data.decisions || undefined,
      nextPlan: data.nextPlan || undefined,
      progress: data.progress ?? undefined,
      photos: data.photoIds.map((id) => new Types.ObjectId(id)),
    });

    // apply progress update to project if given
    if (data.progress !== null && data.progress !== undefined) {
      await Project.updateOne({ _id: data.project, owner: req.ownerId }, { $set: { progress: data.progress } });
    }

    res.status(201).json({ entry });
  } catch (e) {
    next(e);
  }
});

diaryRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const entry = await SiteDiaryEntry.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
    if (!entry) throw new ApiError(404, "Diary entry not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── Notes ────────────────────────────────────────────────────
notesRouter.get("/", async (req: AuthedRequest, res) => {
  const { project, worker, supplier, q } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { owner: req.ownerId };
  if (project) filter.project = new Types.ObjectId(project);
  if (worker) filter.linkedWorker = new Types.ObjectId(worker);
  if (supplier) filter.linkedSupplier = new Types.ObjectId(supplier);
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.body = rx;
  }
  const notes = await Note.find(filter).sort({ pinned: -1, updatedAt: -1 }).populate("project", "name").lean();
  res.json({ notes });
});

notesRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(noteSchema, req.body);
    const note = await Note.create({ ...data, owner: req.ownerId, linkedWorker: data.linkedWorker || undefined, linkedSupplier: data.linkedSupplier || undefined, linkedTask: data.linkedTask || undefined, project: data.project || undefined });
    res.status(201).json({ note });
  } catch (e) {
    next(e);
  }
});

notesRouter.put("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(noteSchema.partial(), req.body);
    const note = await Note.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: data }, { new: true, runValidators: true });
    if (!note) throw new ApiError(404, "Note not found");
    res.json({ note });
  } catch (e) {
    next(e);
  }
});

notesRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const note = await Note.findOneAndDelete({ _id: req.params.id, owner: req.ownerId });
    if (!note) throw new ApiError(404, "Note not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
