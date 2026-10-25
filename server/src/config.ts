import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    console.error("Copy server/.env.example to server/.env and fill it in.");
    process.exit(1);
  }
  return v;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT || 8787),
  isProd,
  mongoUri: required("MONGODB_URI", isProd ? undefined : "mongodb://127.0.0.1:27017/ambe_construction"),
  authSecret: required("AUTH_SECRET", isProd ? undefined : "dev-only-insecure-secret"),
  authTokenDays: Number(process.env.AUTH_TOKEN_DAYS || 30),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  cloudinaryUrl: process.env.CLOUDINARY_URL || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  uploadsDir: process.env.UPLOADS_DIR || "data/uploads",
};

export const clientOrigins = (
  (process.env.CLIENT_URLS || config.clientUrl)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
