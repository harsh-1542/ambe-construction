/** Client-side helpers for money + dates. All amounts travel as integer paise. */

export function inr(paise: number, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const grouped = rupees.toLocaleString("en-IN");
  const showPaise = opts.decimals ?? false;
  const sign = neg ? "-" : opts.sign && paise > 0 ? "+" : "";
  return `${sign}₹${grouped}${showPaise ? `.${String(p).padStart(2, "0")}` : ""}`;
}

/** Parse a user-typed rupee amount to paise; returns null when invalid. */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function fmtDate(d: string | undefined | null): string {
  if (!d) return "—";
  const dt = new Date(d + "T12:00:00Z");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function relativeDay(d: string): string {
  const today = todayStr();
  if (d === today) return "Today";
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (d === tomorrow) return "Tomorrow";
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (d === yesterday) return "Yesterday";
  return fmtDate(d);
}

export const TX_LABELS: Record<string, string> = {
  customer_payment: "Customer payment",
  other_income: "Other income",
  expense: "Expense",
  worker_wage: "Wage payment",
  worker_advance: "Worker advance",
  supplier_payment: "Supplier payment",
  owner_capital: "Opening balance",
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  onhold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const CATEGORY_LABELS: Record<string, string> = {
  material: "Material",
  labor: "Labour",
  transport: "Transport",
  equipment: "Equipment",
  fuel: "Fuel",
  food: "Food & site",
  professional: "Professional fees",
  rent: "Rent",
  other: "Other",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank transfer",
  cheque: "Cheque",
  other: "Other",
};
