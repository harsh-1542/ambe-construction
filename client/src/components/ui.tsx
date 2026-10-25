import React, { useEffect, useRef, useState } from "react";
import { Loader2, X, AlertTriangle, Inbox } from "lucide-react";

// ── Buttons ──────────────────────────────────────────────────────────────────
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className = "", children, disabled, ...rest }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:opacity-50 disabled:cursor-not-allowed select-none";
  const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-12 px-5 text-base" }[size];
  const variants = {
    primary: "bg-brand-700 text-white hover:bg-brand-600 active:bg-brand-800 shadow-sm",
    secondary: "bg-stone-200 text-ink hover:bg-stone-300",
    danger: "bg-red-700 text-white hover:bg-red-600",
    ghost: "text-ink-soft hover:bg-stone-100",
    outline: "border border-stone-300 bg-white text-ink hover:bg-stone-50",
  }[variant];
  return (
    <button className={`${base} ${sizes} ${variants} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

// ── Form fields ──────────────────────────────────────────────────────────────
export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-700">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-mute">{hint}</span>
      ) : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[15px] text-ink placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-stone-100";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className = "", invalid, ...rest }, ref) => (
    <input ref={ref} className={`${inputCls} ${invalid ? "border-red-500" : ""} ${className}`} {...rest} />
  )
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className = "", invalid, ...rest }, ref) => (
    <select ref={ref} className={`${inputCls} appearance-none ${invalid ? "border-red-500" : ""} ${className}`} {...rest} />
  )
);
Select.displayName = "Select";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className = "", invalid, ...rest }, ref) => (
    <textarea ref={ref} className={`${inputCls} min-h-[80px] ${invalid ? "border-red-500" : ""} ${className}`} {...rest} />
  )
);
Textarea.displayName = "Textarea";

// ── Cards / layout bits ──────────────────────────────────────────────────────
export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-xl border border-stone-200 bg-white shadow-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function Badge({ tone = "gray", children }: { tone?: "gray" | "green" | "amber" | "red" | "blue"; children: React.ReactNode }) {
  const tones = {
    gray: "bg-stone-100 text-ink-soft",
    green: "bg-brand-100 text-brand-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}

export function StatCard({
  label,
  value,
  tone,
  sub,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "amber";
  sub?: string;
  onClick?: () => void;
}) {
  const toneCls = tone === "green" ? "text-brand-700" : tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-ink";
  return (
    <div
      onClick={onClick}
      className={`${onClick ? "cursor-pointer hover:border-brand-500/50" : ""} rounded-xl border border-stone-200 bg-white p-4 shadow-card`}
    >
      <div className="text-xs font-medium text-ink-mute">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-mute">{sub}</div>}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-ink-mute ${className}`} size={20} />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-mute">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white/50 px-6 py-10 text-center">
      <Inbox size={28} className="text-stone-400" />
      <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-mute">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ── Modal / bottom sheet ─────────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      setTimeout(() => ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus(), 50);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={ref}
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-6 ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-mute hover:bg-stone-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-ink-soft">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            active === t.id ? "bg-white text-ink shadow-sm" : "text-ink-mute hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-mute">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Row({ label, value, strong, tone }: { label: string; value: React.ReactNode; strong?: boolean; tone?: "green" | "red" }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-ink-mute">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold text-ink" : "text-ink-soft"} ${tone === "green" ? "text-brand-700" : ""} ${tone === "red" ? "text-red-700" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/** Drawer-less searchable select for picking a project quickly. */
export function SearchablePicker({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string }[];
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const current = options.find((o) => o.id === value);
  return (
    <div className="rounded-lg border border-stone-300 bg-white">
      {current && (
        <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2 text-sm">
          <span className="font-medium text-ink">{current.label}</span>
          <button type="button" className="text-xs text-brand-700" onClick={() => onChange("")}>
            change
          </button>
        </div>
      )}
      {(!current || q) && (
        <div className="p-2">
          <input
            className="w-full rounded-md border border-stone-200 px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none"
            placeholder={placeholder || "Search…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-1 max-h-44 overflow-y-auto">
            {filtered.slice(0, 30).map((o) => (
              <button
                key={o.id}
                type="button"
                className="block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-stone-100"
                onClick={() => {
                  onChange(o.id);
                  setQ("");
                }}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-2.5 py-2 text-sm text-ink-mute">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
