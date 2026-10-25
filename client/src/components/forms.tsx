import React, { useEffect, useMemo, useState } from "react";
import { get, post, put, ApiError } from "../lib/api";
import { inr, rupeesToPaise, todayStr, fmtDate, PAYMENT_METHOD_LABELS, CATEGORY_LABELS } from "../lib/format";
import { Button, Field, Input, Select, Textarea, ErrorNote, Row } from "./ui";

export interface FormProps {
  onSaved: (result?: any) => void;
  onCancel: () => void;
  defaultProject?: string;
  defaultWorker?: string;
  defaultSupplier?: string;
}

export interface ProjectOption {
  id: string;
  name: string;
  customerName: string;
  status: string;
}

export function useProjects(): ProjectOption[] {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  useEffect(() => {
    get("/api/projects?limit=100")
      .then((d) =>
        setProjects(
          d.projects.map((p: any) => ({ id: p._id, name: p.name, customerName: p.customerName, status: p.status }))
        )
      )
      .catch(() => {});
  }, []);
  return projects;
}

export function useWorkers() {
  const [workers, setWorkers] = useState<{ id: string; name: string; wageType: string; wageRate: number }[]>([]);
  useEffect(() => {
    get("/api/workers")
      .then((d) => setWorkers(d.workers.map((w: any) => ({ id: w._id, name: w.name, wageType: w.wageType, wageRate: w.wageRate }))))
      .catch(() => {});
  }, []);
  return workers;
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    get("/api/suppliers")
      .then((d) => setSuppliers(d.suppliers.map((s: any) => ({ id: s._id, name: s.name }))))
      .catch(() => {});
  }, []);
  return suppliers;
}

function projectLabel(p: ProjectOption) {
  return `${p.name} — ${p.customerName}`;
}

function projectOptions(projects: ProjectOption[], includeGeneral = false) {
  const opts = projects.map((p) => ({ value: p.id, label: projectLabel(p) }));
  return includeGeneral ? [{ value: "", label: "General business (no site)" }, ...opts] : opts;
}

