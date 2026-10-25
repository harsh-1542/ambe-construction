import React, { useState } from "react";
import { Plus, Pin, Trash2 } from "lucide-react";
import { useApi } from "../lib/hooks";
import { post, put, del } from "../lib/api";
import { fmtDate } from "../lib/format";
import { Card, PageHeader, Loading, EmptyState, Button, Modal } from "../components/ui";
import { NoteForm } from "../components/forms";

export default function Notes() {
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const { data, loading, reload } = useApi(`/api/notes${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const notes: any[] = data?.notes || [];

  return (
    <div>
      <PageHeader
        title="Business Notes"
        sub="Promises, commitments and context you don't want to forget"
        action={
          <Button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-2">
            <Plus size={16} /> Add note
          </Button>
        }
      />

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search notes…"
        className="mb-4 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[15px] focus:border-brand-600 focus:outline-none"
      />

      {loading ? (
        <Loading />
      ) : notes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          body={'Write things like "Customer will pay after slab completion" or "Supplier delivers steel on Monday".'}
          action={<Button onClick={() => setNewOpen(true)}>Write first note</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <Card key={n._id} className={`p-4 ${n.pinned ? "border-amber-200 bg-amber-50/40" : ""}`}>
              <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
              <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2.5">
                <span className="text-xs text-ink-mute">
                  {n.project ? `${n.project.name} · ` : ""}
                  {fmtDate(n.updatedAt?.slice(0, 10))}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={async () => {
                      await put(`/api/notes/${n._id}`, { pinned: !n.pinned });
                      reload();
                    }}
                    className={`rounded-lg p-1.5 ${n.pinned ? "text-amber-600" : "text-stone-300 hover:text-ink-mute"}`}
                    title={n.pinned ? "Unpin" : "Pin"}
                  >
                    <Pin size={15} />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm("Delete this note?")) {
                        await del(`/api/notes/${n._id}`);
                        reload();
                      }
                    }}
                    className="rounded-lg p-1.5 text-stone-300 hover:text-red-700"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Add note">
        <NoteForm
          onSaved={() => {
            setNewOpen(false);
            reload();
          }}
          onCancel={() => setNewOpen(false)}
        />
      </Modal>
    </div>
  );
}
