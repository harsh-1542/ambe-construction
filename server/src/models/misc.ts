import mongoose, { Schema, Types } from "mongoose";

export interface ITask {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  title: string;
  project?: Types.ObjectId;
  category: "call" | "visit" | "order" | "payment" | "site" | "other";
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
  notes?: string;
  doneAt?: Date;
  linkedCustomerPayment?: Types.ObjectId;
  linkedWorker?: Types.ObjectId;
  linkedSupplier?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    category: { type: String, enum: ["call", "visit", "order", "payment", "site", "other"], default: "other" },
    dueDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    dueTime: String,
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    status: { type: String, enum: ["todo", "in_progress", "done"], default: "todo" },
    notes: String,
    doneAt: Date,
    linkedCustomerPayment: { type: Schema.Types.ObjectId, ref: "Transaction" },
    linkedWorker: { type: Schema.Types.ObjectId, ref: "Worker" },
    linkedSupplier: { type: Schema.Types.ObjectId, ref: "Supplier" },
  },
  { timestamps: true }
);

taskSchema.index({ owner: 1, status: 1, dueDate: 1 });

export const Task = mongoose.model<ITask>("Task", taskSchema);

export interface ISiteDiaryEntry {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  date: string;
  workDone?: string;
  workersPresent?: number;
  materialsDelivered?: string;
  issues?: string;
  decisions?: string;
  nextPlan?: string;
  progress?: number; // optional new progress % for the project
  photos: Types.ObjectId[]; // DocumentFile refs
  createdAt: Date;
  updatedAt: Date;
}

const diarySchema = new Schema<ISiteDiaryEntry>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    workDone: String,
    workersPresent: { type: Number, min: 0 },
    materialsDelivered: String,
    issues: String,
    decisions: String,
    nextPlan: String,
    progress: { type: Number, min: 0, max: 100 },
    photos: { type: [Schema.Types.ObjectId], ref: "DocumentFile", default: [] },
  },
  { timestamps: true }
);

diarySchema.index({ owner: 1, project: 1, date: -1 });

export const SiteDiaryEntry = mongoose.model<ISiteDiaryEntry>("SiteDiaryEntry", diarySchema);

export type DocCategory =
  | "contract"
  | "quotation"
  | "variation"
  | "supplier_invoice"
  | "receipt"
  | "site_photo"
  | "plan"
  | "other";

export interface IDocumentFile {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  title: string;
  category: DocCategory;
  project?: Types.ObjectId;
  description?: string;
  fileName: string;
  mimeType: string;
  size: number;
  storage: "local" | "cloudinary";
  localPath?: string;
  cloudUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const docSchema = new Schema<IDocumentFile>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["contract", "quotation", "variation", "supplier_invoice", "receipt", "site_photo", "plan", "other"],
      default: "other",
    },
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    description: String,
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    storage: { type: String, enum: ["local", "cloudinary"], default: "local" },
    localPath: String,
    cloudUrl: String,
  },
  { timestamps: true }
);

docSchema.index({ owner: 1, category: 1 });
docSchema.index({ owner: 1, project: 1 });

export const DocumentFile = mongoose.model<IDocumentFile>("DocumentFile", docSchema);

export interface INote {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  body: string;
  project?: Types.ObjectId;
  linkedWorker?: Types.ObjectId;
  linkedSupplier?: Types.ObjectId;
  linkedTask?: Types.ObjectId;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new Schema<INote>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    linkedWorker: { type: Schema.Types.ObjectId, ref: "Worker" },
    linkedSupplier: { type: Schema.Types.ObjectId, ref: "Supplier" },
    linkedTask: { type: Schema.Types.ObjectId, ref: "Task" },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

noteSchema.index({ owner: 1, pinned: -1, updatedAt: -1 });

export const Note = mongoose.model<INote>("Note", noteSchema);

export interface IAuditLog {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  action: string; // e.g. "transaction.create"
  entity: string;
  entityId?: Types.ObjectId;
  summary: string;
  changes?: unknown;
  at: Date;
}

const auditSchema = new Schema<IAuditLog>({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  action: String,
  entity: String,
  entityId: Schema.Types.ObjectId,
  summary: String,
  changes: Schema.Types.Mixed,
  at: { type: Date, default: Date.now, index: true },
});

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditSchema);