// ── Add Expense ──────────────────────────────────────────────────────────────
export function ExpenseForm({ onSaved, onCancel, defaultProject }: FormProps) {
  const projects = useProjects();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("material");
  const [project, setProject] = useState(defaultProject || "");
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState("cash");
  const [paidTo, setPaidTo] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setFieldErr({});
    const paise = rupeesToPaise(amount);
    if (!paise) {
      setFieldErr({ amount: "Enter a valid amount" });
      return;
    }
    setSaving(true);
    try {
      const res = await post("/api/money/expense", {
        amount: paise,
        category,
        project: project || undefined,
        date,
        method,
        paidTo: paidTo || undefined,
        description: description || undefined,
      });
      onSaved(res);
    } catch (e2) {
      if (e2 instanceof ApiError) {
        setErr(e2.message);
        setFieldErr(e2.details || {});
      } else setErr("Could not save. Your entry is still here — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" required error={fieldErr.amount}>
          <Input type="decimal" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 4500" invalid={!!fieldErr.amount} required autoFocus />
        </Field>
        <Field label="Date" required error={fieldErr.date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" required>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid by" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Site" hint="Leave on General for business expenses">
        <Select value={project} onChange={(e) => setProject(e.target.value)}>
          {projectOptions(projects, true).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid to">
          <Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Shop / person" />
        </Field>
        <Field label="What was it for?">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 20 bags cement" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save expense
        </Button>
      </div>
    </form>
  );
}

// ── Record Customer Payment ──────────────────────────────────────────────────
export function CustomerPaymentForm({ onSaved, onCancel, defaultProject }: FormProps) {
  const projects = useProjects();
  const [amount, setAmount] = useState("");
  const [project, setProject] = useState(defaultProject || "");
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState("upi");
  const [refNo, setRefNo] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [txnResult, setTxnResult] = useState<any>(null);

  const selected = projects.find((p) => p.id === project);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setFieldErr({});
    const paise = rupeesToPaise(amount);
    if (!paise) return setFieldErr({ amount: "Enter a valid amount" });
    if (!project) return setFieldErr({ project: "Choose a site" });
    setSaving(true);
    try {
      const res = await post("/api/money/customer-payment", {
        project,
        amount: paise,
        date,
        method,
        refNo: refNo || undefined,
        notes: notes || undefined,
      });
      setTxnResult(res);
    } catch (e2) {
      if (e2 instanceof ApiError) {
        setErr(e2.message);
        setFieldErr(e2.details || {});
      } else setErr("Could not save. Your entry is still here — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (txnResult) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-center">
          <div className="text-sm text-brand-800">Payment recorded</div>
          <div className="mt-1 text-2xl font-semibold text-brand-800">{inr(txnResult.txn.amount, { decimals: true })}</div>
          {txnResult.fin && (
            <div className="mt-2 text-sm text-ink-soft">
              Balance remaining on this site: <strong>{inr(txnResult.fin.customerOutstanding, { decimals: true })}</strong>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <a
            href={`/api/reports/receipt/${txnResult.txn._id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-[15px] font-medium hover:bg-stone-50"
          >
            Open receipt (PDF)
          </a>
          <Button onClick={() => onSaved(txnResult)}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <Field label="Site" required error={fieldErr.project}>
        <Select value={project} onChange={(e) => setProject(e.target.value)} invalid={!!fieldErr.project}>
          <option value="">Choose site…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {projectLabel(p)}
            </option>
          ))}
        </Select>
      </Field>
      {selected && (
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-ink-soft">
          Receiving from <strong>{selected.customerName}</strong>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" required error={fieldErr.amount}>
          <Input type="decimal" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 25000" invalid={!!fieldErr.amount} required autoFocus />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mode" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference / UTR" hint="Optional">
          <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} />
        </Field>
      </div>
      <Field label="Note">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. installment 2" />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Record payment
        </Button>
      </div>
    </form>
  );
}

// ── Record Supplier Bill ─────────────────────────────────────────────────────
export function SupplierBillForm({ onSaved, onCancel, defaultProject, defaultSupplier }: FormProps) {
  const suppliers = useSuppliers();
  const projects = useProjects();
  const [supplier, setSupplier] = useState(defaultSupplier || "");
  const [project, setProject] = useState(defaultProject || "");
  const [billDate, setBillDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setFieldErr({});
    const total = rupeesToPaise(amount);
    if (!total) return setFieldErr({ total: "Enter a valid bill amount" });
    if (!supplier) return setFieldErr({ supplier: "Choose a supplier" });
    if (!description.trim()) return setFieldErr({ description: "Say what the bill is for" });
    const taxPaise = tax ? rupeesToPaise(tax) ?? 0 : 0;
    setSaving(true);
    try {
      const res = await post("/api/suppliers/bills", {
        supplier,
        project: project || undefined,
        billDate,
        dueDate: dueDate || undefined,
        description,
        items: [],
        subtotal: total - taxPaise,
        tax: taxPaise,
        total,
      });
      onSaved(res);
    } catch (e2) {
      if (e2 instanceof ApiError) {
        setErr(e2.message);
        setFieldErr(e2.details || {});
      } else setErr("Could not save. Your entry is still here — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier" required error={fieldErr.supplier}>
          <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} invalid={!!fieldErr.supplier}>
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Site" hint="Optional">
          <Select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {projectLabel(p)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="What is this bill for?" required error={fieldErr.description}>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 50 bags OPC cement" invalid={!!fieldErr.description} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Amount (₹)" required error={fieldErr.total}>
          <Input type="decimal" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!fieldErr.total} required autoFocus />
        </Field>
        <Field label="Tax (₹)">
          <Input type="decimal" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
        </Field>
        <Field label="Bill date" required>
          <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="Payment due by" hint="Optional — used for reminders">
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save bill
        </Button>
      </div>
    </form>
  );
}

// ── Pay Supplier ─────────────────────────────────────────────────────────────
interface UnpaidBill {
  _id: string;
  description: string;
  total: number;
  amountPaid: number;
  billDate: string;
  supplier: { _id: string; name: string } | string;
}

export function PaySupplierForm({ onSaved, onCancel, defaultSupplier }: FormProps) {
  const suppliers = useSuppliers();
  const [supplier, setSupplier] = useState(defaultSupplier || "");
  const [bills, setBills] = useState<UnpaidBill[]>([]);
  const [allocation, setAllocation] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState("cash");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supplier) return setBills([]);
    get(`/api/suppliers/bills?supplier=${supplier}&status=unpaid`)
      .then((d) => setBills(d.bills))
      .catch(() => {});
  }, [supplier]);

  const allocTotal = useMemo(
    () => Object.values(allocation).reduce((s, v) => s + (rupeesToPaise(v) ?? 0), 0),
    [allocation]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const total = rupeesToPaise(amount);
    if (!total) return setErr("Enter a valid payment amount");
    if (!supplier) return setErr("Choose a supplier");
    const billAllocations = Object.entries(allocation)
      .map(([bill, v]) => ({ bill, amount: rupeesToPaise(v) ?? 0 }))
      .filter((a) => a.amount > 0);
    if (billAllocations.length > 0) {
      const sum = billAllocations.reduce((s, a) => s + a.amount, 0);
      if (sum !== total) {
        return setErr(`Bill amounts add to ${inr(sum, { decimals: true })} but payment is ${inr(total, { decimals: true })}. Make them match, or clear the bill breakdown.`);
      }
    }
    setSaving(true);
    try {
      const res = await post("/api/money/supplier-payment", {
        supplier,
        amount: total,
        date,
        method,
        billAllocations,
      });
      onSaved(res);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <Field label="Supplier" required>
        <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="">Choose…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      {bills.length > 0 && (
        <div className="rounded-lg border border-stone-200">
          <div className="border-b border-stone-100 bg-stone-50 px-3 py-2 text-xs font-medium text-ink-mute">Unpaid bills (optional breakdown)</div>
          <div className="max-h-40 divide-y divide-stone-100 overflow-y-auto">
            {bills.map((b) => (
              <div key={b._id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{b.description}</div>
                  <div className="text-xs text-ink-mute">
                    {fmtDate(b.billDate)} · due {inr(b.total - (b.amountPaid || 0), { decimals: true })}
                  </div>
                </div>
                <Input
                  className="w-24"
                  inputMode="decimal"
                  placeholder="₹"
                  value={allocation[b._id] || ""}
                  onChange={(e) => setAllocation((a) => ({ ...a, [b._id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {allocTotal > 0 && <div className="border-t border-stone-100 px-3 py-1.5 text-xs text-ink-mute">Allocated: {inr(allocTotal, { decimals: true })}</div>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Pay (₹)" required>
          <Input type="decimal" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Mode" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Record payment
        </Button>
      </div>
    </form>
  );
}

// ── Pay Worker (settlement with review) ──────────────────────────────────────
export function PayWorkerForm({ onSaved, onCancel, defaultWorker }: FormProps) {
  const workers = useWorkers();
  const [worker, setWorker] = useState(defaultWorker || "");
  const [from, setFrom] = useState(todayStr().slice(0, 8) + "01");
  const [to, setTo] = useState(todayStr());
  const [calc, setCalc] = useState<any>(null);
  const [advanceDeduct, setAdvanceDeduct] = useState<string>("");
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState("cash");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!worker) return setCalc(null);
    get(`/api/workers/${worker}/wage-calc?from=${from}&to=${to}`)
      .then(setCalc)
      .catch(() => setCalc(null));
  }, [worker, from, to]);

  const advanceRecovered = advanceDeduct ? rupeesToPaise(advanceDeduct) ?? 0 : 0;
  const paid = calc ? Math.max(0, calc.netWagesDue - advanceRecovered) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!calc) return setErr("Pick a worker first");
    setSaving(true);
    try {
      const res = await post("/api/workers/settlements", {
        worker,
        from,
        to,
        grossSettled: calc.earnedWages + calc.openingDue,
        advanceDeducted: advanceRecovered,
        amountPaid: paid,
        includesOpeningDue: calc.openingDue > 0,
        date,
        method,
      });
      onSaved(res);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <Field label="Worker" required>
        <Select value={worker} onChange={(e) => setWorker(e.target.value)}>
          <option value="">Choose…</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" required>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To" required>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </Field>
      </div>
      {calc && (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-mute">Review before paying</div>
          <Row label="Wages earned in period" value={inr(calc.earnedWages, { decimals: true })} />
          {calc.openingDue > 0 && <Row label="Old balance brought in" value={inr(calc.openingDue, { decimals: true })} />}
          {calc.settlementsPaid > 0 && <Row label="Already settled before" value={"−" + inr(calc.settlementsPaid, { decimals: true })} tone="red" />}
          <Row label="Advances not yet recovered" value={inr(calc.advancesOutstanding, { decimals: true })} />
          <div className="mt-1 border-t border-stone-200 pt-1.5">
            <Row label="Net wages due" value={inr(calc.netWagesDue, { decimals: true })} strong tone={calc.netWagesDue >= 0 ? "green" : "red"} />
          </div>
        </div>
      )}
      {calc && calc.advancesOutstanding > 0 && (
        <Field label="Recover advance now (₹)" hint={`Outstanding advance: ${inr(calc.advancesOutstanding, { decimals: true })}. Leave blank to pay full dues.`}>
          <Input type="decimal" inputMode="decimal" value={advanceDeduct} onChange={(e) => setAdvanceDeduct(e.target.value)} placeholder={String(calc.advancesOutstanding / 100)} />
        </Field>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Pay now (₹)" required>
          <Input readOnly value={inr(paid, { decimals: true }).replace("₹", "")} className="bg-stone-100 font-semibold" />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Mode" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} disabled={!calc || paid <= 0}>
          Confirm settlement
        </Button>
      </div>
    </form>
  );
}

// ── Give Worker Advance ──────────────────────────────────────────────────────
export function WorkerAdvanceForm({ onSaved, onCancel, defaultWorker }: FormProps) {
  const workers = useWorkers();
  const [worker, setWorker] = useState(defaultWorker || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState("cash");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const paise = rupeesToPaise(amount);
    if (!paise) return setErr("Enter a valid amount");
    if (!worker) return setErr("Choose a worker");
    setSaving(true);
    try {
      const res = await post("/api/money/worker-advance", { worker, amount: paise, date, method });
      onSaved(res);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <Field label="Worker" required>
        <Select value={worker} onChange={(e) => setWorker(e.target.value)}>
          <option value="">Choose…</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Advance (₹)" required>
          <Input type="decimal" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Mode" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-xs text-ink-mute">Advances are money already given — they reduce what you owe the worker, not extra wages.</p>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Record advance
        </Button>
      </div>
    </form>
  );
}

// ── Mark Attendance ──────────────────────────────────────────────────────────
export function AttendanceForm({ onSaved, onCancel }: FormProps) {
  const workers = useWorkers();
  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const entries = Object.entries(marks)
      .filter(([, status]) => status && status !== "none")
      .map(([worker, status]) => ({ worker, status }));
    if (entries.length === 0) return setErr("Mark at least one worker");
    setSaving(true);
    try {
      const res = await post("/api/workers/attendance/bulk", { date, entries });
      onSaved(res);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const statuses = [
    { value: "present", label: "Full", cls: "bg-brand-700 text-white border-brand-700" },
    { value: "half", label: "Half", cls: "bg-amber-500 text-white border-amber-500" },
    { value: "paid_leave", label: "Leave", cls: "bg-blue-500 text-white border-blue-500" },
    { value: "absent", label: "Absent", cls: "bg-red-600 text-white border-red-600" },
  ];

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <Field label="Date" required>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      {workers.length === 0 && <p className="text-sm text-ink-mute">No workers yet — add workers from the People page first.</p>}
      <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
        {workers.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <span className="text-sm font-medium text-ink">{w.name}</span>
            <div className="flex gap-1">
              {statuses.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setMarks((m) => ({ ...m, [w.id]: m[w.id] === s.value ? "none" : s.value }))}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    marks[w.id] === s.value ? s.cls : "border-stone-200 bg-white text-ink-mute hover:bg-stone-50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save attendance
        </Button>
      </div>
    </form>
  );
}

// ── Add Site Update (diary) ──────────────────────────────────────────────────
export function SiteUpdateForm({ onSaved, onCancel, defaultProject }: FormProps) {
  const projects = useProjects().filter((p) => p.status === "active");
  const [project, setProject] = useState(defaultProject || "");
  const [date, setDate] = useState(todayStr());
  const [workDone, setWorkDone] = useState("");
  const [workersPresent, setWorkersPresent] = useState("");
  const [materials, setMaterials] = useState("");
  const [issues, setIssues] = useState("");
  const [nextPlan, setNextPlan] = useState("");
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!project) return setErr("Choose a site");
    setSaving(true);
    try {
      const res = await post("/api/diary", {
        project,
        date,
        workDone: workDone || undefined,
        workersPresent: workersPresent ? Number(workersPresent) : undefined,
        materialsDelivered: materials || undefined,
        issues: issues || undefined,
        nextPlan: nextPlan || undefined,
        progress: progress ? Number(progress) : undefined,
        photoIds: [],
      });
      onSaved(res);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Site" required>
          <Select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Choose…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {projectLabel(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="Work done today">
        <Textarea value={workDone} onChange={(e) => setWorkDone(e.target.value)} placeholder="e.g. Plaster started on first floor" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Workers today">
          <Input type="number" inputMode="numeric" value={workersPresent} onChange={(e) => setWorkersPresent(e.target.value)} />
        </Field>
        <Field label="Update progress %" hint="Optional">
          <Input type="number" inputMode="numeric" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
        </Field>
      </div>
      <Field label="Materials delivered">
        <Input value={materials} onChange={(e) => setMaterials(e.target.value)} />
      </Field>
      <Field label="Issues or delays">
        <Textarea value={issues} onChange={(e) => setIssues(e.target.value)} />
      </Field>
      <Field label="Plan for next visit">
        <Input value={nextPlan} onChange={(e) => setNextPlan(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save update
        </Button>
      </div>
    </form>
  );
}

// ── Add Task / Reminder ──────────────────────────────────────────────────────
export function TaskForm({ onSaved, onCancel, defaultProject }: FormProps) {
  const projects = useProjects();
  const [title, setTitle] = useState("");
  const [project, setProject] = useState(defaultProject || "");
  const [dueDate, setDueDate] = useState(todayStr());
  const [priority, setPriority] = useState("medium");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!title.trim()) return setErr("Give the task a title");
    setSaving(true);
    try {
      const res = await post("/api/tasks", {
        title,
        project: project || undefined,
        dueDate,
        priority,
        notes: notes || undefined,
      });
      onSaved(res);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <Field label="What do you need to do?" required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call Patel about installment" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due date" required>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </Field>
      </div>
      <Field label="Related site" hint="Optional">
        <Select value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">—</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {projectLabel(p)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save task
        </Button>
      </div>
    </form>
  );
}

// ── Add Note ─────────────────────────────────────────────────────────────────
export function NoteForm({ onSaved, onCancel, defaultProject }: FormProps) {
  const projects = useProjects();
  const [body, setBody] = useState("");
  const [project, setProject] = useState(defaultProject || "");
  const [pinned, setPinned] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!body.trim()) return setErr("Write something first");
    setSaving(true);
    try {
      const res = await post("/api/notes", { body, project: project || undefined, pinned });
      onSaved(res);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <Field label="Note" required>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Customer will pay after slab completion" autoFocus />
      </Field>
      <Field label="Related site" hint="Optional">
        <Select value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">—</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {projectLabel(p)}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 rounded border-stone-300" />
        Pin to top
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save note
        </Button>
      </div>
    </form>
  );
}

// ── New/Edit Project ─────────────────────────────────────────────────────────
export function ProjectForm({ onSaved, onCancel, initial }: { onSaved: (p: any) => void; onCancel: () => void; initial?: any }) {
  const editing = !!initial?._id;
  const [name, setName] = useState(initial?.name || "");
  const [customerName, setCustomerName] = useState(initial?.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [type, setType] = useState(initial?.type || "residential");
  const [status, setStatus] = useState(initial?.status || "active");
  const [contract, setContract] = useState(initial ? String(initial.contractAmount / 100) : "");
  const [estimatedCost, setEstimatedCost] = useState(initial?.estimatedCost ? String(initial.estimatedCost / 100) : "");
  const [startDate, setStartDate] = useState(initial?.startDate || "");
  const [expectedEndDate, setExpectedEndDate] = useState(initial?.expectedEndDate || "");
  const [progress, setProgress] = useState(initial ? String(initial.progress ?? 0) : "0");
  const [scopeNotes, setScopeNotes] = useState(initial?.scopeNotes || "");
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setFieldErr({});
    const contractPaise = rupeesToPaise(contract);
    if (!contractPaise) return setFieldErr({ contract: "Enter the agreed contract amount" });
    const estPaise = estimatedCost ? rupeesToPaise(estimatedCost) : null;
    if (estimatedCost && estPaise === null) return setFieldErr({ estimatedCost: "Invalid amount" });
    setSaving(true);
    const payload: any = {
      name,
      customerName,
      customerPhone: customerPhone || undefined,
      address: address || undefined,
      type,
      status,
      contractAmount: contractPaise,
      estimatedCost: estPaise ?? null,
      startDate: startDate || undefined,
      expectedEndDate: expectedEndDate || undefined,
      progress: Number(progress) || 0,
      scopeNotes: scopeNotes || undefined,
    };
    try {
      const res = editing ? await put(`/api/projects/${initial._id}`, payload) : await post("/api/projects", payload);
      onSaved(res.project ?? res);
    } catch (e2) {
      if (e2 instanceof ApiError) {
        setErr(e2.message);
        setFieldErr(e2.details || {});
      } else setErr("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Site name" required error={fieldErr.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Patel House" required autoFocus />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="shop">Shop</option>
            <option value="renovation">Renovation</option>
            <option value="other">Other</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Customer name" required error={fieldErr.customerName}>
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        </Field>
        <Field label="Customer phone">
          <Input type="tel" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </Field>
      </div>
      <Field label="Site address">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contract amount (₹)" required error={fieldErr.contract}>
          <Input type="decimal" inputMode="decimal" value={contract} onChange={(e) => setContract(e.target.value)} invalid={!!fieldErr.contract} />
        </Field>
        <Field label="Estimated cost (₹)" hint="For profit estimate" error={fieldErr.estimatedCost}>
          <Input type="decimal" inputMode="decimal" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Expected end">
          <Input type="date" value={expectedEndDate} onChange={(e) => setExpectedEndDate(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="onhold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
      </div>
      <Field label={`Progress: ${progress}%`}>
        <input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(e.target.value)} className="w-full accent-brand-700" />
      </Field>
      <Field label="Agreed scope of work">
        <Textarea value={scopeNotes} onChange={(e) => setScopeNotes(e.target.value)} placeholder="What is included in this contract" />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {editing ? "Save changes" : "Create site"}
        </Button>
      </div>
    </form>
  );
}
