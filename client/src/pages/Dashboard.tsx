import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, ChevronRight, Plus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useApi } from "../lib/hooks";
import { useAuth } from "../state/AuthContext";
import { inr, fmtDate, relativeDay, TX_LABELS } from "../lib/format";
import { Card, SectionTitle, StatCard, Loading, EmptyState, Badge, Button } from "../components/ui";
import { QuickAdd } from "../components/QuickAdd";

interface DashData {
  today: string;
  cards: {
    activeSites: number;
    totalContractValue: number;
    customerPaymentsAllTime: number;
    customerOutstanding: number;
    customerPaymentsThisMonth: number;
    expensesThisMonth: number;
    wagesOutstanding: number;
    supplierOutstanding: number;
  };
  attention: { kind: string; severity: string; message: string; link: string; amount?: number }[];
  upcomingInstallments: { projectId: string; projectName: string; customerName: string; label: string; amount: number; dueDate: string; overdue: boolean }[];
  overdueTasks: { _id: string; title: string; dueDate: string; priority: string }[];
  recentTx: any[];
  siteSummaries: { projectId: string; name: string; customerName: string; status: string; progress: number; outstanding: number; spent: number; revisedContract: number }[];
}

export default function Dashboard() {
  const { data, loading, error } = useApi<DashData>("/api/dashboard");
  const { me } = useAuth();
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const navigate = useNavigate();

  if (loading) return <Loading />;
  if (error) return <EmptyState title="Could not load dashboard" body={error} />;
  if (!data) return null;

  const c = data.cards;
  const isEmpty = c.activeSites === 0 && data.recentTx.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Good to see you, {me?.name?.split(" ")[0]}</h1>
        <p className="text-sm text-ink-mute">Here's where your business stands today.</p>
      </div>

      {isEmpty && (
        <EmptyState
          title="Nothing recorded yet"
          body="Add your first site to start tracking contracts, payments and expenses. The Quick Add button is always available for expenses, payments and reminders."
          action={
            <Button onClick={() => navigate("/projects")} className="inline-flex items-center gap-2">
              <Plus size={16} /> Add your first site
            </Button>
          }
        />
      )}

      {/* Today's summary */}
      <Card className="p-4">
        <SectionTitle>Today's summary</SectionTitle>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-ink-mute">Money in this month</div>
            <div className="mt-0.5 font-semibold text-brand-700">{inr(c.customerPaymentsThisMonth)}</div>
          </div>
          <div>
            <div className="text-xs text-ink-mute">Spent this month</div>
            <div className="mt-0.5 font-semibold text-ink">{inr(c.expensesThisMonth)}</div>
          </div>
          <div>
            <div className="text-xs text-ink-mute">Active sites</div>
            <div className="mt-0.5 font-semibold text-ink">{c.activeSites}</div>
          </div>
          <div>
            <div className="text-xs text-ink-mute">Open reminders</div>
            <div className="mt-0.5 font-semibold text-ink">{data.overdueTasks.length}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setQuickAdd("expense")}>
            + Expense
          </Button>
          <Button size="sm" variant="outline" onClick={() => setQuickAdd("customer_payment")}>
            + Customer payment
          </Button>
          <Button size="sm" variant="outline" onClick={() => setQuickAdd("attendance")}>
            + Attendance
          </Button>
          <Button size="sm" variant="outline" onClick={() => setQuickAdd("task")}>
            + Reminder
          </Button>
        </div>
      </Card>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Contract value (all sites)" value={inr(c.totalContractValue)} />
        <StatCard label="Received from customers" value={inr(c.customerPaymentsAllTime)} tone="green" />
        <StatCard label="Customers owe you" value={inr(Math.max(0, c.customerOutstanding))} tone={c.customerOutstanding > 0 ? "amber" : undefined} />
        <StatCard label="Wages due to workers" value={inr(Math.max(0, c.wagesOutstanding))} tone={c.wagesOutstanding > 0 ? "amber" : undefined} />
      </div>

      {/* Needs attention */}
      {data.attention.length > 0 && (
        <Card className="p-4">
          <SectionTitle>Needs your attention</SectionTitle>
          <div className="divide-y divide-stone-100">
            {data.attention.map((a, i) => (
              <Link key={i} to={a.link} className="flex items-center gap-3 py-2.5 hover:bg-stone-50">
                <AlertTriangle size={16} className={a.severity === "overdue" ? "shrink-0 text-red-600" : "shrink-0 text-amber-500"} />
                <span className="flex-1 text-sm text-ink">{a.message}</span>
                {a.amount !== undefined && <span className="text-sm font-medium tabular-nums text-ink-soft">{inr(a.amount)}</span>}
                <ChevronRight size={16} className="text-stone-400" />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Upcoming installments */}
      {data.upcomingInstallments.length > 0 && (
        <Card className="p-4">
          <SectionTitle>Installments due</SectionTitle>
          <div className="divide-y divide-stone-100">
            {data.upcomingInstallments.map((i, idx) => (
              <Link key={idx} to={`/projects/${i.projectId}`} className="flex items-center gap-3 py-2.5 hover:bg-stone-50">
                <CalendarClock size={16} className={i.overdue ? "shrink-0 text-red-600" : "shrink-0 text-stone-400"} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink">{i.customerName}</div>
                  <div className="text-xs text-ink-mute">
                    {i.projectName} · {i.label} · {relativeDay(i.dueDate)}
                  </div>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${i.overdue ? "text-red-700" : "text-ink"}`}>{inr(i.amount)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Site-wise summary */}
      {data.siteSummaries.length > 0 && (
        <Card className="p-4">
          <SectionTitle
            action={
              <Link to="/projects" className="flex items-center gap-1 text-sm font-medium text-brand-700">
                All sites <ArrowRight size={14} />
              </Link>
            }
          >
            Sites at a glance
          </SectionTitle>
          <div className="divide-y divide-stone-100">
            {data.siteSummaries.map((s) => (
              <Link key={s.projectId} to={`/projects/${s.projectId}`} className="flex items-center gap-3 py-2.5 hover:bg-stone-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{s.name}</span>
                    {s.status === "active" && <Badge tone="green">Active</Badge>}
                    {s.status === "onhold" && <Badge tone="amber">On hold</Badge>}
                  </div>
                  <div className="mt-1 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${s.progress}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold tabular-nums ${s.outstanding > 0 ? "text-amber-700" : "text-brand-700"}`}>{inr(s.outstanding)}</div>
                  <div className="text-xs text-ink-mute">spent {inr(s.spent)}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Recent transactions */}
      {data.recentTx.length > 0 && (
        <Card className="p-4">
          <SectionTitle
            action={
              <Link to="/money" className="flex items-center gap-1 text-sm font-medium text-brand-700">
                All money <ArrowRight size={14} />
              </Link>
            }
          >
            Recent transactions
          </SectionTitle>
          <div className="divide-y divide-stone-100">
            {data.recentTx.slice(0, 8).map((t) => {
              const isIn = ["customer_payment", "other_income"].includes(t.type);
              return (
                <div key={t._id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{t.description || TX_LABELS[t.type] || t.type}</div>
                    <div className="text-xs text-ink-mute">
                      {relativeDay(t.date)}
                      {t.project?.name ? ` · ${t.project.name}` : ""}
                      {t.worker?.name ? ` · ${t.worker.name}` : ""}
                      {t.supplier?.name ? ` · ${t.supplier.name}` : ""}
                    </div>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${isIn ? "text-brand-700" : "text-red-700"}`}>
                    {isIn ? "+" : "−"}
                    {inr(t.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {data.siteSummaries.length > 2 && (
        <Card className="p-4">
          <SectionTitle>Outstanding by site</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.siteSummaries.slice(0, 8).map((s) => ({ name: s.name.slice(0, 12), due: s.outstanding / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#78716c" />
                <YAxis tickFormatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} tick={{ fontSize: 11 }} stroke="#78716c" width={80} />
                <Tooltip formatter={(v: any) => inr(Number(v) * 100)} />
                <Bar dataKey="due" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <QuickAdd open={!!quickAdd} action={quickAdd || undefined} onClose={() => setQuickAdd(null)} />
    </div>
  );
}
