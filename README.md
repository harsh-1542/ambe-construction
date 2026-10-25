# Ambe Construction OS

A complete construction business management MVP for **Ambe Construction** — a single-owner command center that replaces mental bookkeeping with real records: sites, customer payments, expenses, workers & wages, supplier bills, reminders, site diary, documents and reports.

Everything in the UI is backed by real database records. Nothing is simulated.

---

## What's inside

| Module | What it does |
| --- | --- |
| **Dashboard** | Real computed figures: active sites, contract value, money in/out this month, customer/supplier/worker dues, "Needs your attention" (overdue installments, tasks, bills), site-wise summaries, chart |
| **My Sites** | Full project CRUD, installments, extra-work variations (approved ones change the contract value), per-project financials: revised contract, received, balance, costs, estimated profit |
| **Money** | Money In (customer payments + printable PDF receipts), Money Out (expenses, wages, advances, supplier payments), Outstanding Dues. Every entry is editable and voidable with a reason — nothing is silently deleted |
| **People** | Worker directory, fast bulk attendance (full/half/leave/absent), wage calculation from attendance, advances, settlement with review-before-pay, overlapping-settlement protection |
| **Suppliers & Materials** | Supplier directory, bills with due dates and partial payments, optional lightweight stock tracking with negative-stock confirmation |
| **Tasks & Reminders** | Today / overdue / upcoming / completed, reschedule, complete. Completing a reminder never marks a payment as paid |
| **Site Diary** | Daily updates per site: work done, workers, materials, issues, progress % (updates the project), photos |
| **Documents** | Secure vault (contracts, plans, invoices, photos). Files are served only to the signed-in owner |
| **Notes** | Pinned business memory, linkable to sites |
| **Reports** | PDF & Excel exports: expenses, customer/supplier outstanding, attendance, cash flow, open tasks, per-project statements, per-worker wage statements, payment receipts |
| **Global search** | One box finds sites, people, transactions (by description/reference), tasks, notes, documents |

### Accounting rules the app enforces

- All money is stored as **integer paise** — no floating-point drift.
- `Revised contract = original contract + approved variations`
- `Customer outstanding = revised contract − payments received`
- `Estimated profit = revised contract − recorded costs` (clearly labelled as an estimate; cash-basis costs).
- Supplier outstanding = active bills − supplier payments (partial payments supported, allocations validated).
- Worker wages = attendance × rate + extra, minus settlements (overlap-blocked) and advances (advances are money already given, never extra wages).
- Voided transactions are excluded from every total but stay in history; financial edits are written to an audit log.
- Duplicate submissions are blocked via a unique partial index on `clientRequestId`.

---

## Tech stack

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, Lucide icons, Recharts. Mobile-first (bottom nav + Quick Add) with a desktop sidebar.
- **Backend:** Node.js + Express + TypeScript (ESM).
- **Database:** MongoDB with Mongoose (local or MongoDB Atlas).
- **Auth:** bcrypt-hashed owner password, JWT in an HttpOnly cookie, rate-limited login, owner-only setup (no public registration).
- **Files:** stored on disk (`server/data/uploads`) by default, served only to the owner; Cloudinary supported via env var.
- **Exports:** PDFKit (receipts/statements), ExcelJS (Excel reports).
- **Validation:** Zod on every write endpoint, plus Mongoose schema validation.

---

## Running locally

Requirements: Node 18+, and a MongoDB instance (local `mongod` or an Atlas cluster).

```bash
# 1. install everything (root package uses npm workspaces)
npm install

# 2. configure the server
cp server/.env.example server/.env
#   → set MONGODB_URI and a long random AUTH_SECRET

# 3. run both apps (server on :8787, client on :5173)
npm run dev
```

Open http://localhost:5173. The first visit shows the owner-setup screen — create the owner account, then the setup wizard walks you through company details, existing sites, money already received, workers, supplier dues and opening cash. Every step can be skipped.

Useful scripts:

```bash
npm run dev          # server + client together
npm run dev:server   # API only (tsx watch)
npm run dev:client   # Vite only
npm run build        # typecheck + build both
npm test             # server test suite (vitest, needs local MongoDB)
```

### Environment variables (server/.env)

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | yes (prod) | Defaults to `mongodb://127.0.0.1:27017/ambe_construction` in dev |
| `AUTH_SECRET` | yes (prod) | Long random string used to sign sessions |
| `PORT` | no | Default 8787 |
| `AUTH_TOKEN_DAYS` | no | Session lifetime, default 30 |
| `CLIENT_URL` | no | Allowed browser origin, default `http://localhost:5173` (comma-separate for more) |
| `CLOUDINARY_URL` | no | `cloudinary://key:secret@cloud`. Unset → local disk storage |
| `OPENAI_API_KEY` | no | Enables the optional AI assistant; unset → feature off, everything else works |

The client has no secrets — it talks to the API through the Vite dev proxy (`/api` → `:8787`).

---

## Tests

```bash
npm test   # 39 tests: unit tests for money/wage/accounting math + full API integration tests
```

The integration suite covers: owner setup & login, protected endpoints, project CRUD, variations, partial customer payments, receipt PDF, edit + void with balance recalculation, duplicate-request blocking, cross-owner access rejection, bulk attendance (with re-mark upsert), wage calculation, advances, settlement + double-settlement prevention + settlement void, supplier bills & partial payments & payment void, tasks (complete/reschedule/reopen), diary with photo upload, global search, dashboard totals vs recorded transactions, Excel/PDF export smoke tests, and audit logging.

Tests use the `ambe_test` database and wipe it per run — they never touch `ambe_construction`.

> Note: multi-document MongoDB transactions require a replica set (Atlas or `mongod --replSet`). On a standalone local `mongod` the server automatically falls back to sequential writes with compensating checks, so everything still works in dev.

---

## Deployment sketch

- **Frontend → Vercel:** build `client/` (`npm run build` inside the workspace). No env vars needed if the API is served under the same domain or you add `VITE_API_BASE` and point `client/src/lib/api.ts` at it.
- **Backend → Render/Railway:** start `server/` (`npm run build && npm start`), set `MONGODB_URI` (Atlas), `AUTH_SECRET`, `NODE_ENV=production`, `CLIENT_URL` to the frontend origin. Cookies switch to `Secure; SameSite=None` in production, so the API must be served over HTTPS.
- **Database → MongoDB Atlas:** enable daily backups; restore with `mongorestore`.
- **Backups:** `mongodump --uri="$MONGODB_URI"` on a schedule; uploaded files live in `server/data/uploads` (or Cloudinary) — include them in backups.

## Security notes

- One owner, no public registration — the setup endpoint refuses a second owner.
- Session JWT is HttpOnly (invisible to JS), Secure in production, SameSite configured per environment.
- Every query is scoped by `owner` on the server; a valid session can only ever touch its own records.
- Rate limiting on auth endpoints; helmet security headers; CORS restricted to configured origins.
- Uploads: type whitelist + 15 MB cap; documents download only through authenticated endpoints.

## Known limitations (honest list)

- Hindi/Gujarati UI is a settings option but translations are not wired into components yet (default English).
- The AI assistant endpoint exists but is inert without `OPENAI_API_KEY`; it never writes data directly — drafts go through normal validated forms.
- Push notifications/WhatsApp/SMS are not implemented (no claims of delivery).
- PDFs use standard fonts, so ₹ renders as "Rs" in some PDF viewers that lack the rupee glyph.
- Multi-user/tenant support is designed for (owner scoping everywhere) but only one owner can exist.
