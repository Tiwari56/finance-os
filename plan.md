# Finance OS — Modular Redesign Plan (v2)

## Context

The current Finance OS works — the user's iPhone → n8n → `/api/log-expense` pipeline is live, and every feature (Today, Reports, History, Spending, Debts, IOUs, Bills, Advisor, Config) is in production. But the foundation has problems that will get worse as data grows:

1. **1700-line `app/page.js`** with inline styles and every tab in one file — hard to read, harder to extend
2. **Single `lib/store.js`** that reads/writes the whole JSON blob per mutation — not atomic across related changes, doesn't scale
3. **No types** — caught bugs like `family bill ₹1500 vs ₹15000` only by manual review
4. **In-code migrations** (`splitFriends`, `linkDebtExpenses`) run on every state read — won't scale
5. **Cluttered dashboard** — Today tab tries to show everything; first-time users see 8+ cards with no guidance
6. **Configuration is hard to discover** — 6 settings sections mixed with the rest; no way to see "what features exist + what each one does"

The user picked: **Incremental upgrade (Next.js+TS) · Vercel · web-only**, and added three constraints:
- **User-friendly dashboard + setup** — not visually overwhelming, easy first-time setup
- **Centralized feature inventory** — every feature visible in one place with a description, settings, status; easy to manage
- **Modular architecture** — each feature is self-contained, easy to add/change/remove without touching others

**Cost target:** $0/month (Vercel Free + Turso Free + Resend Free + Anthropic pay-per-use ≈ $0.10/mo).

---

## Architecture: feature-module pattern

Each feature lives in its own folder under `features/<name>/` and is **self-contained** — own components, own API routes, own DB schema fragment, own pure logic, own settings, own manifest. Adding a feature = dropping a folder. Removing one = deleting it.

### Folder layout

```
finance-os/
├── app/                              # Next.js App Router shell only
│   ├── layout.tsx
│   ├── page.tsx                       # Hosts the tab shell + feature registry
│   └── api/
│       └── [...feature]/route.ts      # Single catch-all that dispatches to features
├── features/                         # All business logic lives here
│   ├── _registry.ts                   # Auto-discovered list of all features
│   ├── core/                          # Always-on infrastructure
│   │   ├── db/
│   │   │   ├── client.ts              # Drizzle/libSQL singleton
│   │   │   └── schema.ts              # Imports + re-exports every feature's schema
│   │   ├── types.ts
│   │   └── manifest.ts
│   ├── expenses/
│   │   ├── manifest.ts                # ← describes the feature (see below)
│   │   ├── schema.ts                  # Drizzle table for expenses
│   │   ├── api/
│   │   │   ├── log.ts                 # POST → /api/expenses/log (n8n webhook target)
│   │   │   ├── list.ts                # GET  → /api/expenses/list
│   │   │   └── delete.ts              # POST → /api/expenses/delete
│   │   ├── components/
│   │   │   ├── ExpenseList.tsx
│   │   │   ├── ExpenseForm.tsx
│   │   │   └── TodayLogCard.tsx       # Embedded on Today tab
│   │   ├── lib/
│   │   │   ├── categorize.ts          # merchant → category logic
│   │   │   └── parseSms.ts             # exported for n8n parity testing
│   │   └── tests/
│   │       └── categorize.test.ts
│   ├── debts/                         # same shape — schema, api, components, lib, manifest, tests
│   ├── ious/
│   ├── bills/
│   ├── envelopes/
│   ├── goals/
│   ├── allowance/                     # Daily allowance math + Today hero card
│   ├── recommendations/               # Rule-based suggestions engine
│   ├── advisor/                       # AI analysis (Claude)
│   ├── reports/                       # Email reports via Resend
│   ├── history/                       # 6/12mo aggregations
│   ├── automation/                    # n8n SMS contract + idempotency
│   └── config/                        # Settings UI (reads every feature's manifest)
├── db/
│   ├── migrations/                    # drizzle-kit output, version-controlled
│   └── seed.ts
├── lib/
│   ├── format.ts                       # fmt, fmtL — used everywhere
│   └── ui/                             # Shared primitives (Card, Pill, Input, Modal)
├── scripts/
│   └── migrate-from-json.ts            # One-shot import from data/finance-state.json
└── (config files: tsconfig, drizzle.config, tailwind.config, vitest.config, etc.)
```

### Feature manifest — the centralization piece

Every feature exports a `manifest.ts` that **declaratively describes itself**. The Config tab is generated from these manifests — so there's exactly one place that knows what every feature is, what it does, and what settings it has. No hidden settings, no orphan code.

