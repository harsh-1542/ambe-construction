import { z } from "zod";

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const amountPaise = z.number().int().min(1, "Amount must be more than zero");
export const optionalId = z.string().regex(/^[0-9a-fA-F]{24}$/).optional().or(z.literal("").transform(() => undefined)).or(z.null().transform(() => undefined));
export const requiredId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const setupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_.@-]+$/, "Letters, numbers, dot, dash, underscore, @ only"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export const companySettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  language: z.enum(["en", "hi", "gu"]).default("en"),
  reportFooter: z.string().max(300).optional().or(z.literal("")),
});

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(150),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  mapLink: z.string().trim().url("Not a valid URL").max(500).optional().or(z.literal("")).or(z.null().transform(() => "")),
  type: z.enum(["residential", "commercial", "shop", "renovation", "other"]),
  status: z.enum(["planning", "active", "onhold", "completed", "cancelled"]),
  contractAmount: amountPaise,
  estimatedCost: z.number().int().min(0).nullable().optional(),
  scopeNotes: z.string().max(3000).optional().or(z.literal("")),
  startDate: dateStr.optional().or(z.literal("")),
  expectedEndDate: dateStr.optional().or(z.literal("")),
  actualEndDate: dateStr.optional().or(z.literal("")),
  progress: z.number().int().min(0).max(100).default(0),
  supervisorNotes: z.string().max(2000).optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

export const projectUpdateSchema = projectSchema.partial();

export const variationSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount: z.number().int().refine((v) => v !== 0, "Amount cannot be zero"),
  date: dateStr,
  approved: z.boolean().default(false),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const installmentSchema = z.object({
  label: z.string().trim().min(1).max(120),
  amount: amountPaise,
  dueDate: dateStr,
});

export const transactionBaseSchema = z.object({
  amount: amountPaise,
  date: dateStr,
  method: z.enum(["cash", "upi", "bank", "cheque", "other"]).default("cash"),
  refNo: z.string().trim().max(60).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  clientRequestId: z.string().trim().max(80).optional().or(z.literal("")),
});

export const customerPaymentSchema = transactionBaseSchema.extend({
  project: requiredId,
  installment: optionalId,
  paidTo: z.string().trim().max(120).optional().or(z.literal("")),
});

export const otherIncomeSchema = transactionBaseSchema.extend({
  category: z.enum(["scrap_sale", "interest", "equipment_hire", "misc"]).default("misc"),
  project: optionalId,
  paidTo: z.string().trim().max(120).optional().or(z.literal("")),
});

export const expenseSchema = transactionBaseSchema.extend({
  category: z.enum(["material", "labor", "transport", "equipment", "fuel", "food", "professional", "rent", "other"]),
  project: optionalId,
  paidTo: z.string().trim().max(120).optional().or(z.literal("")),
});

export const workerWageSchema = transactionBaseSchema.extend({
  worker: requiredId,
  project: optionalId,
  settlement: optionalId,
  paidTo: z.string().trim().max(120).optional().or(z.literal("")),
});

export const workerAdvanceSchema = transactionBaseSchema.extend({
  worker: requiredId,
  project: optionalId,
});

export const supplierPaymentSchema = transactionBaseSchema.extend({
  supplier: requiredId,
  project: optionalId,
  billAllocations: z.array(z.object({ bill: requiredId, amount: amountPaise })).max(50).default([]),
});

export const ownerCapitalSchema = transactionBaseSchema.extend({});

export const workerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  role: z.string().trim().max(80).optional().or(z.literal("")),
  wageType: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  wageRate: amountPaise,
  joiningDate: dateStr.optional().or(z.literal("")),
  active: z.boolean().default(true),
  openingWagesDue: z.number().int().min(0).default(0),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const workerUpdateSchema = workerSchema.partial();

export const attendanceSchema = z.object({
  worker: requiredId,
  project: optionalId,
  date: dateStr,
  status: z.enum(["present", "half", "absent", "paid_leave"]),
  rateOverride: z.number().int().min(0).nullable().optional(),
  extraAmount: z.number().int().min(0).nullable().optional(),
  note: z.string().max(300).optional().or(z.literal("")),
});

export const attendanceBulkSchema = z.object({
  date: dateStr,
  project: optionalId,
  entries: z.array(z.object({ worker: requiredId, status: z.enum(["present", "half", "absent", "paid_leave"]), extraAmount: z.number().int().min(0).nullable().optional() })).min(1).max(100),
});

export const settlementSchema = z.object({
  worker: requiredId,
  from: dateStr,
  to: dateStr,
  grossSettled: z.number().int().min(0),
  advanceDeducted: z.number().int().min(0).default(0),
  amountPaid: z.number().int().min(0),
  includesOpeningDue: z.boolean().default(false),
  method: z.enum(["cash", "upi", "bank", "cheque", "other"]).default("cash"),
  date: dateStr,
  project: optionalId,
  note: z.string().max(500).optional().or(z.literal("")),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  materials: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  active: z.boolean().default(true),
});

export const supplierUpdateSchema = supplierSchema.partial();

export const billItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  qty: z.number().min(0),
  unit: z.string().trim().min(1).max(20),
  unitPrice: z.number().int().min(0),
});

export const supplierBillSchema = z.object({
  supplier: requiredId,
  project: optionalId,
  billDate: dateStr,
  dueDate: dateStr.optional().or(z.literal("")),
  description: z.string().trim().min(1).max(300),
  items: z.array(billItemSchema).max(100).default([]),
  subtotal: z.number().int().min(0),
  tax: z.number().int().min(0).default(0),
  total: amountPaise,
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  project: optionalId,
  category: z.enum(["call", "visit", "order", "payment", "site", "other"]).default("other"),
  dueDate: dateStr,
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const taskUpdateSchema = taskSchema.partial();

export const diarySchema = z.object({
  project: requiredId,
  date: dateStr,
  workDone: z.string().max(3000).optional().or(z.literal("")),
  workersPresent: z.number().int().min(0).nullable().optional(),
  materialsDelivered: z.string().max(1000).optional().or(z.literal("")),
  issues: z.string().max(2000).optional().or(z.literal("")),
  decisions: z.string().max(2000).optional().or(z.literal("")),
  nextPlan: z.string().max(2000).optional().or(z.literal("")),
  progress: z.number().int().min(0).max(100).nullable().optional(),
  photoIds: z.array(requiredId).max(20).default([]),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  project: optionalId,
  linkedWorker: optionalId,
  linkedSupplier: optionalId,
  linkedTask: optionalId,
  pinned: z.boolean().default(false),
});

export const materialSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(20),
  project: optionalId,
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const stockMovementSchema = z.object({
  material: requiredId,
  type: z.enum(["purchase", "usage", "adjustment"]),
  qty: z.number().refine((v) => v !== 0, "Quantity cannot be zero"),
  date: dateStr,
  note: z.string().max(300).optional().or(z.literal("")),
  confirmNegative: z.boolean().optional(),
});

export const voidSchema = z.object({
  reason: z.string().trim().min(3, "Give a short reason for the correction").max(500),
});
