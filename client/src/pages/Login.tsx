import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { post, ApiError } from "../lib/api";
import { Button, ErrorNote, Field, Input } from "../components/ui";
import { useAuth } from "../state/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const me = await post<any>("/api/auth/login", { username, password });
      await refresh();
      navigate(me.needsSetupWizard ? "/setup" : (location.state as any)?.from || "/", { replace: true });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not sign in. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-xl font-bold text-white">A</div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Ambe Construction</h1>
            <p className="text-sm text-ink-mute">Business command center</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <ErrorNote message={err} />
          <Field label="Username" required>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Button type="submit" loading={loading} className="w-full" size="lg">
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-mute">Only the owner has an account. Ask your developer to create one if needed.</p>
      </div>
    </div>
  );
}
