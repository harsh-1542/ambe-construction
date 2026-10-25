import { Router } from "express";
import { Types } from "mongoose";
import { Project } from "../models/project.js";
import { Worker } from "../models/people.js";
import { Supplier, SupplierBill } from "../models/supplier.js";
import { Transaction } from "../models/finance.js";
import { Task, Note, DocumentFile } from "../models/misc.js";
import { requireAuth, AuthedRequest } from "../auth.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

function rx(q: string) {
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

searchRouter.get("/", async (req: AuthedRequest, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ results: [] });
  const ownerId = req.ownerId!;
  const pattern = rx(q);

  const [projects, workers, suppliers, txns, tasks, notes, docs] = await Promise.all([
    Project.find({ owner: ownerId, $or: [{ name: pattern }, { customerName: pattern }, { customerPhone: pattern }, { address: pattern }] }).limit(8).lean(),
    Worker.find({ owner: ownerId, $or: [{ name: pattern }, { phone: pattern }, { role: pattern }] }).limit(8).lean(),
    Supplier.find({ owner: ownerId, $or: [{ name: pattern }, { phone: pattern }, { materials: pattern }] }).limit(8).lean(),
    Transaction.find({ owner: ownerId, $or: [{ description: pattern }, { paidTo: pattern }, { refNo: pattern }, { notes: pattern }] })
      .sort({ date: -1 })
      .limit(8)
      .populate("project", "name")
      .lean(),
    Task.find({ owner: ownerId, $or: [{ title: pattern }, { notes: pattern }] }).limit(6).lean(),
    Note.find({ owner: ownerId, body: pattern }).limit(6).populate("project", "name").lean(),
    DocumentFile.find({ owner: ownerId, $or: [{ title: pattern }, { fileName: pattern }, { description: pattern }] }).limit(6).populate("project", "name").lean(),
  ]);

  const results = [
    ...projects.map((p) => ({ kind: "project", id: String(p._id), title: p.name, subtitle: p.customerName, link: `/projects/${p._id}` })),
    ...workers.map((w) => ({ kind: "worker", id: String(w._id), title: w.name, subtitle: w.role || "Worker", link: `/workers/${w._id}` })),
    ...suppliers.map((s) => ({ kind: "supplier", id: String(s._id), title: s.name, subtitle: s.materials || "Supplier", link: `/suppliers/${s._id}` })),
    ...txns.map((t: any) => ({ kind: "txn", id: String(t._id), title: t.description || t.paidTo || t.type, subtitle: `₹${(t.amount / 100).toLocaleString("en-IN")} · ${t.date}${t.project ? " · " + t.project.name : ""}`, link: `/money?txn=${t._id}` })),
    ...tasks.map((t) => ({ kind: "task", id: String(t._id), title: t.title, subtitle: t.dueDate, link: "/tasks" })),
    ...notes.map((n: any) => ({ kind: "note", id: String(n._id), title: n.body.slice(0, 80), subtitle: n.project ? n.project.name : "Note", link: "/notes" })),
    ...docs.map((d: any) => ({ kind: "doc", id: String(d._id), title: d.title, subtitle: d.project ? d.project.name : d.category, link: `/documents` })),
  ];

  res.json({ results });
});
