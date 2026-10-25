import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Phone } from "lucide-react";
import { useApi } from "../lib/hooks";
import { post } from "../lib/api";
import { inr, fmtDate, PAYMENT_METHOD_LABELS } from "../lib/format";
import { Card, SectionTitle, Tabs, Loading, EmptyState, Badge, Button, Modal } from "../components/ui";
import { SupplierBillForm, PaySupplierForm } from "../components/forms";
import { SupplierForm } from "./Suppliers";

export default function SupplierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(`/api/suppliers/${id}`);
  const [modal, setModal] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error || !data) return <EmptyState title="Supplier not found" body={error} action={<Button onClick={() => navigate("/suppliers")}>Back</Button>} />;

  const s = data.supplier;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate("/suppliers")} className="mb-1 flex items-center gap-1 text-sm text-ink-mute hover:text-ink">
            <ArrowLeft size={14} /> Suppliers
          </button>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">{s.name}</h1>
          <p className="text-sm text-ink-mute">
            {s.materials || "Supplier"}
            {s.phone && (
              <>
                {" · "}
                <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Phone size={12} /> {s.phone}
                </a>
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setModal("edit")}>
          <Pencil size={14} /> Edit
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-ink-mute">Outstanding balance</div>
            <div className={`text-2xl font-semibold tabular-nums ${data.outstanding > 0 ? "text-amber-700" : "text-brand-700"}`}>
              {inr(data.outstanding, { decimals: true })}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setModal("pay")}>
              Pay
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModal("bill")}>
              + Bill
            </Button>
          </div>
        </div>
      </Card>

      <Tabs
        tabs={[
          { id: "bills", label: `Bills (${data.bills.length})` },
          { id: "payments", label: `Payments (${data.payments.length})` },
        ]}
        active="bills"
        onChange={() => {}}
      />

      <Card className="p-4">
        {data.bills.length === 0 ? (
          <EmptyState title="No bills yet" />
        ) : (
          <div className="divide-y divide-stone-100">
            {data.bills.map((b: any) => {
              const bal = b.total - (b.amountPaid || 0);
              return (
                <div key={b._id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{b.description}</div>
                    <div className="text-xs text-ink-mute">
                      {fmtDate(b.billDate)}
                      {b.dueDate ? ` · due ${fmtDate(b.dueDate)}` : ""}
                      {b.project?.name ? ` · ${b.project.name}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-ink">{inr(b.total)}</div>
                    {bal > 0 ? (
                      <div className="text-xs font-medium text-amber-700">due {inr(bal)}</div>
                    ) : (
                      <Badge tone="green">Paid</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionTitle>Payment history</SectionTitle>
        {data.payments.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <div className="divide-y divide-stone-100">
            {data.payments.map((t: any) => (
              <div key={t._id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink">{t.description || "Payment"}</div>
                  <div className="text-xs text-ink-mute">
                    {fmtDate(t.date)} · {PAYMENT_METHOD_LABELS[t.method]}
                    {t.refNo ? ` · ${t.refNo}` : ""}
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums text-brand-700">−{inr(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={modal === "edit"} onClose={() => setModal(null)} title="Edit supplier">
        <SupplierForm initial={s} onCancel={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      </Modal>
      <Modal open={modal === "bill"} onClose={() => setModal(null)} title="Record supplier bill">
        <SupplierBillForm defaultSupplier={s._id} onSaved={() => { setModal(null); reload(); }} onCancel={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "pay"} onClose={() => setModal(null)} title="Pay supplier">
        <PaySupplierForm defaultSupplier={s._id} onSaved={() => { setModal(null); reload(); }} onCancel={() => setModal(null)} />
      </Modal>
    </div>
  );
}
