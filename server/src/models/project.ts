import mongoose, { Schema } from "mongoose";

export type ProjectStatus = "planning" | "active" | "onhold" | "completed" | "cancelled";
export type ProjectType = "residential" | "commercial" | "shop" | "renovation" | "other";

export interface IInstallment {
  _id: mongoose.Types.ObjectId;
  label: string;
  amount: number; // paise
  dueDate: string; // YYYY-MM-DD
}

export interface IProject {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  name: string;
  customerName: string;
  customerPhone?: string;
  address?: string;
  mapLink?: string;
  type: ProjectType;
  status: ProjectStatus;
  contractAmount: number; // paise
  estimatedCost?: number; // paise
  scopeNotes?: string;
  startDate?: string; // YYYY-MM-DD
  expectedEndDate?: string; // YYYY-MM-DD
  actualEndDate?: string; // YYYY-MM-DD
  progress: number; // 0-100
  supervisorNotes?: string;
  notes?: string;
  installments: mongoose.Types.DocumentArray<IInstallment>;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const installmentSchema = new Schema<IInstallment>(
  {
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    dueDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  { _id: true }
);

const projectSchema = new Schema<IProject>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    customerPhone: String,
    address: String,
    mapLink: String,
    type: { type: String, enum: ["residential", "commercial", "shop", "renovation", "other"], default: "residential" },
    status: { type: String, enum: ["planning", "active", "onhold", "completed", "cancelled"], default: "active" },
    contractAmount: { type: Number, required: true, min: 1 },
    estimatedCost: { type: Number, min: 0 },
    scopeNotes: String,
    startDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    expectedEndDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    actualEndDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    supervisorNotes: String,
    notes: String,
    installments: { type: [installmentSchema], default: [] },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

projectSchema.index({ owner: 1, status: 1 });
projectSchema.index({ owner: 1, name: 1 });
projectSchema.index({ owner: 1, customerName: 1 });

export const Project = mongoose.model<IProject>("Project", projectSchema);

export interface IVariation {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  description: string;
  amount: number; // paise; positive = extra work, negative = reduction
  date: string; // YYYY-MM-DD
  approved: boolean;
  approvedDate?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const variationSchema = new Schema<IVariation>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true }, // may be negative
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    approved: { type: Boolean, default: false },
    approvedDate: String,
    notes: String,
  },
  { timestamps: true }
);

variationSchema.index({ owner: 1, project: 1 });

export const Variation = mongoose.model<IVariation>("Variation", variationSchema);
