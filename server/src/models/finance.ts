import mongoose, { Schema, Types } from "mongoose";

export type TxType =
  | "customer_payment"
  | "other_income"
  | "expense"
  | "worker_wage"
  | "worker_advance"
  | "supplier_payment"
  | "owner_capital";

export type PaymentMethod = "cash" | "upi" | "bank" | "cheque" | "other";

export const EXPENSE_CATEGORIES = [
  "material",
  "labor",
  "transport",
  "equipment",
  "fuel",
  "food",
  "professional",
  "rent",
  "other",
] as const;

export const OTHER_INCOME_CATEGORIES = ["scrap_sale", "interest", "equipment_hire", "misc"] as const;

export interface IBillAllocation {
  bill: Types.ObjectId;
  amount: number; // paise
}

export interface ITransaction {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  type: TxType;
  category?: string;
  project?: Types.ObjectId;
  worker?: Types.ObjectId;
  supplier?: Types.ObjectId;
  settlement?: Types.ObjectId;
  installment?: Types.ObjectId; // project installment this customer payment counts against
  amount: number; // paise, always positive
  date: string; // YYYY-MM-DD
  method: PaymentMethod;
  refNo?: string;
  paidTo?: string;
  description?: string;
  notes?: string;
  billAllocations: IBillAllocation[];
  openingBalance: boolean;
  status: "active" | "void";
  voidReason?: string;
  voidedAt?: Date;
  clientRequestId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const txSchema = new Schema<ITransaction>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      required: true,
      enum: ["customer_payment", "other_income", "expense", "worker_wage", "worker_advance", "supplier_payment", "owner_capital"],
    },
    category: String,
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    worker: { type: Schema.Types.ObjectId, ref: "Worker" },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier" },
    settlement: { type: Schema.Types.ObjectId, ref: "WageSettlement" },
    installment: { type: Schema.Types.ObjectId },
    amount: { type: Number, required: true, min: 1 },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    method: { type: String, enum: ["cash", "upi", "bank", "cheque", "other"], default: "cash" },
    refNo: String,
    paidTo: String,
    description: String,
    notes: String,
    billAllocations: {
      type: [{ bill: { type: Schema.Types.ObjectId, ref: "SupplierBill", required: true }, amount: { type: Number, required: true, min: 1 } }],
      default: [],
    },
    openingBalance: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "void"], default: "active" },
    voidReason: String,
    voidedAt: Date,
    clientRequestId: { type: String },
  },
  { timestamps: true }
);

txSchema.index({ owner: 1, date: -1 });
txSchema.index({ owner: 1, type: 1, status: 1 });
txSchema.index({ owner: 1, project: 1, status: 1 });
txSchema.index({ owner: 1, worker: 1 });
txSchema.index({ owner: 1, supplier: 1 });
// Duplicate-submission protection: same client request id can only be stored once.
// A partial filter expression is required here — a compound *sparse* index would still
// index every document (sparse only skips docs missing ALL indexed fields, and owner
// is always present), making a second normal transaction impossible.
txSchema.index(
  { owner: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $exists: true, $type: "string" } } }
);

export const Transaction = mongoose.model<ITransaction>("Transaction", txSchema);
