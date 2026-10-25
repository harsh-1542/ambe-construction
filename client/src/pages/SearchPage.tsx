import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search as SearchIcon } from "lucide-react";
import { get } from "../lib/api";
import { Loading, EmptyState, Card } from "../components/ui";
import { PageHeader } from "../components/ui";

const KIND_LABELS: Record<string, string> = {
  project: "Site",
  worker: "Worker",
  supplier: "Supplier",
  txn: "Transaction",
  task: "Task",
  note: "Note",
  doc: "Document",
};

export default function SearchPage() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function run(query: string) {
    if (query.trim().length < 2) return;
    setLoading(true);
    try {
      const d = await get(`/api/search?q=${encodeURIComponent(query)}`);
      setResults(d.results);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initial = params.get("q");
    if (initial) run(initial);
  }, [params]);

  return (
    <div>
      <PageHeader title="Search" sub="Sites, people, money, tasks, notes, documents" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
        className="mb-4 flex gap-2"
      >
        <div className="relative flex-1">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a name, site, reference or note…"
            className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-9 pr-3 text-[15px] focus:border-brand-600 focus:outline-none"
          />
        </div>
        <button type="submit" className="rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-600">
          Search
        </button>
      </form>

      {loading ? (
        <Loading />
      ) : results === null ? null : results.length === 0 ? (
        <EmptyState title="No matches" body="Try a different word — names, amounts, references and note text all work." />
      ) : (
        <div className="space-y-2">
          {results.map((r, i) => (
            <Card key={`${r.kind}-${r.id}-${i}`} className="p-0">
              <button onClick={() => navigate(r.link)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-stone-50">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-ink-mute">{KIND_LABELS[r.kind] || r.kind}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                  {r.subtitle && <span className="block truncate text-xs text-ink-mute">{r.subtitle}</span>}
                </span>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
