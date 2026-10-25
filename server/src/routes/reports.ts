import { Router } from "express";
import { Types } from "mongoose";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { Project, IProject } from "../models/project.js";
import { Transaction } from "../models/finance.js";
import { Supplier, SupplierBill } from "../models/supplier.js";
import { Worker, Attendance } from "../models/people.js";
import { CompanySettings } from "../models/user.js";
import { Task } from "../models/misc.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { ApiError } from "../errors.js";
import { computeProjectFinancials } from "../calc/projectFinancials.js";
import { supplierOutstanding } from "../calc/dues.js";
import { calcWagesForWorker } from "../calc/wages.js";
import { todayIST } from "../calc/money.js";
import { formatINR } from "../calc/money.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const inr = (p: number) => formatINR(p, { decimals: true });

function pdfHeader(doc: PDFKit.PDFDocument, settings: any, title: string, subtitle?: string) {
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111").text(settings?.companyName || "Ambe Construction");
  if (settings?.phone) doc.font("Helvetica").fontSize(9).fillColor("#555").text(settings.phone);
  if (settings?.address) doc.font("Helvetica").fontSize(9).fillColor("#555").text(settings.address);
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111").text(title);
  if (subtitle) doc.font("Helvetica").fontSize(9).fillColor("#555").text(subtitle);
  doc.font("Helvetica").fontSize(9).fillColor("#555").text(`Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (IST)`);
  if (settings?.reportFooter) doc.moveDown(0.3).fontSize(8).fillColor("#777").text(settings.reportFooter);
  doc.moveDown(0.8);
}

