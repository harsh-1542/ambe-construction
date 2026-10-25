import React, { useState } from "react";
import { Upload, File as FileIcon, Image, Download, Trash2 } from "lucide-react";
import { useApi } from "../lib/hooks";
import { del } from "../lib/api";
import { fmtDate } from "../lib/format";
import { Card, PageHeader, Loading, EmptyState, Badge, Button, Modal, Field, Input, Select, Textarea, ErrorNote } from "../components/ui";
import { useProjects } from "../components/forms";

const CATEGORIES = [
  { id: "contract", label: "Contract" },
  { id: "quotation", label: "Quotation" },
  { id: "variation", label: "Approved variation" },
  { id: "supplier_invoice", label: "Supplier invoice" },
  { id: "receipt", label: "Receipt" },
  { id: "site_photo", label: "Site photo" },
  { id: "plan", label: "Building plan" },
  { id: "other", label: "Other" },
];

export default function Documents() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data, loading, reload } = useApi(`/api/documents${q || category ? `?${[q ? `q=${encodeURIComponent(q)}` : "", category ? `category=${category}` : ""].filter(Boolean).join("&")}` : ""}`);
  const docs: any[] = data?.docs || [];

  return (
    <div>
      <PageHeader
        title="Documents"
        sub="Contracts, plans, invoices and photos"
        action={
          <Button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-2">
            <Upload size={16} /> Upload
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="min-w-[180px] flex-1" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
          <option value="">All types</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Loading />
      ) : docs.length === 0 ? (
        <EmptyState title="No documents" body="Upload contracts, building plans, supplier invoices and site photos. Only you can see them." action={<Button onClick={() => setUploadOpen(true)}>Upload first file</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {docs.map((d) => (
            <Card key={d._id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100">
                  {d.mimeType.startsWith("image/") ? <Image size={18} className="text-ink-mute" /> : <FileIcon size={18} className="text-ink-mute" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{d.title}</div>
                  <div className="mt-0.5 text-xs text-ink-mute">
                    {fmtDate(d.createdAt?.slice(0, 10))} · {(d.size / 1024).toFixed(0)} KB
                    {d.project ? ` · ${d.project.name}` : ""}
                  </div>
                  <div className="mt-1.5">
                    <Badge>{CATEGORIES.find((c) => c.id === d.category)?.label || d.category}</Badge>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2 border-t border-stone-100 pt-3">
                <a href={`/api/documents/${d._id}/file`} target="_blank" rel="noreferrer" className="flex-1 rounded-lg border border-stone-300 py-2 text-center text-sm font-medium hover:bg-stone-50">
                  View
                </a>
                <a href={`/api/documents/${d._id}/download`} className="rounded-lg border border-stone-300 p-2 hover:bg-stone-50" title="Download">
                  <Download size={16} />
                </a>
                <button
                  onClick={async () => {
                    if (confirm(`Delete "${d.title}"? This cannot be undone.`)) {
                      await del(`/api/documents/${d._id}`);
                      reload();
                    }
                  }}
                  className="rounded-lg border border-stone-300 p-2 text-ink-mute hover:bg-red-50 hover:text-red-700"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload document">
        <UploadForm
          onCancel={() => setUploadOpen(false)}
          onSaved={() => {
            setUploadOpen(false);
            reload();
          }}
        />
      </Modal>
    </div>
  );
}

function UploadForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const projects = useProjects();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!file) return setErr("Choose a file");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title || file.name);
    fd.append("category", category);
    if (project) fd.append("project", project);
    if (description) fd.append("description", description);
    setSaving(true);
    try {
      const res = await fetch("/api/documents", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
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
      <Field label="File" required hint="Images, PDF, Word, Excel — up to 15 MB">
        <input
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-800"
        />
      </Field>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file?.name || "Document title"} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
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
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Upload
        </Button>
      </div>
    </form>
  );
}
