import { Router } from "express";
import { Types } from "mongoose";
import { Project, IProject } from "../models/project.js";
import { Transaction } from "../models/finance.js";
import { SupplierBill } from "../models/supplier.js";
import { Worker } from "../models/people.js";
import { Task } from "../models/misc.js";
import { requireAuth, AuthedRequest } from "../auth.js";
import { todayIST, monthStartIST } from "../calc/money.js";
import { computeProjectFinancialsFromDocs } from "../calc/projectFinancials.js";
import { computeOutstandingDues } from "../calc/dues.js";
import { calcWagesForWorker } from "../calc/wages.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (req: AuthedRequest, res) => {
  const ownerId = req.ownerId!;
  const today = todayIST();
  const monthStart = monthStartIST();

  const [projectsRaw, monthTxAgg, tasks, workers, bills] = await Promise.all([
    Project.find({ owner: ownerId, archived: false }).lean() as unknown as Promise<(IProject & { _id: Types.ObjectId })[]>,
    Transaction.aggregate<{ _id: string; total: number }>([
      { $match: { owner: new Types.ObjectId(ownerId), status: "active", date: { $gte: monthStart, $lte: today } } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]),
    Task.find({ owner: ownerId, status: { $ne: "done" }, dueDate: { $lte: today } }).sort({ dueDate: 1, priority: -1 }).limit(10).populate("project", "name").lean(),
    Worker.find({ owner: ownerId, active: true }).lean(),
    SupplierBill.find({ owner: ownerId }).lean() as unknown as Promise<any[]>,
  ]);

  const finByProject = await Promise.all(projectsRaw.map((p) => computeProjectFinancialsFromDocs(p)));
  const finMap = new Map(finByProject.map((f) => [f.projectId, f]));

  const activeProjects = projectsRaw.filter((p) => p.status === "active" || p.status === "planning" || p.status === "onhold");
  const totalContractValue = finByProject.filter((f) => {
    const p = projectsRaw.find((pp) => String(pp._id) === f.projectId)!;
    return p && p.status !== "cancelled";
  }).reduce((s, f) => s + f.revisedContract, 0);

  const getTx = (t: string) => monthTxAgg.find((r) => r._id === t)?.total ?? 0;
  const customerPaymentsThisMonth = getTx("customer_payment");
  const expensesThisMonth = getTx("expense") + getTx("worker_wage") + getTx("worker_advance") + getTx("supplier_payment");

  const totalOutstanding = finByProject.reduce((s, f) => s + Math.max(0, f.customerOutstanding), 0);
  const paymentsAllTime = finByProject.reduce((s, f) => s + f.paymentsReceived, 0);

  // worker wages outstanding
  let wagesOutstanding = 0;
  for (const w of workers) {
    const c = await calcWagesForWorker(String(w._id), ownerId, "2000-01-01", today);
    if (c && c.netWagesDue > 0) wagesOutstanding += c.netWagesDue;
  }

  // supplier outstanding (bill totals minus supplier payments)
  const [billTotalAgg, supplierPaidAgg] = await Promise.all([
    SupplierBill.aggregate<{ total: number }>([{ $match: { owner: new Types.ObjectId(ownerId) } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
    Transaction.aggregate<{ total: number }>([{ $match: { owner: new Types.ObjectId(ownerId), type: "supplier_payment", status: "active" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
  ]);
  const supplierOutstanding = Math.max(0, (billTotalAgg[0]?.total ?? 0) - (supplierPaidAgg[0]?.total ?? 0));

  // recent transactions
  const recentTx = await Transaction.find({ owner: ownerId, status: "active" }).sort({ date: -1, createdAt: -1 }).limit(12).populate("project", "name").populate("worker", "name").populate("supplier", "name").lean();

  // upcoming installments (next 30 days, unpaid)
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const upcomingInstallments: { projectId: string; projectName: string; customerName: string; label: string; amount: number; dueDate: string; overdue: boolean }[] = [];
  for (const p of projectsRaw) {
    for (const inst of p.installments ?? []) {
      const txAgg = await Transaction.aggregate<{ total: number }>([
        { $match: { owner: new Types.ObjectId(ownerId), project: p._id, type: "customer_payment", status: "active", installment: inst._id } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const paid = txAgg[0]?.total ?? 0;
      if (paid < inst.amount && inst.dueDate <= in30) {
        upcomingInstallments.push({
          projectId: String(p._id),
          projectName: p.name,
          customerName: p.customerName,
          label: inst.label,
          amount: inst.amount - paid,
          dueDate: inst.dueDate,
          overdue: inst.dueDate < today,
        });
      }
    }
  }
  upcomingInstallments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // "Needs Your Attention" — prioritised
  type Attention = { kind: string; severity: "overdue" | "due" | "info"; message: string; link: string; amount?: number };
  const attention: Attention[] = [];
  for (const i of upcomingInstallments.filter((i) => i.overdue)) {
    attention.push({ kind: "installment", severity: "overdue", message: `${i.customerName} — installment "${i.label}" for ${i.projectName} is overdue`, link: `/projects/${i.projectId}`, amount: i.amount });
  }
  for (const t of tasks.filter((t) => t.dueDate < today)) {
    attention.push({ kind: "task", severity: "overdue", message: `Overdue task: ${t.title}`, link: "/tasks" });
  }
  for (const t of tasks.filter((t) => t.dueDate === today)) {
    attention.push({ kind: "task", severity: "due", message: `Due today: ${t.title}`, link: "/tasks" });
  }
  const overdueBills = bills.filter((b) => b.dueDate && b.dueDate < today && b.total - (b.amountPaid || 0) > 0);
  for (const b of overdueBills) {
    attention.push({ kind: "supplier_bill", severity: "overdue", message: `Supplier bill past due: ${(b as any).description}`, link: "/suppliers", amount: b.total - (b.amountPaid || 0) });
  }
  for (const p of activeProjects) {
    if (p.expectedEndDate && p.expectedEndDate < today && p.progress < 100) {
      attention.push({ kind: "project", severity: "overdue", message: `${p.name} is past its expected completion date`, link: `/projects/${p._id}` });
    }
  }
  const severityRank = { overdue: 0, due: 1, info: 2 };
  attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  res.json({
    today,
    cards: {
      activeSites: activeProjects.length,
      totalContractValue,
      customerPaymentsAllTime: paymentsAllTime,
      customerOutstanding: totalOutstanding,
      customerPaymentsThisMonth,
      expensesThisMonth,
      wagesOutstanding,
      supplierOutstanding,
    },
    attention: attention.slice(0, 12),
    upcomingInstallments: upcomingInstallments.slice(0, 8),
    overdueTasks: tasks.filter((t) => t.dueDate <= today).slice(0, 8),
    recentTx,
    siteSummaries: finByProject
      .map((f) => {
        const p = projectsRaw.find((pp) => String(pp._id) === f.projectId)!;
        return {
          projectId: f.projectId,
          name: p.name,
          customerName: p.customerName,
          status: p.status,
          progress: p.progress,
          outstanding: Math.max(0, f.customerOutstanding),
          spent: f.expensesRecorded,
          revisedContract: f.revisedContract,
        };
      })
      .filter((s) => s.status !== "cancelled")
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 10),
  });
});