/** Receipt for a customer payment. */
reportsRouter.get("/receipt/:txnId", async (req: AuthedRequest, res, next) => {
  try {
    const txn = await Transaction.findOne({ _id: req.params.txnId, owner: req.ownerId, type: "customer_payment" }).populate("project").lean() as any;
    if (!txn) throw new ApiError(404, "Payment not found");
    const settings = await CompanySettings.findOne({ owner: req.ownerId }).lean();

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="receipt-${txn.date}.pdf"`);
    doc.pipe(res);

    pdfHeader(doc, settings, "Payment Receipt", `Receipt #${String(txn._id).slice(-8).toUpperCase()}`);

    const project = txn.project as any;
    doc.font("Helvetica").fontSize(11).fillColor("#111");
    doc.text(`Received from: ${txn.paidTo || project?.customerName || "Customer"}`, { continued: false });
    if (project) doc.text(`For: ${project.name} (${project.customerName})`);
    doc.text(`Amount: ${inr(txn.amount)}`, { lineGap: 4 });
    doc.font("Helvetica-Bold").fontSize(14).text(`Rupees ${(txn.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
    doc.font("Helvetica").fontSize(11);
    doc.text(`Date: ${txn.date}   Mode: ${txn.method.toUpperCase()}${txn.refNo ? `   Ref: ${txn.refNo}` : ""}`);

    const fin = project ? await computeProjectFinancials(String(project._id), req.ownerId!) : null;
    if (fin) {
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(11).text("Project position");
      doc.font("Helvetica").fontSize(10);
      doc.text(`Contract value: ${inr(fin.revisedContract)}`);
      doc.text(`Total received so far: ${inr(fin.paymentsReceived)}`);
      doc.text(`Balance remaining: ${inr(fin.customerOutstanding)}`);
    }
    if (txn.notes) doc.moveDown(0.5).font("Helvetica").fontSize(9).fillColor("#555").text(`Note: ${txn.notes}`);

    doc.moveDown(2);
    doc.font("Helvetica").fontSize(9).fillColor("#555").text("This is a computer-generated receipt.", { align: "center" });
    doc.end();
  } catch (e) {
    next(e);
  }
});

/** Project financial statement PDF. */
reportsRouter.get("/project-statement/:projectId", async (req: AuthedRequest, res, next) => {
  try {
    const project = (await Project.findOne({ _id: req.params.projectId, owner: req.ownerId }).lean()) as any;
    if (!project) throw new ApiError(404, "Project not found");
    const settings = await CompanySettings.findOne({ owner: req.ownerId }).lean();
    const fin = await computeProjectFinancials(String(project._id), req.ownerId!);
    const txns = await Transaction.find({ owner: req.ownerId, project: project._id, status: "active" }).sort({ date: 1 }).lean();

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="statement-${project.name.replace(/\W+/g, "-")}.pdf"`);
    doc.pipe(res);

    pdfHeader(doc, settings, `Project Statement — ${project.name}`, `${project.customerName}${project.address ? " · " + project.address : ""}`);

    doc.font("Helvetica-Bold").fontSize(11).text("Summary");
    doc.font("Helvetica").fontSize(10);
    const rows: [string, string][] = [
      ["Original contract", inr(fin!.originalContract)],
      ["Approved variations", inr(fin!.approvedVariations)],
      ["Revised contract value", inr(fin!.revisedContract)],
      ["Payments received", inr(fin!.paymentsReceived)],
      ["Customer balance", inr(fin!.customerOutstanding)],
      ["Recorded costs (cash basis)", inr(fin!.expensesRecorded)],
      ["Estimated profit*", inr(fin!.estimatedProfit ?? 0)],
    ];
    for (const [k, v] of rows) doc.text(`${k}:`, { continued: true }).text(v, { align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor("#777").text("*Estimate — profit assumes all costs have been recorded.");
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text("All transactions");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9);
    for (const t of txns) {
      const label = t.type.replace(/_/g, " ");
      doc.fillColor(t.amount && ["customer_payment", "other_income"].includes(t.type) ? "#166534" : "#991b1b");
      doc.text(`${t.date}  ${label.padEnd(20)} ${inr(t.amount)}  ${t.description || ""}`.slice(0, 110));
    }
    doc.end();
  } catch (e) {
    next(e);
  }
});

/** Customer outstanding report — PDF or Excel. */
reportsRouter.get("/customer-outstanding", async (req: AuthedRequest, res, next) => {
  try {
    const format = String(req.query.format || "pdf");
    const projects = (await Project.find({ owner: req.ownerId, archived: false, status: { $nin: ["cancelled"] } }).sort({ name: 1 }).lean()) as unknown as (IProject & { _id: Types.ObjectId })[];
    const finByProject = await Promise.all(projects.map((p) => computeProjectFinancials(String(p._id), req.ownerId!)));
    const settings = await CompanySettings.findOne({ owner: req.ownerId }).lean();
    const rows = projects
      .map((p, i) => ({ project: p, fin: finByProject[i]! }))
      .filter((r) => r.fin.customerOutstanding !== 0)
      .sort((a, b) => b.fin.customerOutstanding - a.fin.customerOutstanding);

    if (format === "excel") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Customer Outstanding");
      ws.columns = [
        { header: "Project", key: "name", width: 28 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Revised contract (₹)", key: "contract", width: 20, style: { numFmt: "#,##0.00" } },
        { header: "Received (₹)", key: "received", width: 20, style: { numFmt: "#,##0.00" } },
        { header: "Outstanding (₹)", key: "outstanding", width: 20, style: { numFmt: "#,##0.00" } },
      ];
      for (const r of rows) {
        ws.addRow({
          name: r.project.name,
          customer: r.project.customerName,
          contract: r.fin.revisedContract / 100,
          received: r.fin.paymentsReceived / 100,
          outstanding: r.fin.customerOutstanding / 100,
        });
      }
      const total = rows.reduce((s, r) => s + r.fin.customerOutstanding, 0) / 100;
      const t = ws.addRow({ name: "TOTAL", outstanding: total });
      t.font = { bold: true };
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="customer-outstanding-${todayIST()}.xlsx"`);
      await wb.xlsx.write(res);
      return res.end();
    }

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="customer-outstanding-${todayIST()}.pdf"`);
    doc.pipe(res);
    pdfHeader(doc, settings, "Customer Outstanding Balances", `As on ${todayIST()}`);
    doc.font("Helvetica").fontSize(10);
    for (const r of rows) {
      doc.fillColor("#111").font("Helvetica-Bold").fontSize(10).text(`${r.project.name} — ${r.project.customerName}`);
      doc.font("Helvetica").fontSize(9).fillColor("#444");
      doc.text(`Contract ${inr(r.fin.revisedContract)} · Received ${inr(r.fin.paymentsReceived)} · `, { continued: true })
        .fillColor(r.fin.customerOutstanding > 0 ? "#991b1b" : "#166534")
        .text(`Balance ${inr(r.fin.customerOutstanding)}`);
      doc.moveDown(0.3);
    }
    const total = rows.reduce((s, r) => s + r.fin.customerOutstanding, 0);
    doc.moveDown(0.5).font("Helvetica-Bold").fontSize(11).fillColor("#111").text(`Total outstanding: ${inr(total)}`);
    doc.end();
  } catch (e) {
    next(e);
  }
});

/** Expenses report (date range, optional project) — PDF or Excel. */
reportsRouter.get("/expenses", async (req: AuthedRequest, res, next) => {
  try {
    const format = String(req.query.format || "pdf");
    const from = String(req.query.from || todayIST().slice(0, 8) + "01");
    const to = String(req.query.to || todayIST());
    const projectId = req.query.project ? String(req.query.project) : undefined;

    const filter: Record<string, unknown> = {
      owner: new Types.ObjectId(req.ownerId),
      status: "active",
      type: { $in: ["expense", "worker_wage", "worker_advance", "supplier_payment"] },
      date: { $gte: from, $lte: to },
    };
    if (projectId) filter.project = new Types.ObjectId(projectId);
    const txns = await Transaction.find(filter).sort({ date: 1 }).populate("project", "name").populate("worker", "name").populate("supplier", "name").lean() as any[];
    const settings = await CompanySettings.findOne({ owner: req.ownerId }).lean();
    const project = projectId ? await Project.findOne({ _id: projectId, owner: req.ownerId }).lean() : null;
    const total = txns.reduce((s, t) => s + t.amount, 0);

    if (format === "excel") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Expenses");
      ws.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "Type", key: "type", width: 16 },
        { header: "Category", key: "category", width: 14 },
        { header: "Project", key: "project", width: 24 },
        { header: "Paid to", key: "paidTo", width: 22 },
        { header: "Method", key: "method", width: 10 },
        { header: "Amount (₹)", key: "amount", width: 16, style: { numFmt: "#,##0.00" } },
        { header: "Description", key: "desc", width: 40 },
      ];
      for (const t of txns) {
        ws.addRow({
          date: t.date,
          type: t.type.replace(/_/g, " "),
          category: t.category || "",
          project: t.project?.name || "General",
          paidTo: t.paidTo || t.worker?.name || t.supplier?.name || "",
          method: t.method,
          amount: t.amount / 100,
          desc: t.description || "",
        });
      }
      const t = ws.addRow({ date: "", type: "TOTAL", amount: total / 100 });
      t.font = { bold: true };
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="expenses-${from}-to-${to}.xlsx"`);
      await wb.xlsx.write(res);
      return res.end();
    }

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="expenses-${from}-to-${to}.pdf"`);
    doc.pipe(res);
    pdfHeader(doc, settings, "Expenses Report", `${from} to ${to}${project ? " · " + (project as any).name : " · all projects"} · cash-basis payments`);
    let y = doc.y;
    for (const t of txns) {
      if (doc.y > 760) {
        doc.addPage();
        y = 50;
      }
      doc.font("Helvetica").fontSize(9).fillColor("#111")
        .text(`${t.date}  ${t.type.replace(/_/g, " ").padEnd(17)} ${(t.project?.name || "General").slice(0, 18).padEnd(19)} ${(t.paidTo || t.worker?.name || t.supplier?.name || "").slice(0, 18).padEnd(19)} ${inr(t.amount)}`);
    }
    doc.moveDown(0.6).font("Helvetica-Bold").fontSize(11).text(`Total: ${inr(total)}`);
    doc.font("Helvetica").fontSize(8).fillColor("#777").text("Basis: payment dates (cash actually paid out). Unpaid supplier bills are not included.");
    doc.end();
  } catch (e) {
    next(e);
  }
});