```ts
// features/bills/manifest.ts
import { defineFeature } from "@/features/core/types";
import { billsTable, billPaymentsTable } from "./schema";
import * as actions from "./api";
import { BillsConfigSection } from "./components/BillsConfigSection";
import { BillsTodayCard }   from "./components/BillsTodayCard";

export default defineFeature({
  id:          "bills",
  name:        "Fixed bills tracker",
  description: "Track recurring monthly bills (rent, OTT, family mobile) with due dates. Bills can be marked paid in full or partial; status shows overdue/due-soon.",
  category:    "money",                  // money | debts | analysis | automation | system
  icon:        "📋",
  version:     1,

  // What this feature contributes to the DB
  schemas:     [billsTable, billPaymentsTable],

  // API endpoints (URL prefix = feature id)
  routes:      {
    "POST /pay":         actions.payBill,        // → /api/bills/pay
    "POST /undo":        actions.undoBill,
    "POST /upsert":      actions.upsertBill,
    "POST /delete":      actions.deleteBill,
    "GET  /status":      actions.getBillsStatus,
  },

  // UI contributions
  ui: {
    todayCard:     { component: BillsTodayCard, order: 30 },   // ordered slots on Today tab
    configSection: { component: BillsConfigSection, order: 30 }, // ordered sections in Config
  },

  // User-editable settings (rendered automatically in Config → Bills with descriptions + tooltips)
  settings: [
    {
      key:         "due_soon_threshold_days",
      label:       "Mark bill as 'due soon' if within...",
      description: "How many days before due date should the bill turn yellow on the dashboard?",
      type:        "number",
      default:     3,
      min:         0, max: 14,
    },
    {
      key:         "auto_link_debt_expenses",
      label:       "Auto-link debt-category expenses",
      description: "When you log an expense with category 'debt', automatically create a paired debt payment and reduce the matched debt's balance.",
      type:        "boolean",
      default:     true,
    },
  ],

  // Other features this one needs (loaded first; errors if missing)
  dependencies: ["expenses", "envelopes"],

  // Integration health — surfaced in Config → System Health
  health: async () => ({ ok: true, info: "Ready" }),
});
```

### Why this works for the three asks

| Ask | Solution |
|---|---|
| **"Every feature centralized + easily managable with description"** | One folder per feature, one manifest per folder, one Config tab that reads all manifests. Future-you (or any agent) opens `features/<X>/manifest.ts` and sees the entire surface area of that feature. |
| **"Modular — easy to migrate / add / change specific parts"** | Adding a new feature = creating a folder + manifest. The catch-all API route auto-mounts it. The Config tab auto-renders it. The DB schema auto-includes it. No edits anywhere else. |
| **"User-friendly dashboard + setup"** | Today tab is now driven by `ui.todayCard` slots — features opt into the dashboard with ordering. Sections that aren't relevant for a first-time user (e.g. Renovation fund when goal=0) hide themselves. Setup wizard walks new users through dependency-ordered manifests. |

### Auto-discovery pattern

A single `features/_registry.ts` imports every feature folder and validates manifests. At build time:

```ts
// features/_registry.ts
import expenses    from "./expenses/manifest";
import debts       from "./debts/manifest";
import bills       from "./bills/manifest";
// ...

export const FEATURES = [expenses, debts, bills, /* ... */] as const;
export type FeatureId = (typeof FEATURES)[number]["id"];

// Topological sort by dependencies — used by the catch-all router and Config tab
export const FEATURES_ORDERED = sortByDependencies(FEATURES);
```

The catch-all route `app/api/[...feature]/route.ts` parses `/api/bills/pay` → looks up `bills` in registry → calls `routes["POST /pay"]`. One thin router for everything; per-feature handlers are pure async functions with typed input (via Zod) and typed output.

---

## Dashboard UX redesign

The current Today tab packs 8+ cards above the fold. The redesigned tab uses a **slot system** (driven by `manifest.ui.todayCard`) plus a **simplicity-first default**: first-time users see one "Get started" card and an empty allowance hero. Cards only appear once the relevant feature has data.

### New Today layout

