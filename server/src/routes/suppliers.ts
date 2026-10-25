import { Router } from "express";
import { Types } from "mongoose";
import { Supplier, SupplierBill } from "../models/supplier.js";
import { Material, StockMovement } from "../models/inventory.js";
import { Transaction } from "../models/finance.js";
import { AuditLog } from "../models/misc.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { z, type ZodTypeAny } from "zod";
import { supplierSchema, supplierUpdateSchema, supplierBillSchema, materialSchema, stockMovementSchema, voidSchema } from "../validation.js";
import { ApiError } from "../errors.js";
import { supplierOutstanding } from "../calc/dues.js";
import { todayIST } from "../calc/money.js";

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

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

suppliersRouter.get("/", async (req: AuthedRequest, res) => {
  const q = String(req.query.q || "").trim();
  const filter: Record<string, unknown> = { owner: req.ownerId };
  if (req.query.active === "true") filter.active = true;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { phone: rx }, { materials: rx }];
  }
  const suppliers = await Supplier.find(filter).sort({ active: -1, name: 1 }).lean();
  const withBalances = await Promise.all(
    (suppliers as any[]).map(async (s) => ({ ...s, outstanding: await supplierOutstanding(String(s._id), req.ownerId!) }))
  );
  res.json({ suppliers: withBalances });
});

suppliersRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(supplierSchema, req.body);
    const supplier = await Supplier.create({ ...emptyToUndef(data as any), owner: req.ownerId });
    await AuditLog.create({ owner: req.ownerId, action: "supplier.create", entity: "Supplier", entityId: supplier._id, summary: `Added supplier ${supplier.name}` });
    res.status(201).json({ supplier });
  } catch (e) {
    next(e);
  }
});

suppliersRouter.put("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(supplierUpdateSchema, req.body);
    const supplier = await Supplier.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: emptyToUndef(data as any) }, { new: true, runValidators: true });
    if (!supplier) throw new ApiError(404, "Supplier not found");
    res.json({ supplier });
  } catch (e) {
    next(e);
  }
});

suppliersRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const supplier = await Supplier.findOne({ _id: req.params.id, owner: req.ownerId }).lean();
    if (!supplier) throw new ApiError(404, "Supplier not found");
    const [bills, payments] = await Promise.all([
      SupplierBill.find({ owner: req.ownerId, supplier: supplier._id }).sort({ billDate: -1 }).populate("project", "name").lean(),
      Transaction.find({ owner: req.ownerId, supplier: supplier._id, type: "supplier_payment", status: "active" }).sort({ date: -1 }).populate("project", "name").lean(),
    ]);
    res.json({ supplier, bills, payments, outstanding: await supplierOutstanding(String(supplier._id), req.ownerId!) });
  } catch (e) {
    next(e);
  }
});

// Bills
suppliersRouter.get("/bills", async (req: AuthedRequest, res) => {
  const { supplier, project, status, from, to } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { owner: req.ownerId };
  if (supplier) filter.supplier = new Types.ObjectId(supplier);
  if (project) filter.project = new Types.ObjectId(project);
  if (from || to) filter.billDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const bills = (await SupplierBill.find(filter).sort({ billDate: -1 }).populate("supplier", "name").populate("project", "name").lean()) as any[];
  const filtered = bills.filter((b) => {
    if (status === "unpaid") return b.total - (b.amountPaid || 0) > 0;
    if (status === "paid") return b.total - (b.amountPaid || 0) <= 0;
    return true;
  });
  res.json({ bills: filtered });
});

suppliersRouter.post("/bills", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(supplierBillSchema, req.body);
    const supplier = await Supplier.findOne({ _id: data.supplier, owner: req.ownerId });
    if (!supplier) throw new ApiError(404, "Supplier not found");
    if (data.project) {
      const p = await (await import("../models/project.js")).Project.findOne({ _id: data.project, owner: req.ownerId });
      if (!p) throw new ApiError(404, "Project not found");
    }
    const bill = await SupplierBill.create({
      ...emptyToUndef(data as any),
      dueDate: data.dueDate || undefined,
      owner: req.ownerId,
      amountPaid: 0,
      openingBalance: !!req.body.openingBalance,
    });
    await AuditLog.create({ owner: req.ownerId, action: "bill.create", entity: "SupplierBill", entityId: bill._id, summary: `Bill ₹${(bill.total / 100).toLocaleString("en-IN")} from ${supplier.name}: ${bill.description}` });
    res.status(201).json({ bill });
  } catch (e) {
    next(e);
  }
});

