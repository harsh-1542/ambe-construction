import React, { useState } from "react";
import { Download, FileText, Sheet } from "lucide-react";
import { useApi } from "../lib/hooks";
import { inr, todayStr } from "../lib/format";
import { Card, PageHeader, SectionTitle, Loading, Button, Field, Input, Select, Row } from "../components/ui";

const MONTH_START = todayStr().slice(0, 8) + "01";

export default function Reports() {
  const [from, setFrom] = useState(MONTH_START);
  const [to, setTo] = useState(todayStr());
  const { data: cashflow, loading } = useApi(`/api/reports/cashflow?from=${from}&to=${to}&format=json`);

  const dl = (path: string) => `/api/reports/${path}${path.includes("?") ? "&" : "?"}from=${from}&to=${to}`;

  return (
    <div>
      <PageHeader title="Reports" sub="Real numbers from your records, ready to print or share" />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="mb-6 space-y-4">
        <SectionTitle>Cash in vs out (payment dates)</SectionTitle>
        {loading ? (
          <Loading />
        ) : (
          <Card className="p-4">
            {cashflow?.rows?.length ? (
              <div className="divide-y divide-stone-100">
                {cashflow.rows.map((r: any) => (
                  <div key={r.month} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium text-ink">{r.month}</span>
                    <span className="text-brand-700 tabular-nums">in {inr(r.inflow)}</span>
                    <span className="text-red-700 tabular-nums">out {inr(r.outflow)}</span>
                    <span className={`font-semibold tabular-nums ${r.inflow - r.outflow >= 0 ? "text-ink" : "text-red-700"}`}>
                      net {inr(r.inflow - r.outflow)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-ink-mute">No transactions in this period.</p>
            )}
          </Card>
        )}
      </div>

      <SectionTitle>Download reports</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ReportCard
          icon={<FileText size={18} />}
          title="Expenses"
          body="Day-by-day spending with totals, for the date range (Excel)."
          href={dl("expenses?format=excel")}
        />
        <ReportCard
          icon={<FileText size={18} />}
          title="Customer outstanding"
          body="Who owes how much on which site (PDF)."
          href="/api/reports/customer-outstanding"
        />
        <ReportCard
          icon={<FileText size={18} />}
          title="Customer outstanding"
          body="Same list as Excel."
          href="/api/reports/customer-outstanding?format=excel"
        />
        <ReportCard
          icon={<FileText size={18} />}
          title="Supplier outstanding"
          body="Bills vs payments per supplier (PDF)."
          href="/api/reports/supplier-outstanding"
        />
        <ReportCard
          icon={<Sheet size={18} />}
          title="Supplier outstanding"
          body="Same list as Excel."
          href="/api/reports/supplier-outstanding?format=excel"
        />
        <ReportCard
          icon={<Sheet size={18} />}
          title="Attendance summary"
          body="Full days, half days, leave and absent per worker (Excel)."
          href={dl("attendance")}
        />
        <ReportCard
          icon={<Sheet size={18} />}
          title="Cash flow by month"
          body="Inflow and outflow per month (Excel)."
          href={dl("cashflow")}
        />
        <ReportCard
          icon={<Sheet size={18} />}
          title="Open tasks"
          body="Everything still on your list (Excel)."
          href="/api/reports/tasks"
        />
      </div>

      <Card className="mt-4 p-4">
        <SectionTitle>Per-site and per-worker statements</SectionTitle>
        <p className="text-sm text-ink-mute">
          Open any site from <b>My Sites</b> for its full statement, or any worker from <b>People</b> for their wage statement — the
          PDF link is on each page.
        </p>
      </Card>
    </div>
  );
}

function ReportCard({ icon, title, body, href }: { icon: React.ReactNode; title: string; body: string; href: string }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{title}</div>
        <p className="mt-0.5 text-sm text-ink-mute">{body}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
      >
        <Download size={15} /> Get
      </a>
    </Card>
  );
}
