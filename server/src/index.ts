import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import fs from "node:fs";
import path from "node:path";
import { config, clientOrigins } from "./config.js";
import { connectDb } from "./db.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { moneyRouter } from "./routes/money.js";
import { workersRouter } from "./routes/workers.js";
import { suppliersRouter } from "./routes/suppliers.js";
import { tasksRouter, diaryRouter, notesRouter } from "./routes/misc.js";
import { docsRouter } from "./routes/docs.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { searchRouter } from "./routes/search.js";
import { reportsRouter } from "./routes/reports.js";
import { aiRouter } from "./routes/ai.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || clientOrigins.includes(origin) || clientOrigins.includes("*")) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
if (!config.isProd) app.use(morgan("dev"));

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/money", moneyRouter);
app.use("/api/workers", workersRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/diary", diaryRouter);
app.use("/api/notes", notesRouter);
app.use("/api/documents", docsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/search", searchRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/ai", aiRouter);

/**
 * Optional single-service mode: if a built client exists (client/dist), serve it
 * from this same origin. API routes above take precedence; unknown non-API GETs
 * fall back to the SPA. Used for one-service deployments (e.g. all-in-one on Render).
 */
const clientDistCandidates = [
  path.resolve(process.cwd(), "client/dist"),
  path.resolve(process.cwd(), "../client/dist"),
];
const clientDist = clientDistCandidates.find((p) => fs.existsSync(path.join(p, "index.html")));
if (clientDist) {
  console.log(`[server] serving client from ${clientDist}`);
  app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

async function main() {
  await connectDb();
  const server = app.listen(config.port, () => {
    console.log(`[server] Ambe Construction OS API on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    console.log("\n[server] shutting down…");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[server] failed to start:", e);
  process.exit(1);
});