```
┌──────────────────────────────────────────────┐
│  Finance OS              Wed, 4 June  ⚙️     │
└──────────────────────────────────────────────┘

   ╔══════════════════════════════════════════╗
   ║  YOU CAN SPEND TODAY                     ║
   ║                                          ║   ← Hero allowance (allowance feature)
   ║      ₹1,247                              ║      Always visible
   ║      of ₹1,538 daily · 28 days to payday ║
   ║      ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░               ║
   ╚══════════════════════════════════════════╝

   ┌── 🔴 1 thing needs attention ──────────┐    ← Only shown if recommendations has urgent
   │  Rent OVERDUE · ₹28,000                 │      items. Auto-hides on empty.
   └─────────────────────────────────────────┘

   ┌── This month ──────────────────────────┐    ← Whole-money: collapsed by default
   │  Spent ₹X · Bills due ₹Y · Free ₹Z     │      Tap chevron to expand envelope grid
   │  ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░  17%  ⌄       │
   └─────────────────────────────────────────┘

   ┌── Bills (3/6 paid) ────────────────────┐   ← Bills card: compact list with "log"
   │  ✓ Rent       ₹28,000                   │      inline. Heavy editing → Config tab.
   │  ● Family mobile  ₹15,000  [Log ₹15k]  │
   │  ● Maintenance    ₹8,000   [Log ₹8k]   │
   │  +3 more  →                            │
   └─────────────────────────────────────────┘

   ┌── Today's log (3) ─────────────────────┐
   │  🍱 Swiggy            ₹450             │
   │  📺 Netflix renewal   ₹649             │
   │  🚇 Uber              ₹212             │
   └─────────────────────────────────────────┘

   [+ Add expense] [+ Log payment] [+ Add IOU]   ← Floating actions
```

**Specific UX improvements:**

1. **Progressive disclosure** — every secondary card has a chevron; collapsed by default for items without warnings. Power users can pin sections open via a setting.
2. **Empty states with onboarding** — "No expenses today. Set up SMS auto-logging? [Open Config]" replaces blank cards.
3. **Inline actions** — "Log payment" / "Mark paid" stay on the row instead of opening modals. Reduces clicks.
4. **Smart hiding** — Renovation Goal card hides when `needed - saved == 0`. IOU card hides when no open IOUs. AI Analysis card hides if no API key, replaced by a setup link.
5. **One floating action bar** — three big buttons replace the scattered "+ Add" buttons. Mobile-thumb friendly.
6. **Top-right ⚙️ gear** — always one tap to Config.
7. **Coach voice softer for green states** — current verdict copy is good for warnings but feels hostile when on track. Tone scales with urgency level.

### Setup wizard (first-run experience)

First time a user opens the app (detected: zero expenses + default profile), instead of dropping them on a confusing dashboard, route to `/setup`:

```
Step 1 of 5 — Tell us about you
  Name: _______________
  Monthly income (₹): _______
  Salary credit day: __ (1-31)
  [Next →]

Step 2 of 5 — How does your money split?
  We've allocated your ₹1,80,000 across envelopes.
  Tweak any to match your reality:
  🏠 Survival       ₹63,500   [edit]
  🍱 Food           ₹15,000   [edit]
  🎯 Freedom        ₹15,000   [edit]
  ⚔️  Debt Assault   ₹73,500   [edit]
  📈 SIP            ₹8,000    [edit]
  🔒 Emergency      ₹5,000    [edit]
  → Sum: ₹1,80,000 ✓ matches income
  [← Back]  [Next →]

Step 3 of 5 — Your fixed monthly bills
  Add bills you pay every month (rent, OTT, etc.)
  [+ Add bill]   [Skip — I'll add later]
  [← Back]  [Next →]

Step 4 of 5 — Your current debts
  (none added) [+ Add debt]
  Common types: 💳 Credit card · 🏦 Loan · 🤝 Friend
  [← Back]  [Next →]

Step 5 of 5 — Integrations
  📧 Daily email summary    [Connect Resend]  — what's this?
  🧠 AI Advisor             [Add Anthropic key] — what's this?
  📱 SMS auto-logging        [Show me how]      — what's this?
  All optional. Skip any you don't need yet.
  [← Back]  [Open dashboard]
```

Each step has a one-line description below the heading explaining why it matters and what happens with the data.

### Config tab — generated from manifests

The Config tab becomes a navigable list grouped by `manifest.category`, where each section is rendered by the feature's own `configSection` component. Plus a global header that lists every feature with its description and on/off toggle:

```
Configuration

  ─── FEATURES (12 active) ───────────────────────
  Click a feature to expand and configure it.

  💰 Expenses          Core · enabled       ⌄
       Log every transaction. Webhook target for SMS automation.
  ⚔️  Debts             Core · enabled       ⌄
       Track loans, credit cards, and friend debts with avalanche projection.
  📋 Bills              Core · enabled       ⌄
       Fixed recurring bills with due dates and partial payments.
  📥 IOUs               Optional · enabled   ⌄
       Track money you've lent out.
  🧱 Goals              Optional · enabled   ⌄
       Save toward goals like renovation.
  📈 Reports            Optional · enabled   ⌄
       Daily/weekly email summaries via Resend.
  🧠 AI Advisor         Optional · disabled  ⌄
       Claude-powered analysis. Needs ANTHROPIC_API_KEY.
       [Set up →]
  📱 SMS Automation     Optional · ready     ⌄
       Webhook for n8n/OpenCLAW to log SMS as expenses.
  ...

  ─── SYSTEM ─────────────────────────────────────
  💾 Storage             SQLite (Turso)     · 47 KB · 142 expenses
  🔐 Webhook secret      [rotate]
  📤 Export data         [download JSON]
  📥 Import data         [upload JSON]
```

