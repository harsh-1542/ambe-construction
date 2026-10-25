import mongoose, { Schema, type Model } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  verifyPassword(plain: string): boolean;
}

export type UserModelType = Model<IUser, {}, IUserMethods>;

const userSchema = new Schema<IUser, UserModelType, IUserMethods>(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = function (plain: string): boolean {
  return bcrypt.compareSync(plain, this.passwordHash);
};

export const User = mongoose.model<IUser, UserModelType>("User", userSchema);

export interface ICompanySettings {
  owner: mongoose.Types.ObjectId;
  companyName: string;
  phone?: string;
  address?: string;
  language: "en" | "hi" | "gu";
  currency: string;
  timezone: string;
  openingCash: number; // paise
  setupCompleted: boolean;
  setupStep?: number;
  reportFooter?: string;
}

const companySettingsSchema = new Schema<ICompanySettings>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    companyName: { type: String, required: true, default: "Ambe Construction" },
    phone: String,
    address: String,
    language: { type: String, enum: ["en", "hi", "gu"], default: "en" },
    currency: { type: String, default: "INR" },
    timezone: { type: String, default: "Asia/Kolkata" },
    openingCash: { type: Number, default: 0 },
    setupCompleted: { type: Boolean, default: false },
    setupStep: { type: Number, default: 0 },
    reportFooter: String,
  },
  { timestamps: true }
);

export const CompanySettings = mongoose.model<ICompanySettings>("CompanySettings", companySettingsSchema);
