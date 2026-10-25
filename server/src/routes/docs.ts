import { Router, type Response } from "express";
import multer from "multer";
import { Types } from "mongoose";
import { DocumentFile } from "../models/misc.js";
import { SupplierBill } from "../models/supplier.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { ApiError } from "../errors.js";
import { saveLocal, readLocal, deleteLocal, MAX_UPLOAD_BYTES, ALLOWED_MIME } from "../storage.js";
import { config } from "../config.js";

export const docsRouter = Router();
docsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

async function sendDocFile(res: Response, ownerId: string, id: string, download: boolean) {
  const doc = await DocumentFile.findOne({ _id: id, owner: ownerId }).lean();
  if (!doc) throw new ApiError(404, "File not found");
  if (doc.storage === "cloudinary" && doc.cloudUrl) {
    return res.redirect(doc.cloudUrl);
  }
  const buf = doc.localPath ? readLocal(doc.localPath) : null;
  if (!buf) throw new ApiError(404, "File missing from storage");
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(doc.fileName)}"`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buf);
}

docsRouter.get("/", async (req: AuthedRequest, res) => {
  const { project, category, q } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { owner: req.ownerId };
  if (project) filter.project = new Types.ObjectId(project);
  if (category && category !== "all") filter.category = category;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { description: rx }, { fileName: rx }];
  }
  const docs = await DocumentFile.find(filter).sort({ createdAt: -1 }).populate("project", "name").lean();
  res.json({ docs });
});

docsRouter.post(
  "/",
  upload.single("file"),
  async (req: AuthedRequest, res, next) => {
    try {
      const file = req.file;
      if (!file) throw new ApiError(400, "Choose a file to upload");
      if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(400, "File is larger than 15 MB");
      if (!ALLOWED_MIME.includes(file.mimetype)) {
        throw new ApiError(400, `File type ${file.mimetype} is not allowed. Use images, PDF, Word, Excel or text files.`);
      }

      const title = String(req.body.title || file.originalname).trim();
      if (!title) throw new ApiError(400, "Give the document a title");
      const category = String(req.body.category || "other");
      const projectId = req.body.project ? String(req.body.project) : undefined;
      if (projectId) {
        const { Project } = await import("../models/project.js");
        const p = await Project.findOne({ _id: projectId, owner: req.ownerId });
        if (!p) throw new ApiError(404, "Project not found");
      }

      let storage: "local" | "cloudinary" = "local";
      let cloudUrl: string | undefined;
      let localPath: string | undefined;

      if (config.cloudinaryUrl) {
        try {
          const { v2: cloudinary } = await import("cloudinary");
          cloudinary.config({ secure: true });
          const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({ resource_type: "auto" }, (err, r) => (err ? reject(err) : resolve(r as any)));
            stream.end(file.buffer);
          });
          cloudUrl = result.secure_url;
          storage = "cloudinary";
        } catch (err) {
          console.error("[cloudinary] upload failed, storing locally instead:", err);
        }
      }
      if (storage === "local") {
        localPath = saveLocal(file.buffer, file.originalname);
      }

      const doc = await DocumentFile.create({
        owner: req.ownerId,
        title,
        category,
        project: projectId || undefined,
        description: req.body.description ? String(req.body.description) : undefined,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storage,
        localPath,
        cloudUrl,
      });
      res.status(201).json({ doc });
    } catch (e) {
      next(e);
    }
  }
);

docsRouter.get("/:id/file", async (req: AuthedRequest, res, next) => {
  try {
    await sendDocFile(res, req.ownerId!, req.params.id, false);
  } catch (e) {
    next(e);
  }
});

docsRouter.get("/:id/download", async (req: AuthedRequest, res, next) => {
  try {
    await sendDocFile(res, req.ownerId!, req.params.id, true);
  } catch (e) {
    next(e);
  }
});

docsRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const doc = await DocumentFile.findOne({ _id: req.params.id, owner: req.ownerId });
    if (!doc) throw new ApiError(404, "File not found");
    // unlink from bills that reference it
    await SupplierBill.updateOne({ owner: req.ownerId, invoiceDoc: doc._id }, { $unset: { invoiceDoc: 1 } });
    if (doc.storage === "local" && doc.localPath) deleteLocal(doc.localPath);
    await doc.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