When a feature is expanded, its `configSection.component` renders inline — that's where it shows what the feature manages (envelope amounts, bill list, debt balances, etc). Description text from `manifest.description` and `manifest.settings[].description` is always visible. Tooltips on every setting key.

---

## Database schema (Drizzle + Turso)

Each feature owns its tables in its own `schema.ts`, imported by `features/core/db/schema.ts` for migrations. Schema below is the same as the v1 plan, just split by ownership:

| Feature | Owns tables |
|---|---|
| `expenses` | `expenses` |
| `debts` | `debts`, `debt_payments` |
| `ious` | `ious` |
| `envelopes` | `envelopes` (replaces config.envelopes JSON) |
| `bills` | `bills`, `bill_payments` |
| `goals` | `goals`, `goal_contributions` |
| `core` | `profile`, `flags`, `app_state`, `month_history` |

Constraints worth noting:
- `expenses.client_request_id UNIQUE` — replaces the manual idempotency check
- `debt_payments.expense_id REFERENCES expenses(id)` — proper FK for the paired link
- Indexes on every `ts` column for fast monthly aggregation

---

## Implementation phases (6 phases, ~1 week)

Each phase ships independently; the app keeps working after every phase.

### Phase 1 — Skeleton + TypeScript (½ day)
- Add `tsconfig.json` (strict), `tailwind.config.ts`, basic Tailwind extraction of the current dark palette
- Create the empty `features/` folder structure with a stub `core/manifest.ts`
- Define `defineFeature()` helper + `FeatureManifest` types in `features/core/types.ts`
- Convert pure logic first: [lib/finance.js](lib/finance.js) → `features/core/lib/format.ts` + per-feature `lib/*.ts` slices

**Verification:** `pnpm tsc --noEmit` clean. App still runs from `app/page.js` (untouched).

### Phase 2 — DB (Drizzle + Turso) + data import (1 day)
- Install: `drizzle-orm @libsql/client drizzle-kit zod`
- Create per-feature `schema.ts` files + central `db/index.ts` client
- Local dev: `file:./data/finance.db`. Prod: Turso URL+token via Vercel env
- `pnpm drizzle-kit generate` → first migration
- Write `scripts/migrate-from-json.ts` — reads existing [data/finance-state.json](data/finance-state.json), inserts everything in a single transaction, runs the in-code migrations (splitFriends, linkDebtExpenses) once into the relational shape

**Verification:** Run the migration. Open Drizzle Studio (`pnpm drizzle-kit studio`) → verify expense count matches `state.expenses.length`, debt count matches, friend tags present, Akshit's paired payment linked correctly. Keep `data/finance-state.json` as backup.

### Phase 3 — Feature manifests + catch-all router (1½ days)
- Build one feature end-to-end first to validate the pattern: **`expenses`**. It's the smallest and has the n8n contract that must not break.
  - `features/expenses/manifest.ts`
  - `features/expenses/schema.ts`
  - `features/expenses/api/log.ts` — replaces the current `/api/log-expense`, mounted at `/api/expenses/log`
  - `features/expenses/lib/categorize.ts`
- Add `app/api/[...feature]/route.ts` — catch-all dispatcher that reads the registry
- Add backward-compat shim: `app/api/log-expense/route.ts` that forwards to `/api/expenses/log` so the n8n workflow keeps working without changes
- Convert next: `debts`, `bills`, `ious`, `goals`, `envelopes`, `core` (profile/flags)
- Convert last: `advisor`, `reports`, `history`, `recommendations` (these read others)

**Verification:** n8n SMS test → `curl POST /api/log-expense` → 200 with same body shape. Daily Vercel cron `/api/send-report?type=daily` → email arrives.

### Phase 4 — Frontend rebuild (2 days)
- New `app/page.tsx` becomes the tab shell only; renders `<TodayTab>`, `<ConfigTab>`, etc.
- Each tab pulls slotted components from the feature registry
- Migrate inline styles → Tailwind utilities, 1:1 visual translation of the dark theme
- Add React Query for `/api/state` and `/api/history`
- Implement the new Today layout with progressive disclosure
- Implement the Config tab driven by manifests
- Implement the Setup wizard route `/setup` with the 5 steps

