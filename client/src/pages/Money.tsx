import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useApi } from "../lib/hooks";
import { inr, fmtDate, TX_LABELS, PAYMENT_METHOD_LABELS, CATEGORY_LABELS } from "../lib/format";
import { post } from "../lib/api";
import { Card, SectionTitle, Tabs, Loading, EmptyState, Button, Modal, StatCard, Textarea, Field, ErrorNote } from "../components/ui";
import { ExpenseForm, CustomerPaymentForm, PaySupplierForm } from "../components/forms";
import { QuickAdd } from "../components/QuickAdd";

export default function Money() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "in");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [modal, setModal] = useState<string | null>(null);
  const [voidTxn, setVoidTxn] = useState<any>(null);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;

  const { data: summary, reload } = useApi(`/api/money/summary?from=${monthStart}&to=${monthEnd}`);
  const inFilter = "type=customer_payment,other_income";
  const outFilter = "type=expense,worker_wage,worker_advance,supplier_payment";
  const { data: inTxns } = useApi(`/api/money/txns?${inFilter}&from=${monthStart}&to=${monthEnd}&limit=100`);
  const { data: outTxns } = useApi(`/api/money/txns?${outFilter}&from=${monthStart}&to=${monthEnd}&limit=100`);
  const { data: dues, reload: reloadDues } = useApi("/api/dashboard");

  function changeTab(id: string) {
    setTab(id);
    setParams(id === "in" ? {} : { tab: id });
  }

  async function doVoid() {
    if (!voidTxn) return;
    setBusy(true);
    setFormErr("");
    try {
      await post(`/api/money/txns/${voidTxn._id}/void`, { reason: voidReason });
      setVoidTxn(null);
      setVoidReason("");
      reload();
      reloadDues();
    } catch (e: any) {
      setFormErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const s = summary;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Money</h1>
          <p className="text-sm text-ink-mute">Everything coming in, going out, and owed.</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        />
      </div>

      <Tabs
        tabs={[
          { id: "in", label: "Money In" },
          { id: "out", label: "Money Out" },
          { id: "dues", label: "Outstanding" },
        ]}
        active={tab}
        onChange={changeTab}
      />

      <div className="mt-4 space-y-4">
        {tab === "in" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Customer payments" value={inr(s?.moneyIn.customerPayments || 0)} tone="green" />
              <StatCard label="Other income" value={inr(s?.moneyIn.otherIncome || 0)} tone="green" />
            </div>
            <Button size="sm" onClick={() => setModal("customer_payment")} className="inline-flex items-center gap-1.5">
              <Plus size={14} /> Record payment
            </Button>
            <Card className="p-4">
              <SectionTitle>Payments this month</SectionTitle>
              {!inTxns || inTxns.txns.length === 0 ? (
                <EmptyState title="No money in yet" body="Customer payments and other income for the selected month appear here." />
              ) : (
                <div className="divide-y divide-stone-100">
                  {inTxns.txns.map((t: any) => (
                    <div key={t._id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink">
                          {t.paidTo || (t.project ? `${t.project.customerName}` : "—")}
                        </div>
                        <div className="text-xs text-ink-mute">
                          {fmtDate(t.date)} · {PAYMENT_METHOD_LABELS[t.method]}
                          {t.project ? ` · ${t.project.name}` : ""}
                          {t.refNo ? ` · ${t.refNo}` : ""}
                          {t.description ? ` · ${t.description}` : ""}
                        </div>
                      </div>
                      {t.type === "customer_payment" && (
                        <a href={`/api/reports/receipt/${t._id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-700">
                          Receipt
                        </a>
                      )}
                      <button onClick={() => setVoidTxn(t)} className="text-xs text-ink-mute hover:text-red-700">
                        Correct
                      </button>
                      <span className="text-sm font-semibold tabular-nums text-brand-700">+{inr(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {tab === "out" && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Expenses" value={inr(s?.moneyOut.expenses || 0)} />
              <StatCard label="Wages paid" value={inr(s?.moneyOut.wages || 0)} />
              <StatCard label="Advances" value={inr(s?.moneyOut.advances || 0)} />
              <StatCard label="Supplier payments" value={inr(s?.moneyOut.supplierPayments || 0)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setModal("expense")} className="inline-flex items-center gap-1.5">
                <Plus size={14} /> Add expense
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModal("pay_supplier")}>
                Pay supplier
              </Button>
              <a
                href={`/api/reports/expenses?format=excel&from=${monthStart}&to=${monthEnd}`}
                className="inline-flex h-9 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-ink hover:bg-stone-50"
              >
                Excel export
              </a>
            </div>
            <Card className="p-4">
              <SectionTitle>Spending this month</SectionTitle>
              {!outTxns || outTxns.txns.length === 0 ? (
                <EmptyState title="Nothing spent yet" body="Expenses, wages, advances and supplier payments for the month appear here." />
              ) : (
                <div className="divide-y divide-stone-100">
                  {outTxns.txns.map((t: any) => (
                    <div key={t._id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink">{t.description || (t.category ? CATEGORY_LABELS[t.category] : TX_LABELS[t.type])}</div>
                        <div className="text-xs text-ink-mute">
                          {fmtDate(t.date)} · {TX_LABELS[t.type]}
                          {t.project ? ` · ${t.project.name}` : " · General"}
                          {t.worker ? ` · ${t.worker.name}` : ""}
                          {t.supplier ? ` · ${t.supplier.name}` : ""}
                          {t.paidTo ? ` · ${t.paidTo}` : ""}
                        </div>
                      </div>
                      <button onClick={() => setVoidTxn(t)} className="text-xs text-ink-mute hover:text-red-700">
                        Correct
                      </button>
                      <span className="text-sm font-semibold tabular-nums text-red-700">−{inr(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {tab === "dues" && <OutstandingDues dash={dues} />}
      </div>

      <Modal open={modal === "customer_payment"} onClose={() => setModal(null)} title="Record customer payment">
        <CustomerPaymentForm onSaved={() => { setModal(null); reload(); reloadDues(); }} onCancel={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "expense"} onClose={() => setModal(null)} title="Add expense">
        <ExpenseForm onSaved={() => { setModal(null); reload(); }} onCancel={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "pay_supplier"} onClose={() => setModal(null)} title="Pay supplier">
        <PaySupplierForm onSaved={() => { setModal(null); reload(); reloadDues(); }} onCancel={() => setModal(null)} />
      </Modal>

      <Modal open={!!voidTxn} onClose={() => setVoidTxn(null)} title="Correct this entry">
        <div className="space-y-3.5">
          <ErrorNote message={formErr} />
          <div className="rounded-lg bg-stone-50 p-3 text-sm">
            <div className="font-medium text-ink">{TX_LABELS[voidTxn?.type || ""]}</div>
            <div className="mt-1 text-ink-mute">
              {fmtDate(voidTxn?.date)} · {inr(voidTxn?.amount || 0)} {voidTxn?.description ? `· ${voidTxn.description}` : ""}
            </div>
          </div>
          <Field label="Why is it being corrected?" required>
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-mute">The entry is excluded from totals but stays in history — nothing is deleted.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setVoidTxn(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doVoid} loading={busy} disabled={voidReason.trim().length < 3}>
              Void entry
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function OutstandingDues({ dash }: { dash: any }) {
  if (!dash) return <Loading />;
  const upcoming = dash.upcomingInstallments || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Customers owe you" value={inr(Math.max(0, dash.cards.customerOutstanding))} tone="amber" />
        <StatCard label="You owe suppliers" value={inr(dash.cards.supplierOutstanding)} tone="amber" />
        <StatCard label="Wages due to workers" value={inr(Math.max(0, dash.cards.wagesOutstanding))} tone="amber" />
        <StatCard label="Overdue reminders" value={String(dash.overdueTasks?.length || 0)} tone={dash.overdueTasks?.length ? "red" : undefined} />
      </div>

      {dash.cards.customerOutstanding > 0 && (
        <Card className="p-4">
          <SectionTitle action={<Link to="/projects" className="text-sm font-medium text-brand-700">Open sites</Link>}>Customer balances by site</SectionTitle>
          <div className="divide-y divide-stone-100">
            {dash.siteSummaries
              .filter((s: any) => s.outstanding > 0)
              .map((s: any) => (
                <Link key={s.projectId} to={`/projects/${s.projectId}`} className="flex items-center justify-between py-2.5 text-sm hover:bg-stone-50">
                  <span>
                    <span className="font-medium text-ink">{s.customerName}</span>
                    <span className="text-ink-mute"> · {s.name}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-amber-700">{inr(s.outstanding)}</span>
                </Link>
              ))}
          </div>
          <a href="/api/reports/customer-outstanding" target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-brand-700">
            Download statement (PDF)
          </a>
        </Card>
      )}

      {dash.cards.supplierOutstanding > 0 && (
        <Card className="p-4">
          <SectionTitle action={<Link to="/suppliers" className="text-sm font-medium text-brand-700">Suppliers</Link>}>Supplier bills to pay</SectionTitle>
          <a href="/api/reports/supplier-outstanding" target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700">
            Download supplier dues (PDF)
          </a>
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card className="p-4">
          <SectionTitle>Upcoming installments</SectionTitle>
          <div className="divide-y divide-stone-100">
            {upcoming.map((i: any, idx: number) => (
              <Link key={idx} to={`/projects/${i.projectId}`} className="flex items-center justify-between py-2.5 text-sm hover:bg-stone-50">
                <div>
                  <div className="font-medium text-ink">{i.customerName} — {i.label}</div>
                  <div className="text-xs text-ink-mute">{i.projectName} · due {fmtDate(i.dueDate)}{i.overdue ? " · OVERDUE" : ""}</div>
                </div>
                <span className={`font-semibold tabular-nums ${i.overdue ? "text-red-700" : "text-amber-700"}`}>{inr(i.amount)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {dash.overdueTasks?.length > 0 && (
        <Card className="p-4">
          <SectionTitle action={<Link to="/tasks" className="text-sm font-medium text-brand-700">All tasks</Link>}>Overdue follow-ups</SectionTitle>
          <div className="divide-y divide-stone-100">
            {dash.overdueTasks.map((t: any) => (
              <div key={t._id} className="py-2.5 text-sm">
                <span className="font-medium text-ink">{t.title}</span>
                <span className="ml-2 text-xs text-red-700">due {fmtDate(t.dueDate)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {dash.cards.customerOutstanding <= 0 && dash.cards.supplierOutstanding <= 0 && (!dash.cards.wagesOutstanding || dash.cards.wagesOutstanding <= 0) && (
        <EmptyState title="Nothing outstanding" body="No customer dues, supplier bills or wages pending. Nice." />
      )}
    </div>
  );
}
