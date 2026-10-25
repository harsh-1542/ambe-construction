import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useApi } from "../lib/hooks";
import { post } from "../lib/api";
import { fmtDate, todayStr } from "../lib/format";
import { Card, PageHeader, Loading, EmptyState, Button, Modal, Field, Input, Select, ErrorNote } from "../components/ui";
import { useProjects } from "../components/forms";

export default function Materials() {
  const [newOpen, setNewOpen] = useState(false);
  const [moveFor, setMoveFor] = useState<any>(null);
  const { data, loading, reload } = useApi("/api/suppliers/materials");
  const materials: any[] = data?.materials || [];

  return (
    <div>
      <PageHeader
        title="Materials stock"
        sub="Optional — track remaining stock for materials you care about"
        action={
          <Button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-2">
            <Plus size={16} /> Add material
          </Button>
        }
      />

      {loading ? (
        <Loading />
      ) : materials.length === 0 ? (
        <EmptyState
          title="Nothing tracked yet"
          body="Stock tracking is optional. Most expenses can simply be recorded as expenses without touching stock."
          action={<Button onClick={() => setNewOpen(true)}>Track a material</Button>}
        />
      ) : (
        <div className="space-y-3">
          {materials.map((m) => (
            <Card key={m._id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{m.name}</div>
                <p className="text-sm text-ink-mute">{m.project ? `${m.project.name} · ` : ""}unit: {m.unit}</p>
              </div>
              <div className="text-right">
                <div className={`text-lg font-semibold tabular-nums ${m.stock < 0 ? "text-red-700" : "text-ink"}`}>
                  {m.stock} {m.unit}
                </div>
                <div className="text-xs text-ink-mute">remaining</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setMoveFor(m)}>
                + Movement
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Add material">
        <MaterialForm
          onCancel={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false);
            reload();
          }}
        />
      </Modal>
      <Modal open={!!moveFor} onClose={() => setMoveFor(null)} title={`Stock movement — ${moveFor?.name || ""}`}>
        <MovementForm
          material={moveFor}
          onCancel={() => setMoveFor(null)}
          onSaved={() => {
            setMoveFor(null);
            reload();
          }}
        />
      </Modal>
    </div>
  );
}

function MaterialForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const projects = useProjects();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("bags");
  const [project, setProject] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Name required");
    setSaving(true);
    try {
      await post("/api/suppliers/materials", { name, unit, project: project || undefined });
      onSaved();
    } catch (e2: any) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <Field label="Material name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. OPC Cement" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit" required>
          <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {["bags", "kg", "tonnes", "cubic feet", "cubic metre", "pieces", "trips", "liters", "bricks"].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Site">
          <Select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Add
        </Button>
      </div>
    </form>
  );
}

function MovementForm({ material, onSaved, onCancel }: { material: any; onSaved: () => void; onCancel: () => void }) {
  const [type, setType] = useState("purchase");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [needConfirm, setNeedConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const n = Number(qty);
    if (!n || isNaN(n) || n === 0) return setErr("Enter a quantity");
    const signed = type === "usage" ? -Math.abs(n) : type === "purchase" ? Math.abs(n) : n;
    setSaving(true);
    try {
      await post(`/api/suppliers/materials/${material._id}/movements`, {
        material: material._id,
        type,
        qty: signed,
        date,
        note: note || undefined,
        confirmNegative: needConfirm,
      });
      onSaved();
    } catch (e2: any) {
      if (e2.message?.toLowerCase().includes("negative")) setNeedConfirm(true);
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <ErrorNote message={err} />
      <Field label="Type">
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="purchase">Purchased / received (+)</option>
          <option value="usage">Used on site (−)</option>
          <option value="adjustment">Adjustment (±)</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Quantity (${material.unit})`} required>
          <Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="Note">
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {needConfirm && <p className="text-xs font-medium text-amber-700">Confirm: records are behind reality — allow stock to go negative.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save movement
        </Button>
      </div>
    </form>
  );
}
