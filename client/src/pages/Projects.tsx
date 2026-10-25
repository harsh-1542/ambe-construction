import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useApi } from "../lib/hooks";
import { inr, PROJECT_STATUS_LABELS } from "../lib/format";
import { Card, PageHeader, Loading, EmptyState, Badge, Input, Select, Button, Modal } from "../components/ui";
import { ProjectForm } from "../components/forms";

const STATUS_TONES: Record<string, "green" | "amber" | "gray" | "red" | "blue"> = {
  active: "green",
  planning: "blue",
  onhold: "amber",
  completed: "gray",
  cancelled: "red",
};

export default function Projects() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("updatedAt");
  const [newOpen, setNewOpen] = useState(false);
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (status) query.set("status", status);
  if (sort !== "updatedAt") query.set("sort", sort);
  query.set("limit", "100");
  const { data, loading, reload } = useApi(`/api/projects?${query.toString()}`);
  const navigate = useNavigate();

  const projects: any[] = data?.projects || [];

  return (
    <div>
      <PageHeader
        title="My Sites"
        sub={`${projects.length} ${projects.length === 1 ? "site" : "sites"}`}
        action={
          <Button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-2">
            <Plus size={16} /> New site
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search site or customer…" className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="">All statuses</option>
          {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-40">
          <option value="updatedAt">Recently updated</option>
          <option value="name">Name A–Z</option>
          <option value="contractAmount">Contract value</option>
          <option value="progress">Progress</option>
        </Select>
      </div>

      {loading ? (
        <Loading />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No sites yet"
          body="Create your first site with the contract amount — then payments, expenses and reminders all link to it."
          action={<Button onClick={() => setNewOpen(true)}>Create a site</Button>}
        />
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Link key={p._id} to={`/projects/${p._id}`} className="block">
              <Card className="p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{p.name}</h3>
                      <Badge tone={STATUS_TONES[p.status] || "gray"}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-mute">
                      {p.customerName}
                      {p.address ? ` · ${p.address}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-ink">{inr(p.fin.revisedContract)}</div>
                    <div className={`text-xs font-medium tabular-nums ${p.fin.customerOutstanding > 0 ? "text-amber-700" : "text-brand-700"}`}>
                      {p.fin.customerOutstanding >= 0 ? "due " : "advance "}
                      {inr(Math.abs(p.fin.customerOutstanding))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="text-xs font-medium tabular-nums text-ink-mute">{p.progress}%</span>
                  <span className="text-xs text-ink-mute">spent {inr(p.fin.expensesRecorded)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New site" wide>
        <ProjectForm
          onCancel={() => setNewOpen(false)}
          onSaved={(p) => {
            setNewOpen(false);
            reload();
            navigate(`/projects/${p._id}`);
          }}
        />
      </Modal>
    </div>
  );
}