/** Worker wage statement for one worker — PDF. */
reportsRouter.get("/worker-statement/:workerId", async (req: AuthedRequest, res, next) => {
  try {
    const worker = (await Worker.findOne({ _id: req.params.workerId, owner: req.ownerId }).lean()) as any;
    if (!worker) throw new ApiError(404, "Worker not found");
    const settings = await CompanySettings.findOne({ owner: req.ownerId }).lean();
    const calc = await calcWagesForWorker(String(worker._id), req.ownerId!, "2000-01-01", todayIST());
    const txns = await Transaction.find({ owner: req.ownerId, worker: worker._id, status: "active" }).sort({ date: 1 }).lean() as any[];

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="worker-${worker.name.replace(/\W+/g, "-")}.pdf"`);
    doc.pipe(res);
    pdfHeader(doc, settings, `Worker Statement — ${worker.name}`, `${worker.role || "Worker"} · ${worker.wageType} wage ${inr(worker.wageRate)}${worker.phone ? " · " + worker.phone : ""}`);

    doc.font("Helvetica-Bold").fontSize(11).text("Position (all time)");
    doc.font("Helvetica").fontSize(10);
    doc.text(`Wages earned (attendance-based): ${inr(calc!.earnedWages + calc!.settlementsPaid)}`);
    doc.text(`Opening balance carried in: ${inr(calc!.openingDue)}`);
    doc.text(`Already settled: ${inr(calc!.settlementsPaid)}`);
    doc.text(`Advances outstanding: ${inr(calc!.advancesOutstanding)}`);
    doc.font("Helvetica-Bold").text(`Net wages due: ${inr(calc!.netWagesDue)}`);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(11).text("Payment history");
    doc.font("Helvetica").fontSize(9);
    for (const t of txns) {
      doc.text(`${t.date}  ${t.type === "worker_advance" ? "Advance" : "Wage payment"}  ${inr(t.amount)}  ${t.description || ""}`.slice(0, 100));
    }
    doc.end();
  } catch (e) {
    next(e);
  }
});

/** Supplier outstanding — Excel or PDF. */
reportsRouter.get("/supplier-outstanding", async (req: AuthedRequest, res, next) => {
  try {
    const format = String(req.query.format || "pdf");
    const suppliers = await Supplier.find({ owner: req.ownerId }).sort({ name: 1 }).lean() as any[];
    const rows: { name: string; phone: string; billed: number; paid: number; outstanding: number }[] = [];
    for (const s of suppliers) {
      const outstanding = await supplierOutstanding(String(s._id), req.ownerId!);
      if (outstanding !== 0) {
        const bills = await SupplierBill.find({ owner: req.ownerId, supplier: s._id }).lean() as any[];
        rows.push({
          name: s.name,
          phone: s.phone || "",
          billed: bills.reduce((a, b) => a + b.total, 0),
          paid: bills.reduce((a, b) => a + (b.amountPaid || 0), 0),
          outstanding,
        });
      }
    }
    const settings = await CompanySettings.findOne({ owner: req.ownerId }).lean();

    if (format === "excel") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Supplier Outstanding");
      ws.columns = [
        { header: "Supplier", key: "name", width: 26 },
        { header: "Phone", key: "phone", width: 16 },
        { header: "Billed (₹)", key: "billed", width: 18, style: { numFmt: "#,##0.00" } },
        { header: "Paid (₹)", key: "paid", width: 18, style: { numFmt: "#,##0.00" } },
        { header: "Outstanding (₹)", key: "outstanding", width: 20, style: { numFmt: "#,##0.00" } },
      ];
      for (const r of rows) ws.addRow({ ...r, billed: r.billed / 100, paid: r.paid / 100, outstanding: r.outstanding / 100 });
      const t = ws.addRow({ name: "TOTAL", outstanding: rows.reduce((s, r) => s + r.outstanding, 0) / 100 });
      t.font = { bold: true };
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="supplier-outstanding-${todayIST()}.xlsx"`);
      await wb.xlsx.write(res);
      return res.end();
    }

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="supplier-outstanding-${todayIST()}.pdf"`);
    doc.pipe(res);
    pdfHeader(doc, settings, "Supplier Outstanding Balances", `As on ${todayIST()}`);
    doc.font("Helvetica").fontSize(10);
    for (const r of rows) {
      doc.fillColor("#111").font("Helvetica-Bold").text(r.name);
      doc.font("Helvetica").fontSize(9).fillColor("#444");
      doc.text(`Billed ${inr(r.billed)} · Paid ${inr(r.paid)} · `, { continued: true }).fillColor("#991b1b").text(`Due ${inr(r.outstanding)}`);
      doc.moveDown(0.25);
    }
    doc.moveDown(0.5).font("Helvetica-Bold").fontSize(11).fillColor("#111").text(`Total due to suppliers: ${inr(rows.reduce((s, r) => s + r.outstanding, 0))}`);
    doc.end();
  } catch (e) {
    next(e);
  }
});

/** Cash flow (in/out by month) — Excel only (chart lives in the UI). */
reportsRouter.get("/cashflow", async (req: AuthedRequest, res, next) => {
  try {
    const from = String(req.query.from || todayIST().slice(0, 4) + "-01-01");
    const to = String(req.query.to || todayIST());
    const monthly = await Transaction.aggregate<{ _id: { month: string; type: string }; total: number }>([
      { $match: { owner: new Types.ObjectId(req.ownerId), status: "active", date: { $gte: from, $lte: to }, type: { $ne: "owner_capital" } } },
      {
        $group: {
          _id: { month: { $substr: ["$date", 0, 7] }, type: "$type" },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);
    const byMonth = new Map<string, { month: string; inflow: number; outflow: number }>();
    for (const row of monthly) {
      const m = byMonth.get(row._id.month) ?? { month: row._id.month, inflow: 0, outflow: 0 };
      if (["customer_payment", "other_income"].includes(row._id.type)) m.inflow += row.total;
      else m.outflow += row.total;
      byMonth.set(row._id.month, m);
    }
    const rows = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));

    if (String(req.query.format || "excel") === "excel") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Cash Flow");
      ws.columns = [
        { header: "Month", key: "month", width: 12 },
        { header: "In (₹)", key: "inflow", width: 18, style: { numFmt: "#,##0.00" } },
        { header: "Out (₹)", key: "outflow", width: 18, style: { numFmt: "#,##0.00" } },
        { header: "Net (₹)", key: "net", width: 18, style: { numFmt: "#,##0.00" } },
      ];
      for (const r of rows) ws.addRow({ month: r.month, inflow: r.inflow / 100, outflow: r.outflow / 100, net: (r.inflow - r.outflow) / 100 });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="cashflow-${from}-to-${to}.xlsx"`);
      await wb.xlsx.write(res);
      return res.end();
    }
    res.json({ rows });
  } catch (e) {
    next(e);
  }
});

