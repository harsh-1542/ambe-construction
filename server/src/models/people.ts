import mongoose, { Schema } from "mongoose";

export type WageType = "daily" | "weekly" | "monthly";
export type AttendanceStatus = "present" | "half" | "absent" | "paid_leave";

export interface IWorker {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  name: string;
  phone?: string;
  role?: string;
  wageType: WageType;
  wageRate: number; // paise per day/week/month
  joiningDate?: string;
  active: boolean;
  openingWagesDue: number; // paise carried in from old records
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const workerSchema = new Schema<IWorker>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    phone: String,
    role: String,
    wageType: { type: String, enum: ["daily", "weekly", "monthly"], default: "daily" },
    wageRate: { type: Number, required: true, min: 1 },
    joiningDate: String,
    active: { type: Boolean, default: true },
    openingWagesDue: { type: Number, default: 0 },
    notes: String,
  },
  { timestamps: true }
);

workerSchema.index({ owner: 1, name: 1 });
workerSchema.index({ owner: 1, active: 1 });

export const Worker = mongoose.model<IWorker>("Worker", workerSchema);

export interface IAttendance {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  worker: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  rateOverride?: number; // paise for this day (daily-rate workers)
  extraAmount?: number; // paise overtime / extra work bonus
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    worker: { type: Schema.Types.ObjectId, ref: "Worker", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, enum: ["present", "half", "absent", "paid_leave"], required: true },
    rateOverride: { type: Number, min: 0 },
    extraAmount: { type: Number, min: 0 },
    note: String,
  },
  { timestamps: true }
);

attendanceSchema.index({ owner: 1, worker: 1, date: 1 }, { unique: true });
attendanceSchema.index({ owner: 1, date: 1 });
attendanceSchema.index({ owner: 1, project: 1, date: 1 });

export const Attendance = mongoose.model<IAttendance>("AttendanceRecord", attendanceSchema);

export interface IWageSettlement {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  worker: mongoose.Types.ObjectId;
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
  grossSettled: number; // paise of earned wages this settlement covers
  advanceDeducted: number; // paise recovered from advances
  amountPaid: number; // paise actually paid in cash
  includesOpeningDue: boolean;
  paymentTx?: mongoose.Types.ObjectId;
  status: "active" | "void";
  voidReason?: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const settlementSchema = new Schema<IWageSettlement>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    worker: { type: Schema.Types.ObjectId, ref: "Worker", required: true },
    from: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    to: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    grossSettled: { type: Number, required: true, min: 0 },
    advanceDeducted: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, min: 0 },
    includesOpeningDue: { type: Boolean, default: false },
    paymentTx: { type: Schema.Types.ObjectId, ref: "Transaction" },
    status: { type: String, enum: ["active", "void"], default: "active" },
    voidReason: String,
    note: String,
  },
  { timestamps: true }
);

settlementSchema.index({ owner: 1, worker: 1 });

export const WageSettlement = mongoose.model<IWageSettlement>("WageSettlement", settlementSchema);
