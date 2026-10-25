import mongoose, { Schema } from "mongoose";

export interface ISupplier {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  name: string;
  phone?: string;
  address?: string;
  materials?: string;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    phone: String,
    address: String,
    materials: String,
    notes: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

supplierSchema.index({ owner: 1, name: 1 });

export const Supplier = mongoose.model<ISupplier>("Supplier", supplierSchema);

export interface IBillItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number; // paise
}

export interface ISupplierBill {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  supplier: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId;
  billDate: string; // YYYY-MM-DD
  dueDate?: string;
  description: string;
  items: mongoose.Types.DocumentArray<IBillItem>;
  subtotal: number; // paise
  tax: number; // paise
  total: number; // paise
  amountPaid: number; // paise, from payment allocations (computed on read)
  invoiceDoc?: mongoose.Types.ObjectId;
  notes?: string;
  openingBalance: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const billItemSchema = new Schema<IBillItem>(
  {
    description: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "pcs" },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const billSchema = new Schema<ISupplierBill>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    billDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    dueDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    description: { type: String, required: true, trim: true },
    items: { type: [billItemSchema], default: [] },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 1 },
    amountPaid: { type: Number, default: 0 }, // denormalised, recomputed on payment create/void
    invoiceDoc: { type: Schema.Types.ObjectId, ref: "DocumentFile" },
    notes: String,
    openingBalance: { type: Boolean, default: false },
  },
  { timestamps: true }
);

billSchema.index({ owner: 1, supplier: 1, status: 1 });
billSchema.index({ owner: 1, project: 1 });

export const SupplierBill = mongoose.model<ISupplierBill>("SupplierBill", billSchema);
