import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { put, post, get } from "../lib/api";
import { useAuth } from "../state/AuthContext";
import { Button, Field, Input, Select, Textarea, ErrorNote, Card, Row } from "../components/ui";
import { inr, rupeesToPaise, todayStr, fmtDate } from "../lib/format";

const STEPS = ["Welcome", "Your business", "Your sites", "Money received", "Workers", "Suppliers", "Opening cash", "Done"];

interface SiteDraft {
  _id?: string;
  name: string;
  customerName: string;
  type: string;
  contract: string;
  startDate: string;
  expectedEndDate: string;
}

interface PaymentDraft {
  projectId: string;
  amount: string;
  date: string;
  method: string;
}

interface WorkerDraft {
  _id?: string;
  name: string;
  role: string;
  wageType: string;
  wageRate: string;
  openingDue: string;
}

interface BillDraft {
  _id?: string;
  supplierId?: string;
  supplierName: string;
  description: string;
  total: string;
}

export default function SetupWizard() {
  const [step, setStep] = useState(0);
  const { me, refresh } = useAuth();
  const navigate = useNavigate();

  // step 1: company
  const [companyName, setCompanyName] = useState(me?.settings?.companyName || "Ambe Construction");
  const [phone, setPhone] = useState(me?.settings?.phone || "");
  const [address, setAddress] = useState(me?.settings?.address || "");

  // step 2: sites
  const [sites, setSites] = useState<SiteDraft[]>([]);
  const [site, setSite] = useState<SiteDraft>({ name: "", customerName: "", type: "residential", contract: "", startDate: "", expectedEndDate: "" });

  // step 3: payments received
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [payment, setPayment] = useState<PaymentDraft>({ projectId: "", amount: "", date: todayStr(), method: "upi" });

  // step 4: workers
  const [workers, setWorkers] = useState<WorkerDraft[]>([]);
  const [worker, setWorker] = useState<WorkerDraft>({ name: "", role: "", wageType: "daily", wageRate: "", openingDue: "" });

  // step 5: suppliers + bills
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({}); // name -> id
  const [bills, setBills] = useState<BillDraft[]>([]);
  const [bill, setBill] = useState<BillDraft>({ supplierName: "", description: "", total: "" });

  // step 6: opening cash
  const [openingCash, setOpeningCash] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const activeSites = sites.filter((s) => s._id);

  async function saveCompany() {
    setErr("");
    setBusy(true);
    try {
      await put("/api/auth/settings", { companyName, phone, address, language: "en" });
      await refresh();
      setStep(2);
    } catch (e: any) {
      setErr(e.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function addSite() {
    setErr("");
    const contractPaise = rupeesToPaise(site.contract);
    if (!site.name.trim() || !site.customerName.trim() || !contractPaise) {
      setErr("Site name, customer name and contract amount are required");
      return;
    }
    setBusy(true);
    try {
      const res = await post("/api/projects", {
        name: site.name,
        customerName: site.customerName,
        type: site.type,
        status: "active",
        contractAmount: contractPaise,
        startDate: site.startDate || undefined,
        expectedEndDate: site.expectedEndDate || undefined,
        progress: 0,
      });
      setSites((s) => [...s, { ...site, _id: res.project._id }]);
      setSite({ name: "", customerName: "", type: "residential", contract: "", startDate: "", expectedEndDate: "" });
    } catch (e: any) {
      setErr(e.message || "Could not save site");
    } finally {
      setBusy(false);
    }
  }

  async function addPayment() {
    setErr("");
    const paise = rupeesToPaise(payment.amount);
    if (!payment.projectId || !paise) {
      setErr("Choose a site and enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      await post("/api/money/customer-payment", {
        project: payment.projectId,
        amount: paise,
        date: payment.date,
        method: payment.method,
        description: "Payment received (recorded during setup)",
      });
      setPayments((p) => [...p, payment]);
      setPayment({ projectId: "", amount: "", date: todayStr(), method: "upi" });
    } catch (e: any) {
      setErr(e.message || "Could not save payment");
    } finally {
      setBusy(false);
    }
  }

  async function addWorker() {
    setErr("");
    const rate = rupeesToPaise(worker.wageRate);
    if (!worker.name.trim() || !rate) {
      setErr("Name and wage rate are required");
      return;
    }
    setBusy(true);
    try {
      const res = await post("/api/workers", {
        name: worker.name,
        role: worker.role || undefined,
        wageType: worker.wageType,
        wageRate: rate,
        openingWagesDue: worker.openingDue ? rupeesToPaise(worker.openingDue) ?? 0 : 0,
      });
      setWorkers((w) => [...w, { ...worker, _id: res.worker._id }]);
      setWorker({ name: "", role: "", wageType: "daily", wageRate: "", openingDue: "" });
    } catch (e: any) {
      setErr(e.message || "Could not save worker");
    } finally {
      setBusy(false);
    }
  }

  async function addBill() {
    setErr("");
    const total = rupeesToPaise(bill.total);
    if (!bill.supplierName.trim() || !bill.description.trim() || !total) {
      setErr("Supplier, description and amount are required");
      return;
    }
    setBusy(true);
    try {
      // ensure supplier exists
      let supplierId = supplierMap[bill.supplierName];
      if (!supplierId) {
        const res = await post("/api/suppliers", { name: bill.supplierName });
        supplierId = res.supplier._id;
        setSupplierMap((m) => ({ ...m, [bill.supplierName]: supplierId! }));
      }
      await post("/api/suppliers/bills", {
        supplier: supplierId,
        billDate: todayStr(),
        description: bill.description,
        items: [],
        subtotal: total,
        tax: 0,
        total,
        openingBalance: true,
      });
      setBills((b) => [...b, { ...bill, supplierId }]);
      setBill({ supplierName: "", description: "", total: "" });
    } catch (e: any) {
      setErr(e.message || "Could not save bill");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setErr("");
    setBusy(true);
    try {
      const cash = rupeesToPaise(openingCash);
      if (cash) {
        await post("/api/money/owner-capital", { amount: cash, date: todayStr(), method: "cash", description: "Opening cash balance" });
      }
      await post("/api/auth/settings/complete-setup");
      await refresh();
      navigate("/", { replace: true });
    } catch (e: any) {
      setErr(e.message || "Could not finish setup");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-medium text-ink-mute">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span>·</span>}
              <span className={i === step ? "text-brand-700" : ""}>{s}</span>
            </React.Fragment>
          ))}
        </div>
        <h1 className="mt-2 text-xl font-semibold text-ink">{STEPS[step]}</h1>
      </div>

      <ErrorNote message={err} />

      {step === 0 && (
        <Card className="p-6">
          <p className="text-sm leading-relaxed text-ink-soft">
            Welcome! This walks you through moving your records — sites, money received, workers and supplier dues — into one place.
            Everything can be skipped and completed later from the Settings page.
          </p>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setStep(1)}>Start</Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-4 p-6">
          <Field label="Business name" required>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Address">
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={saveCompany} loading={busy}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card className="space-y-3.5 p-6">
            <p className="text-sm text-ink-mute">Add your current sites — roughly 8–10. You can add more later any time.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Site name" required>
                <Input value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} placeholder="e.g. Patel House" />
              </Field>
              <Field label="Customer name" required>
                <Input value={site.customerName} onChange={(e) => setSite({ ...site, customerName: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Contract (₹)" required>
                <Input type="decimal" inputMode="decimal" value={site.contract} onChange={(e) => setSite({ ...site, contract: e.target.value })} />
              </Field>
              <Field label="Start date">
                <Input type="date" value={site.startDate} onChange={(e) => setSite({ ...site, startDate: e.target.value })} />
              </Field>
              <Field label="Expected end">
                <Input type="date" value={site.expectedEndDate} onChange={(e) => setSite({ ...site, expectedEndDate: e.target.value })} />
              </Field>
            </div>
            <Field label="Type">
              <Select value={site.type} onChange={(e) => setSite({ ...site, type: e.target.value })}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="shop">Shop</option>
                <option value="renovation">Renovation</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={addSite} loading={busy} disabled={!site.name || !site.customerName || !site.contract}>
                + Add site
              </Button>
            </div>
          </Card>
          {sites.length > 0 && (
            <Card className="divide-y divide-stone-100 p-2">
              {sites.map((s, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span className="font-medium">{s.name} — {s.customerName}</span>
                  <span className="text-ink-mute">{inr(rupeesToPaise(s.contract) || 0)}</span>
                </div>
              ))}
            </Card>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setStep(3)}>
              {sites.length ? "Continue" : "Skip for now"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Card className="space-y-3.5 p-6">
            <p className="text-sm text-ink-mute">Money already received on each site. If you only know the balance due, enter received = contract − balance.</p>
            {activeSites.length === 0 ? (
              <p className="text-sm text-ink-mute">No sites added yet — you can skip this.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Site" required>
                    <Select value={payment.projectId} onChange={(e) => setPayment({ ...payment, projectId: e.target.value })}>
                      <option value="">Choose…</option>
                      {activeSites.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} — {s.customerName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Received (₹)" required>
                    <Input type="decimal" inputMode="decimal" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date received" required>
                    <Input type="date" value={payment.date} onChange={(e) => setPayment({ ...payment, date: e.target.value })} />
                  </Field>
                  <Field label="Mode">
                    <Select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="bank">Bank transfer</option>
                      <option value="cheque">Cheque</option>
                    </Select>
                  </Field>
                </div>
                <Button onClick={addPayment} loading={busy} disabled={!payment.projectId || !payment.amount}>
                  + Record received
                </Button>
              </>
            )}
          </Card>
          {payments.length > 0 && (
            <Card className="divide-y divide-stone-100 p-2">
              {payments.map((p, i) => (
                <div key={i} className="px-3 py-2.5 text-sm">
                  <div className="flex justify-between">
                    <span>{activeSites.find((s) => s._id === p.projectId)?.name}</span>
                    <span className="font-medium tabular-nums">{inr(rupeesToPaise(p.amount) || 0)}</span>
                  </div>
                  <div className="text-xs text-ink-mute">{fmtDate(p.date)} · {p.method}</div>
                </div>
              ))}
            </Card>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button variant="outline" onClick={() => setStep(4)}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <Card className="space-y-3.5 p-6">
            <p className="text-sm text-ink-mute">Add your regular workers and anything already owed to them from old records.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Worker name" required>
                <Input value={worker.name} onChange={(e) => setWorker({ ...worker, name: e.target.value })} />
              </Field>
              <Field label="Trade / role">
                <Input value={worker.role} onChange={(e) => setWorker({ ...worker, role: e.target.value })} placeholder="Mason, helper…" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Wage type">
                <Select value={worker.wageType} onChange={(e) => setWorker({ ...worker, wageType: e.target.value })}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </Field>
              <Field label="Rate (₹)" required>
                <Input type="decimal" inputMode="decimal" value={worker.wageRate} onChange={(e) => setWorker({ ...worker, wageRate: e.target.value })} />
              </Field>
              <Field label="Old balance due (₹)">
                <Input type="decimal" inputMode="decimal" value={worker.openingDue} onChange={(e) => setWorker({ ...worker, openingDue: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button onClick={addWorker} loading={busy} disabled={!worker.name || !worker.wageRate}>
                + Add worker
              </Button>
            </div>
          </Card>
          {workers.length > 0 && (
            <Card className="divide-y divide-stone-100 p-2">
              {workers.map((w, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span className="font-medium">{w.name}{w.role ? ` · ${w.role}` : ""}</span>
                  <span className="text-ink-mute">
                    {w.wageType} {inr(rupeesToPaise(w.wageRate) || 0)}
                    {w.openingDue ? ` · old due ${inr(rupeesToPaise(w.openingDue) || 0)}` : ""}
                  </span>
                </div>
              ))}
            </Card>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(5)}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <Card className="space-y-3.5 p-6">
            <p className="text-sm text-ink-mute">Supplier bills you still have to pay.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Supplier name" required>
                <Input value={bill.supplierName} onChange={(e) => setBill({ ...bill, supplierName: e.target.value })} />
              </Field>
              <Field label="Bill amount (₹)" required>
                <Input type="decimal" inputMode="decimal" value={bill.total} onChange={(e) => setBill({ ...bill, total: e.target.value })} />
              </Field>
            </div>
            <Field label="What for?" required>
              <Input value={bill.description} onChange={(e) => setBill({ ...bill, description: e.target.value })} placeholder="e.g. Steel — old pending bill" />
            </Field>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(4)}>
                Back
              </Button>
              <Button onClick={addBill} loading={busy} disabled={!bill.supplierName || !bill.total || !bill.description}>
                + Add bill
              </Button>
            </div>
          </Card>
          {bills.length > 0 && (
            <Card className="divide-y divide-stone-100 p-2">
              {bills.map((b, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{b.supplierName}</span> — {b.description}
                  </span>
                  <span className="tabular-nums">{inr(rupeesToPaise(b.total) || 0)}</span>
                </div>
              ))}
            </Card>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(6)}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 6 && (
        <Card className="space-y-4 p-6">
          <p className="text-sm text-ink-mute">If you want cash-in-hand tracking to start from a real number, enter your current cash balance. This is optional.</p>
          <Field label="Opening cash (₹)">
            <Input type="decimal" inputMode="decimal" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
          </Field>
          <Row label="Sites added" value={String(sites.length)} />
          <Row label="Payments recorded" value={String(payments.length)} />
          <Row label="Workers added" value={String(workers.length)} />
          <Row label="Supplier bills" value={String(bills.length)} />
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(5)}>
              Back
            </Button>
            <Button onClick={finish} loading={busy}>
              Finish setup
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
