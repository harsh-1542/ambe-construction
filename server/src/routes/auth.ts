import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { User, CompanySettings } from "../models/user.js";
import { requireAuth, signToken, setAuthCookie, clearAuthCookie, AuthedRequest } from "../auth.js";
import { loginSchema, setupSchema, companySettingsSchema } from "../validation.js";
import { ApiError } from "../errors.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});

async function ownerCount(): Promise<number> {
  return User.countDocuments();
}

/** Is initial owner setup available? */
authRouter.get("/status", async (_req, res) => {
  const count = await ownerCount();
  res.json({ needsSetup: count === 0 });
});

/** One-time owner creation. Refuses if any owner exists. */
authRouter.post("/setup", authLimiter, async (req, res, next) => {
  try {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid setup details", parsed.error.flatten().fieldErrors);
    if ((await ownerCount()) > 0) throw new ApiError(403, "Owner already exists. Sign in instead.");

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await User.create({ name: parsed.data.name, username: parsed.data.username.toLowerCase(), passwordHash });
    await CompanySettings.create({ owner: user._id, companyName: "Ambe Construction", setupCompleted: false });

    setAuthCookie(res, signToken(String(user._id)));
    res.status(201).json({ id: String(user._id), name: user.name, username: user.username, needsSetupWizard: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post("/login", authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Enter username and password");
    const user = await User.findOne({ username: parsed.data.username.toLowerCase() });
    if (!user || !user.verifyPassword(parsed.data.password)) throw new ApiError(401, "Wrong username or password");
    setAuthCookie(res, signToken(String(user._id)));
    const settings = await CompanySettings.findOne({ owner: user._id });
    res.json({ id: String(user._id), name: user.name, username: user.username, needsSetupWizard: !settings?.setupCompleted });
  } catch (e) {
    next(e);
  }
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.ownerId).lean();
  if (!user) return res.status(401).json({ error: "Account not found" });
  const settings = await CompanySettings.findOne({ owner: req.ownerId });
  res.json({
    id: String(user._id),
    name: user.name,
    username: user.username,
    needsSetupWizard: !settings?.setupCompleted,
    settings,
  });
});

authRouter.put("/settings", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = companySettingsSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Invalid settings", parsed.error.flatten().fieldErrors);
    const settings = await CompanySettings.findOneAndUpdate(
      { owner: req.ownerId },
      { $set: parsed.data },
      { new: true, upsert: true }
    );
    res.json(settings);
  } catch (e) {
    next(e);
  }
});

authRouter.post("/settings/complete-setup", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const settings = await CompanySettings.findOneAndUpdate({ owner: req.ownerId }, { $set: { setupCompleted: true } }, { new: true });
    res.json(settings);
  } catch (e) {
    next(e);
  }
});
