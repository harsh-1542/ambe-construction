import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { put, post } from "../lib/api";
import { useAuth } from "../state/AuthContext";
import { Card, PageHeader, SectionTitle, Button, Field, Input, Select, Textarea, ErrorNote } from "../components/ui";

export default function Settings() {
  const { me, refresh, logout } = useAuth();
  const s = me?.settings;
  const [companyName, setCompanyName] = useState(s?.companyName || "Ambe Construction");
  const [phone, setPhone] = useState(s?.phone || "");
  const [address, setAddress] = useState(s?.address || "");
  const [language, setLanguage] = useState<string>(s?.language || "en");
  const [reportFooter, setReportFooter] = useState(s?.reportFooter || "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setSaving(true);
    try {
      await put("/api/auth/settings", { companyName, phone, address, language, reportFooter });
      await refresh();
      setMsg("Saved.");
    } catch (e2: any) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="Settings" sub={`Signed in as ${me?.name} (${me?.username})`} />

      <form onSubmit={save}>
        <Card className="space-y-3.5 p-5">
          <SectionTitle>Business details</SectionTitle>
          <ErrorNote message={err} />
          {msg && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</p>}
          <Field label="Business name" required>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Address">
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Language" hint="Interface language (reports stay in English for now)">
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="gu">ગુજરાતી (Gujarati)</option>
            </Select>
          </Field>
          <Field label="Footer on reports" hint="Shown at the top of every PDF, e.g. your tagline or GST note">
            <Input value={reportFooter} onChange={(e) => setReportFooter(e.target.value)} />
          </Field>
          <div className="text-xs text-ink-mute">Currency: ₹ INR · Timezone: Asia/Kolkata</div>
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Save settings
            </Button>
          </div>
        </Card>
      </form>

      <Card className="p-5">
        <SectionTitle>Data & backups</SectionTitle>
        <p className="text-sm leading-relaxed text-ink-mute">
          All records live in your MongoDB database. Export backups regularly — with MongoDB tools:
          <code className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-xs">mongodump --uri="your-connection-string"</code>
        </p>
      </Card>

      <Card className="p-5">
        <SectionTitle>Session</SectionTitle>
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