**Verification:** every existing button still works, dark theme identical, dashboard feels less crowded (zero-data state shows only hero + onboarding card).

### Phase 5 — Tests + tooling (½ day)
- Vitest for pure logic in each feature's `lib/` (categorize, allowance math, recommendations, fuzzy debt matcher, SMS parser parity with n8n)
- Playwright E2E covering: setup wizard → log expense via UI → log expense via webhook → mark bill paid → see updated debt summary
- GitHub Actions (free tier) running `tsc --noEmit && vitest run && playwright test` on every push

**Verification:** all tests green. CI badge stays green.

### Phase 6 (optional bonus) — SSE realtime + PWA-ready meta
- `features/automation/api/events.ts` — Server-Sent Events stream. After any mutation, broadcast `{ type: "state-changed" }`
- Client subscribes via native `EventSource`, invalidates React Query cache on each event
- Result: SMS logged via n8n at 3 PM → laptop browser updates instantly without polling
- Add minimal `manifest.webmanifest` so iOS Safari "Add to Home Screen" works decently (no full PWA effort)

---

## Files that change

| Type | Files |
|---|---|
| **Rewritten** (and split into many small TS files per feature) | [lib/finance.js](lib/finance.js), [lib/store.js](lib/store.js), [app/page.js](app/page.js), every [app/api/*/route.js](app/api/) |
| **New** | `features/<each>/manifest.ts` + `schema.ts` + `api/*.ts` + `components/*.tsx` + `lib/*.ts`, `db/migrations/`, `scripts/migrate-from-json.ts`, `tsconfig.json`, `tailwind.config.ts`, `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts` |
| **Backward-compat shim** | `app/api/log-expense/route.ts` forwarding to `/api/expenses/log` so n8n stays untouched |
| **Updated config** | [vercel.json](vercel.json) cron paths if needed (likely unchanged), `.env.local` adds `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` |
| **Untouched** | `/N8N-Automation/workflows/` — same contracts. `data/finance-state.json` — kept as backup, no longer read after Phase 2. |

---

## Cost — actual $0/month

| Service | Tier | Limit | Your usage | Cost |
|---|---|---|---|---|
| Vercel | Free Hobby | 100 GB bandwidth, 1M function invocations/mo, 2 cron jobs | <1 GB, <50k invocations | **$0** |
| Turso | Starter | 9 GB storage, 1B reads, 25M writes/mo | <100 MB, <1M reads | **$0** |
| Resend | Free | 3000 emails/mo, 100/day | ~31/mo | **$0** |
| Anthropic | Pay-per-use | — | 1× analyze/day @ ~$0.003 | **~$0.10/mo** |

---

## Verification (end-to-end sanity checklist)

After each phase, the following must pass:

1. **N8N still logs SMS:** `curl -X POST http://localhost:3000/api/log-expense -H 'Content-Type: application/json' -d '{"amount":450,"merchant":"Swiggy","secret":"<LOG_SECRET>"}'` → 200 with same JSON shape as before.
2. **Idempotency:** repeat with same `clientRequestId` → `{ok:true, duplicate:true}`.
3. **Reports tab loads** with proper data from React Query.
4. **History tab — 24mo range** responds in under 100ms (real SQL aggregation).
5. **Setup wizard** routes new users (zero expenses + default profile detected) → completes in <2 minutes → drops on populated dashboard.
6. **Config tab** lists every feature with description + on/off toggle, sections expand to show settings inline.
7. **Bills card on Today tab** shows compact list, "log" inline; full editing in Config.
8. **Daily email** still arrives at 8:30 IST.
9. **AI advisor analyze** still produces the 5-section structured response.
10. `pnpm tsc --noEmit` zero errors, `pnpm test` all green, `pnpm test:e2e` all green.

---

## Tradeoffs accepted

- **More files** — but each is small and single-purpose. The 1700-line `page.js` becomes ~30 focused files of <150 lines each.
- **Feature manifest learning curve** — small, paid back the first time you add a new feature without touching 5 unrelated files.
- **TypeScript build time** — adds a few seconds; Vercel's incremental build handles it.
- **Setup wizard adds a route** — but it dramatically improves first-run experience and is skippable for existing users (detected via expense count).

---

## Out of scope (deliberate)

- PWA / installable app — user said web-only
- Native mobile — same
- Multi-user / auth — single-user assumed
- Design system rewrite — Tailwind is a 1:1 visual translation, not a rebrand
- New features — purely a foundation + UX swap. Every existing tab/button stays.
