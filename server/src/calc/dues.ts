import { Types } from "mongoose";
import { Transaction } from "../models/finance.js";
import { SupplierBill } from "../models/supplier.js";
import { IProject } from "../models/project.js";
import { calcWagesForWorker } from "./wages.js";

/** Supplier outstanding = sum(active bill totals) − sum(supplier_payment allocations to those bills). */
export async function supplierOutstanding(supplierId: string, ownerId: string): Promise<number> {
  const [billAgg, payAgg] = await Promise.all([
    SupplierBill.aggregate<{ total: number; paid: number }>([
      { $match: { owner: new Types.ObjectId(ownerId), supplier: new Types.ObjectId(supplierId) } },
      { $group: { _id: null, total: { $sum: "$total" }, paid: { $sum: "$amountPaid" } } },
    ]),
    Transaction.aggregate<{ total: number }>([
      { $match: { owner: new Types.ObjectId(ownerId), supplier: new Types.ObjectId(supplierId), type: "supplier_payment", status: "active" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);
  // amountPaid on bills is denormalised from payment allocations; a payment may also be
  // recorded without allocation (on-account). Outstanding = bills − all payments to supplier.
  const billed = billAgg[0]?.total ?? 0;
  const paid = payAgg[0]?.total ?? 0;
  return billed - paid;
}

export interface OutstandingDue {
  kind: "customer" | "supplier_bill" | "worker_wages" | "installment";
  label: string;
  refId: string;
  projectId?: string;
  projectName?: string;
  person?: string;
  amount: number; // paise
  dueDate?: string;
  overdue: boolean;
  detail?: string;
}

/** Everything the business is owed or owes, for the Outstanding Dues view + dashboard. */
export async function computeOutstandingDues(ownerId: string, projects: IProject[]): Promise<OutstandingDue[]> {
  const pidToName = new Map(projects.map((p) => [String(p._id), p.name]));
  const dues: OutstandingDue[] = [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  // Customer dues per project
  for (const p of projects) {
    if (p.status === "cancelled" || p.status === "completed") continue;
    const fin = await (await import("./projectFinancials.js")).computeProjectFinancialsFromDocs(p);
    if (fin.customerOutstanding > 0) {
      dues.push({
        kind: "customer",
        label: `${p.customerName} — ${p.name}`,
        refId: String(p._id),
        projectId: String(p._id),
        projectName: p.name,
        person: p.customerName,
        amount: fin.customerOutstanding,
        dueDate: p.expectedEndDate,
        overdue: !!p.expectedEndDate && p.expectedEndDate < today,
        detail: "Contract balance",
      });
    }
  }

  // Unpaid supplier bills
  const bills = (await SupplierBill.find({ owner: ownerId }).lean()) as any[];
  for (const b of bills) {
    const bal = b.total - (b.amountPaid ?? 0);
    if (bal > 0) {
      dues.push({
        kind: "supplier_bill",
        label: b.description,
        refId: String(b._id),
        projectId: b.project ? String(b.project) : undefined,
        projectName: b.project ? pidToName.get(String(b.project)) : undefined,
        amount: bal,
        dueDate: b.dueDate,
        overdue: !!b.dueDate && b.dueDate < today,
        detail: "Supplier bill balance",
      });
    }
  }

  // Worker wages due (net of advances and settlements, all-time)
  const { Worker } = await import("../models/people.js");
  const workers = (await Worker.find({ owner: ownerId, active: true }).lean()) as any[];
  for (const w of workers) {
    const calcRes = await calcWagesForWorker(String(w._id), ownerId, "2000-01-01", today);
    if (calcRes && calcRes.netWagesDue > 0) {
      dues.push({
        kind: "worker_wages",
        label: `${w.name} — wages due`,
        refId: String(w._id),
        person: w.name,
        amount: calcRes.netWagesDue,
        overdue: false,
        detail: `Earned ${calcRes.earnedWages} minus settlements and advances`,
      });
    }
  }

  // Upcoming/overdue installments that aren't fully paid
  const { Transaction } = await import("../models/finance.js");
  for (const p of projects) {
    for (const inst of p.installments ?? []) {
      const paidAgg = await Transaction.aggregate<{ total: number }>([
        { $match: { owner: new Types.ObjectId(ownerId), project: p._id, type: "customer_payment", status: "active", installment: inst._id } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const paid = paidAgg[0]?.total ?? 0;
      if (paid < inst.amount && inst.dueDate <= today) {
        dues.push({
          kind: "installment",
          label: `${p.customerName} — ${inst.label}`,
          refId: `${p._id}:${inst._id}`,
          projectId: String(p._id),
          projectName: p.name,
          person: p.customerName,
          amount: inst.amount - paid,
          dueDate: inst.dueDate,
          overdue: inst.dueDate < today,
          detail: "Agreed installment",
        });
      }
    }
  }

  return dues;
}

/** Cash in/out for a date range (transaction-date basis, cash-basis actual money movement). */
export async function cashFlow(ownerId: string, from: string, to: string) {
  const rows = await Transaction.aggregate<{ _id: string; total: number; count: number }>([
    {
      $match: {
        owner: new Types.ObjectId(ownerId),
        status: "active",
        date: { $gte: from, $lte: to },
        type: { $nin: ["owner_capital"] },
      },
    },
    { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  const inflowTypes = ["customer_payment", "other_income"];
  const outflowTypes = ["expense", "worker_wage", "worker_advance", "supplier_payment"];
  const inflow = rows.filter((r) => inflowTypes.includes(r._id)).reduce((s, r) => s + r.total, 0);
  const outflow = rows.filter((r) => outflowTypes.includes(r._id)).reduce((s, r) => s + r.total, 0);
  return { inflow, outflow, net: inflow - outflow, rows };
}