suppliersRouter.put("/bills/:id", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(supplierBillSchema.partial(), req.body);
    const existing = (await SupplierBill.findOne({ _id: req.params.id, owner: req.ownerId })) as any;
    if (!existing) throw new ApiError(404, "Bill not found");
    if ((existing.amountPaid || 0) > 0 && (data.total !== undefined || data.subtotal !== undefined || data.tax !== undefined)) {
      throw new ApiError(400, "This bill already has payments recorded. Void the payments first, then edit the bill.");
    }
    const bill = await SupplierBill.findOneAndUpdate({ _id: req.params.id, owner: req.ownerId }, { $set: emptyToUndef(data as any) }, { new: true, runValidators: true });
    await AuditLog.create({ owner: req.ownerId, action: "bill.update", entity: "SupplierBill", entityId: bill!._id, summary: `Updated supplier bill` });
    res.json({ bill });
  } catch (e) {
    next(e);
  }
});

suppliersRouter.post("/bills/:id/void", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(voidSchema, req.body);
    const bill = (await SupplierBill.findOne({ _id: req.params.id, owner: req.ownerId })) as any;
    if (!bill) throw new ApiError(404, "Bill not found");
    if ((bill.amountPaid || 0) > 0) throw new ApiError(400, "Void the payments against this bill first.");
    await bill.deleteOne();
    await AuditLog.create({ owner: req.ownerId, action: "bill.void", entity: "SupplierBill", entityId: bill._id, summary: `Removed bill ₹${(bill.total / 100).toLocaleString("en-IN")} (${data.reason})` });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Materials / inventory
suppliersRouter.get("/materials", async (req: AuthedRequest, res) => {
  const materials = (await Material.find({ owner: req.ownerId, archived: false }).sort({ name: 1 }).populate("project", "name").lean()) as any[];
  const withStock = await Promise.all(
    materials.map(async (m) => {
      const agg = await StockMovement.aggregate<{ total: number }>([
        { $match: { owner: new Types.ObjectId(req.ownerId!), material: m._id } },
        { $group: { _id: null, total: { $sum: "$qty" } } },
      ]);
      return { ...m, stock: agg[0]?.total ?? 0 };
    })
  );
  res.json({ materials: withStock });
});

suppliersRouter.post("/materials", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(materialSchema, req.body);
    const material = await Material.create({ ...emptyToUndef(data as any), owner: req.ownerId });
    res.status(201).json({ material });
  } catch (e) {
    next(e);
  }
});

suppliersRouter.post("/materials/:id/movements", async (req: AuthedRequest, res, next) => {
  try {
    const data = parseOr400(stockMovementSchema, req.body);
    const material = await Material.findOne({ _id: data.material, owner: req.ownerId });
    if (!material) throw new ApiError(404, "Material not found");

    if (data.qty < 0 && !data.confirmNegative) {
      const agg = await StockMovement.aggregate<{ total: number }>([
        { $match: { owner: new Types.ObjectId(req.ownerId!), material: material._id } },
        { $group: { _id: null, total: { $sum: "$qty" } } },
      ]);
      if ((agg[0]?.total ?? 0) + data.qty < 0) {
        throw new ApiError(400, "This would make stock negative. Confirm if stock records are behind reality.", { needsConfirmation: "negative_stock" });
      }
    }

    const mv = await StockMovement.create({ ...data, owner: req.ownerId, note: data.note || undefined, confirmedNegative: data.confirmNegative || false });
    res.status(201).json({ movement: mv });
  } catch (e) {
    next(e);
  }
});

suppliersRouter.get("/materials/:id/movements", async (req: AuthedRequest, res) => {
  const movements = await StockMovement.find({ owner: req.ownerId, material: req.params.id }).sort({ date: -1 }).limit(200).lean();
  res.json({ movements });
});
