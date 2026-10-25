import React, { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, HardHat, IndianRupee, Users, Truck, CheckSquare, FileBarChart, FolderOpen, Settings as SettingsIcon, MoreHorizontal, Plus, LogOut, Search, StickyNote } from "lucide-react";
import { useAuth } from "../state/AuthContext";
import { QuickAdd } from "./QuickAdd";
import { Modal, Button } from "./ui";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/projects", label: "My Sites", icon: HardHat },
  { to: "/money", label: "Money", icon: IndianRupee },
  { to: "/workers", label: "People", icon: Users },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/documents", label: "Documents", icon: FolderOpen },
  { to: "/notes", label: "Notes", icon: StickyNote },
  { to: "/materials", label: "Materials", icon: FolderOpen },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const MAIN_NAV = NAV.slice(0, 7);
const MOBILE_BOTTOM = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/projects", label: "Sites", icon: HardHat },
  { to: "/money", label: "Money", icon: IndianRupee },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAuth();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const companyName = me?.settings?.companyName || "Ambe Construction";

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-stone-200 bg-white md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 font-bold text-white">A</div>
          <div>
            <div className="text-sm font-semibold leading-tight text-ink">{companyName}</div>
            <div className="text-xs text-ink-mute">Construction OS</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {MAIN_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium ${
                  isActive ? "bg-brand-50 text-brand-800" : "text-ink-soft hover:bg-stone-100"
                }`
              }
            >
              <n.icon size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-0.5 border-t border-stone-100 px-3 py-3">
          {NAV.slice(7).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-brand-50 text-brand-800" : "text-ink-mute hover:bg-stone-100"
                }`
              }
            >
              <n.icon size={16} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur md:pl-60">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">A</div>
            <span className="text-sm font-semibold">{companyName}</span>
          </div>
          <form onSubmit={submitSearch} className="ml-auto flex-1 md:ml-0 md:max-w-md" role="search">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search anything…"
                aria-label="Search"
                className="w-full rounded-full border border-stone-200 bg-stone-100 py-2 pl-9 pr-3 text-sm focus:border-brand-600 focus:bg-white focus:outline-none"
              />
            </div>
          </form>
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-sm text-ink-soft">{me?.name}</span>
            <button onClick={() => logout()} className="rounded-lg p-2 text-ink-mute hover:bg-stone-100" title="Sign out" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="pb-safe md:pl-60">
        <div className="mx-auto max-w-5xl px-4 py-4 md:py-6">{children}</div>
      </main>

      {/* Desktop floating quick add */}
      <button
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-6 right-6 z-30 hidden items-center gap-2 rounded-full bg-brand-700 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg hover:bg-brand-600 md:inline-flex"
      >
        <Plus size={18} /> Quick Add
      </button>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Mobile">
        <div className="grid grid-cols-5 items-center px-2 py-1">
          {MOBILE_BOTTOM.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 rounded-lg py-2 text-[11px] font-medium ${isActive ? "text-brand-700" : "text-ink-mute"}`}
            >
              <n.icon size={20} />
              {n.label}
            </NavLink>
          ))}
          <button onClick={() => setQuickAddOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium" aria-label="Quick add">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-white shadow-md">
              <Plus size={20} />
            </span>
            Add
          </button>
          <button onClick={() => setMoreOpen(true)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${location.pathname === "/more" ? "text-brand-700" : "text-ink-mute"}`}>
            <MoreHorizontal size={20} />
            More
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-2 gap-2">
          {NAV.slice(3).map((n) => (
            <button
              key={n.to}
              onClick={() => {
                setMoreOpen(false);
                navigate(n.to);
              }}
              className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3.5 text-left text-sm font-medium text-ink hover:bg-stone-50"
            >
              <n.icon size={18} className="text-brand-700" />
              {n.label}
            </button>
          ))}
          <button
            onClick={() => {
              setMoreOpen(false);
              logout();
            }}
            className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3.5 text-left text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </Modal>

      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
}
