import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Phone } from "lucide-react";
import { useApi } from "../lib/hooks";
import { inr } from "../lib/format";
import { Card, PageHeader, Loading, EmptyState, Badge, Button, Modal, Input, Field, Textarea, ErrorNote } from "../components/ui";
import { post, put } from "../lib/api";

export default function Suppliers() {
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const { data, loading, reload } = useApi(`/api/suppliers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const suppliers: any[] = data?.suppliers || [];
  const totalDue = suppliers.reduce((s, x) => s + Math.max(0, x.outstanding || 0), 0);

  return (
    <div>
      <PageHeader
        title="Suppliers & Materials"
        sub={suppliers.length ? `${suppliers.length} suppliers · ${inr(totalDue)} owed` : "Supplier bills and payments"}
        action={
          <Button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-2">
            <Plus size={16} /> Add supplier
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppliers…" className="pl-9" />
        </div>
        <Link to="/materials" className="inline-flex h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-ink hover:bg-stone-50">
          Stock
        </Link>
      </div>

      {loading ? (
        <Loading />
      ) : suppliers.length === 0 ? (
        <EmptyState title="No suppliers yet" body="Add the shops you buy cement, steel and other materials from." action={<Button onClick={() => setNewOpen(true)}>Add supplier</Button>} />
      ) : (
        <div className="space-y-3">
          {suppliers.map((s) => (
            <Link key={s._id} to={`/suppliers/${s._id}`} className="block">
              <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-800">
                  {s.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{s.name}</div>
                  <p className="truncate text-sm text-ink-mute">
                    {s.materials || "Supplier"}
                    {s.phone ? (
                      <>
                        {" · "}
                        <span className="inline-flex items-center gap-0.5">
                          <Phone size={11} /> {s.phone}
                        </span>
                      </>
                    ) : ""}
                  </p>
                </div>
                <div className="text-right">
                  {s.outstanding > 0 ? (
                    <div className="text-sm font-semibold tabular-nums text-amber-700">{inr(s.outstanding)} due</div>
                  ) : (
                    <Badge tone="green">Settled</Badge>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Add supplier">
        <SupplierForm
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

export function SupplierForm({ onSaved, onCancel, initial }: { onSaved: () => void; onCancel: () => void; initial?: any }) {
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [materials, setMaterials] = useState(initial?.materials || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Name is required");
    setSaving(true);
    try {
      const body = { name, phone: phone || undefined, address: address || undefined, materials: materials || undefined, notes: notes || undefined };
      if (initial) await put(`/api/suppliers/${initial._id}`, body);
      else await post("/api/suppliers", body);
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
      <Field label="Shop / supplier name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="What they sell">
          <Input value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="Cement, steel…" />
        </Field>
      </div>
      <Field label="Address">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {initial ? "Save changes" : "Add supplier"}
        </Button>
      </div>
    </form>
  );
}
