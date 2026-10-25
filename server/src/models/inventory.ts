import mongoose, { Schema } from "mongoose";

export interface IMaterial {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId;
  name: string;
  unit: string;
  notes?: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const materialSchema = new Schema<IMaterial>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    name: { type: String, required: true, trim: true },
    unit: { type: String, required: true, default: "pcs" },
    notes: String,
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

materialSchema.index({ owner: 1, name: 1 });
materialSchema.index({ owner: 1, project: 1 });

export const Material = mongoose.model<IMaterial>("Material", materialSchema);

export interface IStockMovement {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  material: mongoose.Types.ObjectId;
  type: "purchase" | "usage" | "adjustment";
  qty: number; // signed: +in / -out for usage
  date: string;
  note?: string;
  bill?: mongoose.Types.ObjectId;
  confirmedNegative?: boolean;
  createdAt: Date;
}

const movementSchema = new Schema<IStockMovement>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    material: { type: Schema.Types.ObjectId, ref: "Material", required: true },
    type: { type: String, enum: ["purchase", "usage", "adjustment"], required: true },
    qty: { type: Number, required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    note: String,
    bill: { type: Schema.Types.ObjectId, ref: "SupplierBill" },
    confirmedNegative: { type: Boolean, default: false },
  },
  { timestamps: true }
);

movementSchema.index({ owner: 1, material: 1, date: 1 });

export const StockMovement = mongoose.model<IStockMovement>("StockMovement", movementSchema);
