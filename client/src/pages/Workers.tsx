import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Phone } from "lucide-react";
import { useApi } from "../lib/hooks";
import { inr } from "../lib/format";
import { Card, PageHeader, Loading, EmptyState, Badge, Button, Modal, Input, Field, Select, ErrorNote } from "../components/ui";
import { post } from "../lib/api";

export default function Workers() {
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const { data, loading, reload } = useApi(`/api/workers${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  const workers: any[] = (data?.workers || []).filter((w: any) => showInactive || w.active);
  const totalDue = workers.reduce((s, w) => s + Math.max(0, w.wageDue || 0), 0);

  return (
    <div>
      <PageHeader
        title="People"
        sub={workers.length ? `${workers.length} workers · ${inr(totalDue)} wages due` : "Workers, attendance and wages"}
        action={
          <Button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-2">
            <Plus size={16} /> Add worker
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workers…" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap px-2 text-sm text-ink-soft">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 rounded border-stone-300" />
          Show past
        </label>
      </div>

      {loading ? (
        <Loading />
      ) : workers.length === 0 ? (
        <EmptyState title="No workers yet" body="Add your regular workers with their wage rate to track attendance and payments." action={<Button onClick={() => setNewOpen(true)}>Add first worker</Button>} />
      ) : (
        <div className="space-y-3">
          {workers.map((w) => (
            <Link key={w._id} to={`/workers/${w._id}`} className="block">
              <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-800">
                  {w.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{w.name}</span>
                    {!w.active && <Badge>Left</Badge>}
                  </div>
                  <p className="truncate text-sm text-ink-mute">
                    {w.role || "Worker"} · {w.wageType} {inr(w.wageRate)}
                    {w.phone ? (
                      <>
                        {" · "}
                        <span className="inline-flex items-center gap-0.5">
                          <Phone size={11} /> {w.phone}
                        </span>
                      </>
                    ) : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold tabular-nums ${w.wageDue > 0 ? "text-amber-700" : "text-brand-700"}`}>
                    {w.wageDue > 0 ? inr(w.wageDue) : "Settled"}
                  </div>
                  {w.advanceBalance > 0 && <div className="text-xs text-ink-mute">advance {inr(w.advanceBalance)}</div>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Add worker">
        <WorkerForm
          onCancel={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false);
            reload();
          }}
        />
      </Modal>
    </div>
  );
}

export function WorkerForm({ onSaved, onCancel, initial }: { onSaved: () => void; onCancel: () => void; initial?: any }) {
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [role, setRole] = useState(initial?.role || "");
  const [wageType, setWageType] = useState(initial?.wageType || "daily");
  const [wageRate, setWageRate] = useState(initial ? String(initial.wageRate / 100) : "");
  const [openingDue, setOpeningDue] = useState(initial ? String((initial.openingWagesDue || 0) / 100) : "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const rate = Math.round(Number(wageRate.replace(/[₹,\s]/g, "")) * 100);
    if (!name.trim() || !rate || rate <= 0) {
      setErr("Name and a valid wage rate are required");
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        name,
        phone: phone || undefined,
        role: role || undefined,
        wageType,
        wageRate: rate,
        notes: notes || undefined,
      };
      if (initial) {
        await fetch(`/api/workers/${initial._id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        body.openingWagesDue = openingDue ? Math.round(Number(openingDue.replace(/[₹,\s]/g, "")) * 100) : 0;
        await post("/api/workers", body);
      }
      onSaved();
    } catch (e2: any) {
      setErr(e2.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Phone">
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <Field label="Trade / role">
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Mason, helper, painter…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Wage type">
          <Select value={wageType} onChange={(e) => setWageType(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
        <Field label="Rate (₹)" required>
          <Input type="decimal" inputMode="decimal" value={wageRate} onChange={(e) => setWageRate(e.target.value)} required />
        </Field>
      </div>
      {!initial && (
        <Field label="Old balance due (₹)" hint="Wages owed from before you started using the app">
          <Input type="decimal" inputMode="decimal" value={openingDue} onChange={(e) => setOpeningDue(e.target.value)} />
        </Field>
      )}
      <Field label="Notes">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {initial ? "Save changes" : "Add worker"}
        </Button>
      </div>
    </form>
  );
}
