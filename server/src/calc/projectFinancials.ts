import { Types } from "mongoose";
import { Transaction, ITransaction } from "../models/finance.js";
import { Project, Variation, IProject } from "../models/project.js";

export interface ProjectFinancials {
  projectId: string;
  originalContract: number; // paise
  approvedVariations: number; // paise (sum, can be negative)
  revisedContract: number; // paise
  paymentsReceived: number; // paise (customer payments allocated to this project)
  customerOutstanding: number; // paise (revised - received; may be negative = advance held)
  expensesRecorded: number; // paise (all active expense-class transactions with this project)
  estimatedCost: number | null; // owner-entered estimate, if any
  estimatedProfit: number | null; // revised - expensesRecorded (label as estimate in UI)
  costOverrunVsEstimate: number | null; // expensesRecorded - estimatedCost
}

const EXPENSE_CLASSES: ITransaction["type"][] = ["expense", "worker_wage", "worker_advance", "supplier_payment"];

/**
 * Financial position of one project, computed entirely from active transactions.
 * - Customer outstanding = revised contract − payments received (may go negative if
 *   the owner collected an advance beyond the current revised value).
 * - Costs = expenses + wages + advances + supplier payments recorded against the project.
 *   Supplier payments represent cash paid against credit bills; bills that were never
 *   paid in cash are not counted here (cash-basis cost view) — see projectCostsAccrual
 *   for the accrual view that includes outstanding supplier bills.
 */
export async function computeProjectFinancials(projectId: string, ownerId: string): Promise<ProjectFinancials | null> {
  const project = (await Project.findOne({ _id: projectId, owner: ownerId }).lean()) as IProject | null;
  if (!project) return null;
  return computeProjectFinancialsFromDocs(project);
}

export async function computeProjectFinancialsFromDocs(project: IProject): Promise<ProjectFinancials> {
  const pid = project._id as unknown as Types.ObjectId;
  const ownerId = String(project.owner);

  const [variationSum, paymentAgg, costAgg] = await Promise.all([
    Variation.aggregate<{ total: number }>([
      { $match: { owner: new Types.ObjectId(ownerId), project: pid, approved: true } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Transaction.aggregate<{ total: number }>([
      { $match: { owner: new Types.ObjectId(ownerId), project: pid, type: "customer_payment", status: "active" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Transaction.aggregate<{ total: number }>([
      { $match: { owner: new Types.ObjectId(ownerId), project: pid, type: { $in: EXPENSE_CLASSES }, status: "active" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const originalContract = project.contractAmount;
  const approvedVariations = variationSum[0]?.total ?? 0;
  const revisedContract = originalContract + approvedVariations;
  const paymentsReceived = paymentAgg[0]?.total ?? 0;
  const expensesRecorded = costAgg[0]?.total ?? 0;
  const estimatedCost = project.estimatedCost ?? null;

  return {
    projectId: String(pid),
    originalContract,
    approvedVariations,
    revisedContract,
    paymentsReceived,
    customerOutstanding: revisedContract - paymentsReceived,
    expensesRecorded,
    estimatedCost,
    estimatedProfit: revisedContract - expensesRecorded,
    costOverrunVsEstimate: estimatedCost != null ? expensesRecorded - estimatedCost : null,
  };
}

export interface OwnerTotals {
  activeProjects: number;
  totalContractValue: number; // revised contract value across non-cancelled projects
  customerPaymentsReceived: number;
  customerOutstanding: number;
  expensesThisMonth: number;
  wagesOutstanding: number;
  supplierOutstanding: number;
  otherIncome: number;
  totalExpenses: number;
}
