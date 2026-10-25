import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Phone } from "lucide-react";
import { useApi } from "../lib/hooks";
import { post } from "../lib/api";
import { inr, fmtDate, TX_LABELS, PAYMENT_METHOD_LABELS } from "../lib/format";
import { Card, SectionTitle, Tabs, Loading, EmptyState, Badge, Button, Modal, Row, Textarea, Field, ErrorNote } from "../components/ui";
import { WorkerAdvanceForm, PayWorkerForm } from "../components/forms";
import { WorkerForm } from "./Workers";

export default function WorkerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(`/api/workers/${id}`);
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState<string | null>(null);
  const [voidSettlement, setVoidSettlement] = useState<any>(null);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  if (loading) return <Loading />;
  if (error || !data) return <EmptyState title="Worker not found" body={error} action={<Button onClick={() => navigate("/workers")}>Back to People</Button>} />;

  const w = data.worker;
  const calc = data.wageCalc;

  async function doVoidSettlement() {
    if (!voidSettlement) return;
    setBusy(true);
    setFormErr("");
    try {
      await post(`/api/workers/settlements/${voidSettlement._id}/void`, { reason: voidReason });
      setVoidSettlement(null);
      setVoidReason("");
      setModal(null);
      reload();
    } catch (e: any) {
      setFormErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate("/workers")} className="mb-1 flex items-center gap-1 text-sm text-ink-mute hover:text-ink">
            <ArrowLeft size={14} /> People
          </button>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            {w.name}
            {!w.active && <Badge>Left</Badge>}
          </h1>
          <p className="text-sm text-ink-mute">
            {w.role || "Worker"} · {w.wageType} wage {inr(w.wageRate)}
            {w.phone && (
              <>
                {" · "}
                <a href={`tel:${w.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Phone size={12} /> {w.phone}
                </a>
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setModal("edit")}>
          <Pencil size={14} /> Edit
        </Button>
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Wages" },
          { id: "attendance", label: "Attendance" },
          { id: "payments", label: "Payments" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && calc && (
        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle>Current position</SectionTitle>
            <Row label="Wages earned (all time)" value={inr(calc.earnedWages + calc.settlementsPaid, { decimals: true })} />
            {calc.openingDue > 0 && <Row label="Old balance brought in" value={inr(calc.openingDue, { decimals: true })} />}
            <Row label="Already settled" value={inr(calc.settlementsPaid, { decimals: true })} />
            <Row label="Advances outstanding" value={inr(calc.advancesOutstanding, { decimals: true })} />
            <div className="my-2 border-t border-stone-100" />
            <Row label="Net wages due now" value={inr(calc.netWagesDue, { decimals: true })} strong tone={calc.netWagesDue > 0 ? "red" : "green"} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setModal("settle")}>
                Settle wages
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModal("advance")}>
                Give advance
              </Button>
              <a href={`/api/reports/worker-statement/${w._id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium hover:bg-stone-50">
                Statement PDF
              </a>
            </div>
          </Card>

          {data.settlements.length > 0 && (
            <Card className="p-4">
              <SectionTitle>Past settlements</SectionTitle>
              <div className="divide-y divide-stone-100">
                {data.settlements.map((s: any) => (
                  <div key={s._id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">
                        {fmtDate(s.from)} → {fmtDate(s.to)}
                      </div>
                      <div className="text-xs text-ink-mute">
                        wages {inr(s.grossSettled)}
                        {s.advanceDeducted > 0 ? ` · advance recovered ${inr(s.advanceDeducted)}` : ""}
                        {s.note ? ` · ${s.note}` : ""}
                      </div>
                    </div>
                    <button onClick={() => { setVoidSettlement(s); setModal("voidSettlement"); }} className="text-xs text-ink-mute hover:text-red-700">
                      Correct
                    </button>
                    <span className="text-sm font-semibold tabular-nums text-ink">{inr(s.amountPaid)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "attendance" && (
        <Card className="p-4">
          {data.attendance.length === 0 ? (
            <EmptyState title="No attendance yet" body="Use Quick Add → Mark Attendance." />
          ) : (
            <div className="divide-y divide-stone-100">
              {data.attendance.map((a: any) => (
                <div key={a._id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink">{fmtDate(a.date)}</span>
                  <span className="text-xs text-ink-mute">{a.project?.name || ""}</span>
                  <Badge tone={a.status === "present" ? "green" : a.status === "half" ? "amber" : a.status === "paid_leave" ? "blue" : "red"}>
                    {a.status === "present" ? "Full day" : a.status === "half" ? "Half day" : a.status === "paid_leave" ? "Paid leave" : "Absent"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "payments" && (
        <Card className="p-4">
          {data.txns.length === 0 ? (
            <EmptyState title="No payments yet" />
          ) : (
            <div className="divide-y divide-stone-100">
              {data.txns.map((t: any) => (
                <div key={t._id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink">{t.description || TX_LABELS[t.type]}</div>
                    <div className="text-xs text-ink-mute">
                      {fmtDate(t.date)} · {PAYMENT_METHOD_LABELS[t.method]}
                      {t.status === "void" ? " · VOIDED" : ""}
                    </div>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${t.status === "void" ? "text-ink-mute line-through" : "text-red-700"}`}>−{inr(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal open={modal === "edit"} onClose={() => setModal(null)} title="Edit worker">
        <WorkerForm initial={w} onCancel={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      </Modal>
      <Modal open={modal === "settle"} onClose={() => setModal(null)} title="Settle wages" wide>
        <PayWorkerForm defaultWorker={w._id} onSaved={() => { setModal(null); reload(); }} onCancel={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "advance"} onClose={() => setModal(null)} title="Give advance">
        <WorkerAdvanceForm defaultWorker={w._id} onSaved={() => { setModal(null); reload(); }} onCancel={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "voidSettlement"} onClose={() => setModal(null)} title="Correct settlement">
        <div className="space-y-3.5">
          <ErrorNote message={formErr} />
          <div className="rounded-lg bg-stone-50 p-3 text-sm text-ink-mute">
            {fmtDate(voidSettlement?.from)} → {fmtDate(voidSettlement?.to)} · paid {inr(voidSettlement?.amountPaid || 0)}
          </div>
          <Field label="Why?" required>
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-mute">The settlement and its wage payment are both voided — wages due go back up, advances return.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="danger" onClick={doVoidSettlement} loading={busy} disabled={voidReason.trim().length < 3}>Void settlement</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