/** Attendance summary (date range) — Excel. */
reportsRouter.get("/attendance", async (req: AuthedRequest, res, next) => {
  try {
    const from = String(req.query.from || todayIST().slice(0, 8) + "01");
    const to = String(req.query.to || todayIST());
    const agg = await Attendance.aggregate([
      { $match: { owner: new Types.ObjectId(req.ownerId), date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { worker: "$worker", status: "$status" },
          days: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.worker",
          present: { $sum: { $cond: [{ $eq: ["$_id.status", "present"] }, "$days", 0] } },
          half: { $sum: { $cond: [{ $eq: ["$_id.status", "half"] }, "$days", 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$_id.status", "absent"] }, "$days", 0] } },
          paidLeave: { $sum: { $cond: [{ $eq: ["$_id.status", "paid_leave"] }, "$days", 0] } },
        },
      },
      { $lookup: { from: "workers", localField: "_id", foreignField: "_id", as: "worker" } },
      { $unwind: "$worker" },
      { $project: { name: "$worker.name", role: "$worker.role", present: 1, half: 1, absent: 1, paidLeave: 1 } },
      { $sort: { name: 1 } },
    ]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Attendance");
    ws.columns = [
      { header: "Worker", key: "name", width: 24 },
      { header: "Role", key: "role", width: 18 },
      { header: "Full days", key: "present", width: 12 },
      { header: "Half days", key: "half", width: 12 },
      { header: "Paid leave", key: "paidLeave", width: 12 },
      { header: "Absent", key: "absent", width: 10 },
    ];
    for (const r of agg) ws.addRow(r);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="attendance-${from}-to-${to}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});

/** Overdue tasks / reminders export (Excel). */
reportsRouter.get("/tasks", async (req: AuthedRequest, res, next) => {
  try {
    const tasks = await Task.find({ owner: req.ownerId, status: { $ne: "done" } }).sort({ dueDate: 1 }).populate("project", "name").lean() as any[];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Open Tasks");
    ws.columns = [
      { header: "Due date", key: "dueDate", width: 12 },
      { header: "Priority", key: "priority", width: 10 },
      { header: "Title", key: "title", width: 44 },
      { header: "Project", key: "project", width: 24 },
      { header: "Category", key: "category", width: 12 },
      { header: "Notes", key: "notes", width: 40 },
    ];
    for (const t of tasks) ws.addRow({ dueDate: t.dueDate, priority: t.priority, title: t.title, project: t.project?.name || "", category: t.category, notes: t.notes || "" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="open-tasks-${todayIST()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});
