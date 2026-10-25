/** All money in the system is stored as integer paise. These helpers convert and format. */

export function rupeesToPaise(rupeeString: string | number): number {
  const n = typeof rupeeString === "number" ? rupeeString : parseRupeeString(rupeeString);
  return Math.round(n * 100);
}

function parseRupeeString(s: string): number {
  const cleaned = s.replace(/[₹,\s]/g, "");
  if (cleaned === "" || isNaN(Number(cleaned))) throw new Error("Invalid amount");
  return Number(cleaned);
}

/** Format paise as an Indian-grouped rupee string, e.g. 123456789 -> "₹12,34,567.89" */
export function formatINR(paise: number, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const grouped = rupees.toLocaleString("en-IN");
  const showPaise = opts.decimals ?? false;
  const sign = neg ? "-" : opts.sign && paise > 0 ? "+" : "";
  return `${sign}₹${grouped}${showPaise ? `.${String(p).padStart(2, "0")}` : ""}`;
}

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Monday of the current week (IST). */
export function weekStartIST(d = new Date()): string {
  const ist = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  ist.setDate(ist.getDate() + diff);
  return ist.toLocaleDateString("en-CA");
}

export function monthStartIST(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 8) + "01";
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T12:00:00Z").getTime());
}
