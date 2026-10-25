import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Archive, MapPin, Phone, ExternalLink } from "lucide-react";
import { useApi } from "../lib/hooks";
import { post, put } from "../lib/api";
import { inr, fmtDate, relativeDay, TX_LABELS, PAYMENT_METHOD_LABELS, CATEGORY_LABELS, PROJECT_STATUS_LABELS } from "../lib/format";
import { Card, SectionTitle, Tabs, Loading, EmptyState, Badge, Button, Modal, ConfirmDialog, Row, Field, Input, Textarea, ErrorNote } from "../components/ui";
import { CustomerPaymentForm, ExpenseForm, SiteUpdateForm, TaskForm, NoteForm, SupplierBillForm, ProjectForm } from "../components/forms";

const STATUS_TONES: Record<string, "green" | "amber" | "gray" | "red" | "blue"> = {
  active: "green",
  planning: "blue",
  onhold: "amber",
  completed: "gray",
  cancelled: "red",
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(`/api/projects/${id}`);
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState<string | null>(null);
  const [voidTxn, setVoidTxn] = useState<any>(null);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [variation, setVariation] = useState({ description: "", amount: "", date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), approved: false, notes: "" });
  const [installment, setInstallment] = useState({ label: "", amount: "", dueDate: "" });
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (loading) return <Loading />;
  if (error || !data) return <EmptyState title="Project not found" body={error} action={<Button onClick={() => navigate("/projects")}>Back to sites</Button>} />;

  const { project, fin } = data;
  const p = project;

  async function doVoid() {
    if (!voidTxn) return;
    setBusy(true);
    setFormErr("");
    try {
      await post(`/api/money/txns/${voidTxn._id}/void`, { reason: voidReason });
      setVoidTxn(null);
      setVoidReason("");
      reload();
    } catch (e: any) {
      setFormErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addVariation(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormErr("");
    try {
      const rupees = Number(variation.amount.replace(/[₹,\s]/g, ""));
      if (!rupees || isNaN(rupees)) throw new Error("Enter a valid amount");
      await post(`/api/projects/${id}/variations`, {
        description: variation.description,
        amount: Math.round(rupees * 100),
        date: variation.date,
        approved: variation.approved,
        notes: variation.notes || undefined,
      });
      setModal(null);
      setVariation({ description: "", amount: "", date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), approved: false, notes: "" });
      reload();
    } catch (e2: any) {
      setFormErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function addInstallment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormErr("");
    try {
      const rupees = Number(installment.amount.replace(/[₹,\s]/g, ""));
      if (!rupees || isNaN(rupees)) throw new Error("Enter a valid amount");
      await post(`/api/projects/${id}/installments`, {
        label: installment.label,
        amount: Math.round(rupees * 100),
        dueDate: installment.dueDate,
      });
      setModal(null);
      setInstallment({ label: "", amount: "", dueDate: "" });
      reload();
    } catch (e2: any) {
      setFormErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE", credentials: "include" });
      navigate("/projects");
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "money", label: "Money" },
    { id: "variations", label: `Extra work (${data.variations.length})` },
    { id: "workers", label: "Workers" },
    { id: "bills", label: `Bills (${data.bills.length})` },
    { id: "diary", label: `Diary (${data.diary.length})` },
    { id: "tasks", label: `Tasks (${data.tasks.filter((t: any) => t.status !== "done").length})` },
    { id: "documents", label: `Files (${data.docs.length})` },
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate("/projects")} className="mb-1 flex items-center gap-1 text-sm text-ink-mute hover:text-ink">
            <ArrowLeft size={14} /> All sites
          </button>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-ink">
            {p.name}
            <Badge tone={STATUS_TONES[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
          </h1>
          <p className="text-sm text-ink-mute">
            {p.customerName}
            {p.customerPhone && (
              <>
                {" · "}
                <a href={`tel:${p.customerPhone}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Phone size={12} /> {p.customerPhone}
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setModal("edit")}>
            <Pencil size={14} /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(true)} title="Archive site">
            <Archive size={14} />
          </Button>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <SectionTitle>Financial summary</SectionTitle>
              <Row label="Original contract" value={inr(fin.originalContract, { decimals: true })} />
              <Row label="Approved extra work" value={inr(fin.approvedVariations, { decimals: true, sign: true })} />
              <Row label="Revised contract value" value={inr(fin.revisedContract, { decimals: true })} strong />
              <Row label="Payments received" value={inr(fin.paymentsReceived, { decimals: true })} tone="green" />
              <Row label="Balance from customer" value={inr(fin.customerOutstanding, { decimals: true })} strong tone={fin.customerOutstanding > 0 ? "red" : "green"} />
              <div className="my-2 border-t border-stone-100" />
              <Row label="Costs recorded (cash paid)" value={inr(fin.expensesRecorded, { decimals: true })} />
              {fin.estimatedCost != null && <Row label="Estimated cost" value={inr(fin.estimatedCost, { decimals: true })} />}
              <Row
                label="Estimated profit"
                value={inr(fin.estimatedProfit, { decimals: true })}
                strong
                tone={fin.estimatedProfit >= 0 ? "green" : "red"}
              />
              <p className="mt-1 text-xs text-ink-mute">Profit is an estimate — it counts only costs you've recorded so far.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setModal("payment")}>
                  Record payment
                </Button>
                <Button size="sm" variant="outline" onClick={() => setModal("expense")}>
                  Add expense
                </Button>
                <Button size="sm" variant="outline" onClick={() => setModal("variation")}>
                  + Extra work
                </Button>
                <Button size="sm" variant="outline" onClick={() => setModal("installment")}>
                  + Installment
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle>Site details</SectionTitle>
              <Row label="Type" value={p.type[0].toUpperCase() + p.type.slice(1)} />
              <Row label="Start date" value={fmtDate(p.startDate)} />
              <Row label="Expected completion" value={fmtDate(p.expectedEndDate)} />
              {p.actualEndDate && <Row label="Completed on" value={fmtDate(p.actualEndDate)} />}
              <Row label="Progress" value={`${p.progress}%`} />
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${p.progress}%` }} />
              </div>
              {p.address && (
                <div className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-stone-400" />
                  <span>
                    {p.address}
                    {p.mapLink && (
                      <>
                        {" "}
                        <a href={p.mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand-700">
                          map <ExternalLink size={11} />
                        </a>
                      </>
                    )}
                  </span>
                </div>
              )}
              {p.scopeNotes && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-ink-mute">Agreed scope</div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-soft">{p.scopeNotes}</p>
                </div>
              )}
              {p.notes && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-ink-mute">Notes</div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-soft">{p.notes}</p>
                </div>
              )}
            </Card>
          </div>

          {p.installments?.length > 0 && (
            <Card className="p-4">
              <SectionTitle>Agreed installments</SectionTitle>
              <div className="divide-y divide-stone-100">
                {p.installments.map((inst: any) => (
                  <div key={inst._id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-medium text-ink">{inst.label}</div>
                      <div className="text-xs text-ink-mute">Due {fmtDate(inst.dueDate)}</div>
                    </div>
                    <span className="font-semibold tabular-nums">{inr(inst.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "money" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setModal("payment")}>
              + Money in
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModal("expense")}>
              + Money out
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModal("bill")}>
              + Supplier bill
            </Button>
          </div>
          <Card className="p-4">
            <SectionTitle>Money received ({inr(fin.paymentsReceived)})</SectionTitle>
            {data.payments.length === 0 ? (
              <EmptyState title="No payments recorded" body="Record the first payment from this customer." />
            ) : (
              <div className="divide-y divide-stone-100">
                {data.payments.map((t: any) => (
                  <div key={t._id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium capitalize text-ink">{PAYMENT_METHOD_LABELS[t.method]}{t.refNo ? ` · ${t.refNo}` : ""}</div>
                      <div className="text-xs text-ink-mute">
                        {fmtDate(t.date)} {t.notes ? `· ${t.notes}` : ""}
                      </div>
                    </div>
                    <a href={`/api/reports/receipt/${t._id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-700">
                      Receipt
                    </a>
                    <button onClick={() => setVoidTxn(t)} className="text-xs text-ink-mute hover:text-red-700">
                      Correct
                    </button>
                    <span className="text-sm font-semibold tabular-nums text-brand-700">+{inr(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <SectionTitle>Costs & payments out ({inr(fin.expensesRecorded)})</SectionTitle>
            {data.expenses.length === 0 ? (
              <EmptyState title="Nothing spent yet" />
            ) : (
              <div className="divide-y divide-stone-100">
                {data.expenses.map((t: any) => (
                  <div key={t._id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink">
                        {t.description || (t.category ? CATEGORY_LABELS[t.category] : TX_LABELS[t.type])}
                      </div>
                      <div className="text-xs text-ink-mute">
                        {fmtDate(t.date)} · {TX_LABELS[t.type]}
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
        </div>
      )}

      {tab === "variations" && (
        <div className="space-y-4">
          <Button size="sm" onClick={() => setModal("variation")}>
            + Extra work / variation
          </Button>
          {data.variations.length === 0 ? (
            <EmptyState title="No extra work recorded" body="Extra work agreed after the contract — like a compound wall — goes here. Only approved items change the contract value." />
          ) : (
            <Card className="divide-y divide-stone-100 p-2">
              {data.variations.map((v: any) => (
                <div key={v._id} className="flex items-center gap-3 px-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{v.description}</div>
                    <div className="text-xs text-ink-mute">{fmtDate(v.date)}{v.notes ? ` · ${v.notes}` : ""}</div>
                  </div>
                  {v.approved ? <Badge tone="green">Approved</Badge> : <Badge tone="amber">Not approved</Badge>}
                  <span className="text-sm font-semibold tabular-nums text-ink">{inr(v.amount, { sign: true })}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === "workers" && (
        <Card className="p-4">
          {data.attendance.length === 0 ? (
            <EmptyState
              title="No attendance marked here"
              body="Mark attendance from Quick Add, choosing this site."
              action={<Button onClick={() => navigate("/workers")}>Open People</Button>}
            />
          ) : (
            <>
              <SectionTitle>Workers on this site</SectionTitle>
              <div className="divide-y divide-stone-100">
                {data.attendance.map((a: any) => (
                  <div key={a._id} className="flex items-center justify-between py-2.5 text-sm">
                    <Link to={`/workers/${a._id}`} className="font-medium text-ink hover:text-brand-700">
                      {a.name}
                    </Link>
                    <span className="text-ink-mute">
                      {a.present} full · {a.days - a.present} other days
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {tab === "bills" && (
        <div className="space-y-4">
          <Button size="sm" onClick={() => setModal("bill")}>
            + Supplier bill
          </Button>
          {data.bills.length === 0 ? (
            <EmptyState title="No supplier bills" body="Bills for materials on this site appear here." />
          ) : (
            <Card className="divide-y divide-stone-100 p-2">
              {data.bills.map((b: any) => {
                const bal = b.total - (b.amountPaid || 0);
                return (
                  <div key={b._id} className="flex items-center gap-3 px-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{b.description}</div>
                      <div className="text-xs text-ink-mute">
                        {fmtDate(b.billDate)} · paid {inr(b.amountPaid || 0)}
                      </div>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${bal > 0 ? "text-amber-700" : "text-brand-700"}`}>{bal > 0 ? inr(bal) : "Paid"}</span>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {tab === "diary" && (
        <div className="space-y-4">
          <Button size="sm" onClick={() => setModal("diary")}>
            + Site update
          </Button>
          {data.diary.length === 0 ? (
            <EmptyState title="No site diary yet" body="Short daily updates — work done, workers, issues — build a progress history you can trust." />
          ) : (
            <div className="space-y-3">
              {data.diary.map((d: any) => (
                <Card key={d._id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{fmtDate(d.date)}</span>
                    {d.progress != null && <Badge tone="green">{d.progress}% complete</Badge>}
                  </div>
                  {d.workDone && <p className="mt-2 text-sm text-ink-soft">{d.workDone}</p>}
                  <div className="mt-2 space-y-1 text-xs text-ink-mute">
                    {d.workersPresent != null && <div>👥 {d.workersPresent} workers</div>}
                    {d.materialsDelivered && <div>📦 {d.materialsDelivered}</div>}
                    {d.issues && <div>⚠️ {d.issues}</div>}
                    {d.decisions && <div>📝 {d.decisions}</div>}
                    {d.nextPlan && <div>➡️ {d.nextPlan}</div>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-4">
          <Button size="sm" onClick={() => setModal("task")}>
            + Task for this site
          </Button>
          {data.tasks.length === 0 ? (
            <EmptyState title="No tasks" />
          ) : (
            <Card className="divide-y divide-stone-100 p-2">
              {data.tasks.map((t: any) => (
                <div key={t._id} className="flex items-center gap-3 px-2 py-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${t.status === "done" ? "bg-brand-600" : t.dueDate < data.project?.createdAt?.slice(0, 10) ? "bg-red-500" : "bg-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${t.status === "done" ? "text-ink-mute line-through" : "text-ink"}`}>{t.title}</div>
                    <div className="text-xs text-ink-mute">{fmtDate(t.dueDate)}{t.notes ? ` · ${t.notes}` : ""}</div>
                  </div>
                  {t.status !== "done" ? (
                    <button
                      className="text-xs font-medium text-brand-700"
                      onClick={async () => {
                        await post(`/api/tasks/${t._id}/complete`);
                        reload();
                      }}
                    >
                      Done
                    </button>
                  ) : (
                    <Badge tone="green">Done</Badge>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-3">
          <Button size="sm" onClick={() => navigate("/documents")}>
            Upload document
          </Button>
          {data.docs.length === 0 ? (
            <EmptyState title="No documents" body="Contracts, plans and photos for this site." />
          ) : (
            <Card className="divide-y divide-stone-100 p-2">
              {data.docs.map((d: any) => (
                <a key={d._id} href={`/api/documents/${d._id}/file`} target="_blank" rel="noreferrer" className="flex items-center justify-between px-2 py-2.5 text-sm hover:bg-stone-50">
                  <span className="truncate font-medium text-ink">{d.title}</span>
                  <span className="text-xs text-ink-mute">{fmtDate(d.createdAt?.slice(0, 10))}</span>
                </a>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === "history" && (
        <Card className="p-4">
          <SectionTitle>Complete transaction history</SectionTitle>
          {data.allTransactions.length === 0 ? (
            <EmptyState title="Nothing yet" />
          ) : (
            <div className="divide-y divide-stone-100">
              {data.allTransactions.map((t: any) => {
                const isIn = ["customer_payment", "other_income"].includes(t.type);
                return (
                  <div key={t._id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink">{t.description || TX_LABELS[t.type]}</div>
                      <div className="text-xs text-ink-mute">
                        {fmtDate(t.date)} · {TX_LABELS[t.type]}
                        {t.status === "void" ? " · VOIDED" : ""}
                      </div>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${isIn ? "text-brand-700" : "text-red-700"} ${t.status === "void" ? "line-through opacity-50" : ""}`}>
                      {isIn ? "+" : "−"}
                      {inr(t.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Modals */}
      <QuickAddModals modal={modal} setModal={setModal} projectId={id!} reload={reload} project={p} />

      <Modal open={modal === "edit"} onClose={() => setModal(null)} title="Edit site" wide>
        <ProjectForm
          initial={p}
          onCancel={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
          }}
        />
      </Modal>

      <Modal open={modal === "variation"} onClose={() => setModal(null)} title="Extra work / variation">
        <form onSubmit={addVariation} className="space-y-3.5">
          <ErrorNote message={formErr} />
          <Field label="What was agreed?" required>
            <Input value={variation.description} onChange={(e) => setVariation({ ...variation, description: e.target.value })} placeholder="e.g. Compound wall on north side" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)" hint="Use minus for reductions" required>
              <Input value={variation.amount} onChange={(e) => setVariation({ ...variation, amount: e.target.value })} required />
            </Field>
            <Field label="Date" required>
              <Input type="date" value={variation.date} onChange={(e) => setVariation({ ...variation, date: e.target.value })} required />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={variation.approved} onChange={(e) => setVariation({ ...variation, approved: e.target.checked })} className="h-4 w-4 rounded border-stone-300" />
            Customer approved this
          </label>
          <Field label="Notes">
            <Textarea value={variation.notes} onChange={(e) => setVariation({ ...variation, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === "installment"} onClose={() => setModal(null)} title="Add installment">
        <form onSubmit={addInstallment} className="space-y-3.5">
          <ErrorNote message={formErr} />
          <Field label="Label" required>
            <Input value={installment.label} onChange={(e) => setInstallment({ ...installment, label: e.target.value })} placeholder="e.g. After slab" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)" required>
              <Input inputMode="decimal" value={installment.amount} onChange={(e) => setInstallment({ ...installment, amount: e.target.value })} required />
            </Field>
            <Field label="Due date" required>
              <Input type="date" value={installment.dueDate} onChange={(e) => setInstallment({ ...installment, dueDate: e.target.value })} required />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={archive}
        busy={busy}
        danger
        title="Archive this site?"
        body="The site is hidden from lists but all money records stay intact for reports. Nothing is deleted."
        confirmLabel="Archive"
      />

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
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Wrong amount entered" />
          </Field>
          <p className="text-xs text-ink-mute">The entry is marked void and excluded from all totals. It stays visible in history for your records.</p>
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

function QuickAddModals({ modal, setModal, projectId, reload, project }: any) {
  const props = { onSaved: () => { setModal(null); reload(); }, onCancel: () => setModal(null), defaultProject: projectId };
  return (
    <>
      <Modal open={modal === "payment"} onClose={() => setModal(null)} title="Record customer payment">
        <CustomerPaymentForm {...props} />
      </Modal>
      <Modal open={modal === "expense"} onClose={() => setModal(null)} title="Add expense">
        <ExpenseForm {...props} />
      </Modal>
      <Modal open={modal === "bill"} onClose={() => setModal(null)} title="Record supplier bill">
        <SupplierBillForm {...props} />
      </Modal>
      <Modal open={modal === "diary"} onClose={() => setModal(null)} title="Add site update" wide>
        <SiteUpdateForm {...props} />
      </Modal>
      <Modal open={modal === "task"} onClose={() => setModal(null)} title="Add task">
        <TaskForm {...props} />
      </Modal>
      <Modal open={modal === "note"} onClose={() => setModal(null)} title="Add note">
        <NoteForm {...props} />
      </Modal>
    </>
  );
}
