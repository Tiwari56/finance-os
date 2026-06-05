# Finance OS

A personal finance command center for Nishit — Next.js app that tracks the whole ₹1.8L/month picture, auto-categorizes bank-email expenses, runs AI analysis, and emails daily/weekly reports.

> **For agents picking this up:** this is a single-user app, deployed (or runnable locally) as a Next.js 14 App Router project. State persists to Vercel KV in production, in-memory locally. All financial constants live in [lib/finance.js](lib/finance.js).

---

## What this app does

1. **Tracks every rupee** across 6 envelopes (Survival / Food / Freedom / SIP / Debt / Emergency) summing to the ₹1,80,000 monthly income.
2. **Auto-logs bank emails** via OpenCLAW/n8n → `POST /api/log-expense` with auto-categorization from merchant text.
3. **Daily allowance engine** — splits flex budget (Food + Freedom) by days remaining.
4. **Fixed bills tracker** — 6 recurring bills with due dates, partial-payment support, status badges (overdue / due-soon / paid).
5. **Auto-recommendations engine** — surfaces overdue bills, overspent envelopes, credit-card urgency, renovation goal gap, underused flex (deterministic rules, no LLM).
6. **AI Analysis** — Claude generates a structured 5-section read (Health, Capacity, Top Leak, Top Opportunity, Next 7 Days) on demand.
7. **Email reports** — daily 8:30 AM IST + weekly Monday 7:30 AM IST via Vercel Cron + Resend.
8. **Avalanche debt projection** — month-by-month payoff curve, highest interest first.
9. **Renovation fund tracker** — ₹2L tile-work goal with progress bar and contribution log.
10. **Impulse jail** — log unplanned spends, wait 10 minutes, track money saved by saying no.

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local        # then edit values (see "Env vars" below)
npm run dev                       # → http://localhost:3000
```

Data lives in memory locally (no KV setup needed). Restart = fresh state.

---

## Real budget (hardcoded in [lib/finance.js](lib/finance.js))

| Envelope | Amount | What it covers |
|---|---:|---|
| 🏠 Survival | ₹63,500 | Rent 28k · Maintenance+electricity 8k · Family mobile 15k · Furlenco 5k · Commute 6k · OTT 1.5k |
| 🍱 Food | ₹15,000 | Groceries + cooking |
| 🎯 Freedom | ₹15,000 | Personal, party, smokes |
| 📈 SIP | ₹8,000 | Auto-debit mutual fund SIP |
| ⚔️ Debt Assault | ₹73,500 | EMIs (Edu 7k + Axis 11k + MF interest 2k = 20k) + extra attack (53.5k) |
| 🔒 Emergency | ₹5,000 | Small buffer (paused for renovation priority) |
| **Total** | **₹1,80,000** | = monthly income |

**Daily flex budget** = Food (15k) + Freedom (15k) = ₹30,000, split by days left in month.

### Debt picture
| Debt | Balance | Rate | EMI |
|---|---:|---:|---:|
| Credit Card 1 | ₹19,000 | 40% | — |
| Credit Card 2 | ₹19,000 | 40% | — |
| Axis Personal Loan | ₹4,00,000 | 18% | ₹11,000 |
| MF Pledge Loan | ₹2,50,000 | 11% | ₹2,000 |
| Education Loan | ₹4,00,000 | 8% | ₹7,000 |
| Friends (combined) | ₹73,000 | 0% | — |
| **Total** | **₹11.61L** | | **₹20,000** |

### Goal
- **Tile work (immediate):** ₹2,00,000
- **Full renovation:** ₹6,00,000

### Assets
- Mutual fund corpus: ₹5,00,000 (₹2,50,000 pledged for MF loan)
- No insurance currently

---

## Architecture

```
finance-os/
├── app/
│   ├── page.js                       # Single-page UI, 8 tabs
│   ├── layout.js                     # Root layout
│   └── api/
│       ├── state/route.js            # GET state + computed view; POST actions
│       ├── log-expense/route.js      # OpenCLAW/n8n auto-logging
│       ├── advisor/route.js          # Claude chat + structured analyze mode
│       ├── summary/route.js          # JSON or plain-text daily+weekly digest
│       ├── send-report/route.js      # Resend email (daily/weekly HTML)
│       └── health/route.js           # Env var status + live integration tests
├── lib/
│   ├── finance.js                    # Core engine — envelopes, bills, debts, recs
│   └── store.js                      # Vercel KV (prod) / in-memory (local)
├── vercel.json                       # Cron: daily 8:30am + weekly Mon 7:30am IST
├── .env.example                      # Template
└── package.json
```

### State shape
```js
{
  debts:          [{id, name, balance, rate, emi, color, type}],
  expenses:       [{id, ts, amount, category, merchant, source}],
  debtPayments:   [{id, ts, debtId, amount}],
  goalSavings:    { renovation: 0 },
  flags:          { envelopesSetup, salaryReceived, lastSalaryMonth },
  rulesStreak:    0,
  history:        [],     // closed months
}
```

### Computed view (returned by `/api/state`)
```js
{
  allowance:     { perDay, remaining, daysLeft, dayOfMonth, daysInMonth, pctMonthGone, pctBudgetGone },
  todaySpent, monthFlexSpent,
  verdicts:      [{ level, title, body }],
  action:        { tag, title, body, cta },
  proj:          { months, hist, finalBal },
  view:          { income, totalCommitted, totalSpent, totalRemaining, envelopes[] },
  bills:         [{ ...bill, paid, isPaid, isOverdue, isDueSoon, daysUntilDue }],
  recs:          [{ urgency, icon, title, body, amount }],
}
```

---

## UI tabs

| Tab | Purpose |
|---|---|
| **Today** | Hero allowance · Urgent · Whole-money overview · AI Analysis · Bills · Heads-up · Renovation · Today's log |
| **Reports** | 7-day bar chart, week category breakdown, top merchants, month progress |
| **Spending** | Manual expense entry, full month expense list, close month |
| **Debts** | Avalanche curve, debt rows, log payment |
| **System** | Envelope details, 6 personal laws, discipline streak |
| **Impulse** | Log → wait 10 min → skip/buy decision tracker |
| **Advisor** | Free-form Q&A with Claude + structured analyze button |
| **Config** | Integration status pills, live test buttons, copy-paste snippets, debt editor, salary flags |

---

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/state` | Full state + computed view |
| POST | `/api/state` | UI actions: `addExpense`, `deleteExpense`, `updateDebt`, `payDebt`, `setFlag`, `logStreak`, `closeMonth`, `logGoalSaving`, `payBill`, `undoBill`, `updateProfile`, `updateEnvelope`, `updateBill`, `addBill`, `removeBill`, `updateGoal`, `resetConfig` |
| POST | `/api/log-expense` | OpenCLAW/n8n expense webhook (LOG_SECRET auth) |
| POST | `/api/advisor` | `{ question }` → free-form ; `{ mode: "analyze" }` → 5-section structured analysis |
| GET | `/api/summary` | JSON daily+weekly · `?period=daily\|weekly` · `?format=text` |
| GET\|POST | `/api/send-report` | Email daily/weekly digest via Resend (`?type=daily\|weekly`) |
| GET | `/api/health` | Env var configuration status · storage type + record counts · `?test=anthropic\|resend` for live ping |
| GET | `/api/history` | Month-by-month aggregation · `?months=N` (default 6, max 36) · returns months, envelope trends, stats |

### Actions reference (POST /api/state body)
```json
{ "action": "addExpense",    "payload": { "amount": 450, "merchant": "Swiggy", "category": "food" } }
{ "action": "deleteExpense", "payload": { "id": "exp_..." } }
{ "action": "updateDebt",    "payload": { "id": "cc1", "balance": 5000 } }
{ "action": "payDebt",       "payload": { "id": "cc1", "amount": 5000 } }
{ "action": "payBill",       "payload": { "amount": 28000, "category": "rent", "label": "Rent" } }
{ "action": "undoBill",      "payload": { "category": "rent" } }
{ "action": "logGoalSaving", "payload": { "goal": "renovation", "amount": 10000 } }
{ "action": "setFlag",       "payload": { "key": "salaryReceived", "value": true } }
{ "action": "logStreak",     "payload": {} }
{ "action": "closeMonth",    "payload": {} }

# Config editors (edit profile, envelopes, bills, goals from UI)
{ "action": "updateProfile",   "payload": { "key": "income",  "value": 200000 } }
{ "action": "updateEnvelope",  "payload": { "id": "food",    "patch": { "amount": 18000 } } }
{ "action": "updateBill",      "payload": { "id": "rent",    "patch": { "amount": 30000, "dueDay": 5 } } }
{ "action": "addBill",         "payload": { "label": "Gym",  "amount": 2000, "dueDay": 3, "category": "bills", "icon": "💪" } }
{ "action": "removeBill",      "payload": { "id": "bill_..." } }
{ "action": "updateGoal",      "payload": { "id": "renovationImmediate", "needed": 250000 } }
{ "action": "resetConfig",     "payload": {} }
```

### Editable config (in state.config)

All UI-editable financial settings live in `state.config` and override the defaults in [lib/finance.js](lib/finance.js). The Config tab provides inline editors for:

- **Profile** — name, monthly income, salary day
- **Envelopes** — amounts per envelope (Survival, Food, Freedom, SIP, Debt, Emergency)
- **Fixed bills** — label, amount, due day per bill; add new bills; remove existing
- **Goals** — renovation immediate target, full renovation target

When a value is unset in `state.config`, the helpers (`getProfile`, `getEnvelopes`, `getBills`, `getGoals`, `getDailyFlexBudget`) fall back to the defaults. `defaultConfig()` returns a snapshot for initial state or reset.

---

## Env vars

| Var | Required | Used by | What for |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | optional | `/api/advisor`, `/api/health?test=anthropic` | AI advisor + analysis. Without it, advisor returns setup hint. |
| `LOG_SECRET` | optional | `/api/log-expense`, `/api/summary`, `/api/send-report` | Shared secret for external automation. If unset, endpoints are open. |
| `RESEND_API_KEY` | optional | `/api/send-report`, `/api/health?test=resend` | Email delivery. Without it, send-report returns error. |
| `REPORT_EMAIL` | optional | `/api/send-report` | Recipient address for daily/weekly digest. |
| `KV_REST_API_URL` | optional | `lib/store.js` | Vercel KV (auto-set by Vercel when KV is connected). |
| `KV_REST_API_TOKEN` | optional | `lib/store.js` | Vercel KV. Without these, store is in-memory (resets on redeploy). |

See [.env.example](.env.example) for the template. Locally: copy to `.env.local`. On Vercel: set in Settings → Environment Variables.

---

## Auto-categorization

Bank-email merchants are matched against keyword lists in [lib/finance.js → CATEGORIES](lib/finance.js):

| Category | Envelope | Keywords (sample) |
|---|---|---|
| food | food | swiggy, zomato, blinkit, zepto, grocery, dominos, bigbasket |
| freedom (lifestyle) | freedom | amazon, flipkart, myntra, bookmyshow, pvr, bar, smoke, nykaa |
| rent | survival | rent, landlord |
| maintenance | survival | maintenance, society, electricity, water, gas |
| subscriptions | survival | netflix, prime, hotstar, spotify, youtube |
| family | survival | family, recharge, jio, airtel, vi, vodafone |
| furniture | survival | furlenco, rentomojo, cityfurnish |
| commute | survival | uber, ola, rapido, metro, petrol, fastag, irctc |
| sip | sip | sip, mutual fund |
| renovation | freedom | tile, paint, carpenter, plumber, cement |

Edit keywords to taste — they're substring-matched against merchant text.

---

## OpenCLAW / n8n setup

Point your email-reading workflow at `/api/log-expense`:

```http
POST /api/log-expense
Content-Type: application/json

{
  "amount": 450,
  "merchant": "Swiggy",
  "category": "",            // optional, auto-detected from merchant
  "source": "email",
  "secret": "YOUR_LOG_SECRET" // if LOG_SECRET env var is set
}
```

**Response:**
```json
{
  "ok": true,
  "logged": { "id": "exp_...", "category": "food", ... },
  "isFlexSpend": true,
  "todayRemaining": 487,
  "monthRemaining": 6200,
  "message": "Logged 🍱 ₹450 (food). You have about ₹487 left to spend today."
}
```

You can forward the `message` back to your phone via SMS/Telegram/WhatsApp from your n8n workflow.

**Config tab in the UI** gives you the exact URL, JSON template, regex patterns for parsing bank emails, and a "Send test expense (₹1)" button.

---

## AI Analysis

`POST /api/advisor` with `{ "mode": "analyze" }` returns a 5-section structured read using live state:

- 📊 Spending Health (verdict: Healthy/Watch/Bleeding)
- 💪 Capacity Check (can you spend extra today? with math)
- 🚨 Top Leak (biggest issue right now)
- 💎 Top Opportunity (smartest move this week)
- 📅 Next 7 Days (3 numbered actions)

The system prompt includes:
- Real envelope amounts + live spent/overspent per envelope
- Full bills status (paid/overdue/due-soon)
- Debt breakdown with rates
- Renovation fund progress vs ₹2L target
- Whole-money view (spent / remaining / committed)

Triggered from **Today tab → 🧠 AI Analysis** card or **Advisor tab → Run full analysis** button.

---

## Email reports

- **Daily** at 8:30 AM IST → snapshot card with allowance left, coach verdict, today's log, 7-day bar chart, week category breakdown, debt status
- **Weekly** Mondays at 7:30 AM IST → same template with weekly framing

Configured in [vercel.json](vercel.json):
```json
{
  "crons": [
    { "path": "/api/send-report?type=daily",  "schedule": "0 3 * * *" },
    { "path": "/api/send-report?type=weekly", "schedule": "0 2 * * 1" }
  ]
}
```
(UTC times → IST converted: 3:00 UTC = 8:30 AM IST, 2:00 UTC Mon = 7:30 AM IST.)

Manual trigger: `GET /api/send-report?type=daily` (with `?secret=` if LOG_SECRET set, or `&email=override@example.com`).

---

## Recommendation engine (deterministic, no LLM)

In [lib/finance.js → recommendations()](lib/finance.js). Generates ranked items:

1. **Overdue bills** → `danger`
2. **Due-soon bills** (within 3 days) → `warning`
3. **Credit card balance > 0** → `danger` (40% interest urgency)
4. **Envelope overruns** (flex only) → `warning`
5. **Renovation goal gap** → `info` (with months-to-go math)
6. **Underused flex** when month >50% gone but burn <40% → `good` (suggest sweeping to debt)

Each rec has `{ urgency, icon, title, body, amount }`.

---

## Deploy

```bash
git init && git add . && git commit -m "init"
git remote add origin <your-private-repo>
git push -u origin main
```

Then:
1. Vercel → Add New Project → import repo → Deploy (auto-detects Next.js)
2. Storage tab → Create KV (Upstash) free tier → connect → adds `KV_REST_API_URL` + `KV_REST_API_TOKEN`
3. Settings → Environment Variables → add `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `REPORT_EMAIL`, `LOG_SECRET`
4. Redeploy
5. Open `/config` tab → click each "Test connection" button → all green

---

## Customizing

| To change | Edit |
|---|---|
| Income / envelope amounts | [lib/finance.js](lib/finance.js) → `PROFILE`, `ENVELOPES` |
| Debts list | [lib/finance.js](lib/finance.js) → `INIT_DEBTS` |
| Fixed bills (rent, OTT, etc.) | [lib/finance.js](lib/finance.js) → `FIXED_BILLS` |
| Goals (renovation amounts) | [lib/finance.js](lib/finance.js) → `GOALS` |
| Category keywords | [lib/finance.js](lib/finance.js) → `CATEGORIES` |
| Coach strictness | [lib/finance.js](lib/finance.js) → `coachVerdict()` thresholds |
| Recommendation rules | [lib/finance.js](lib/finance.js) → `recommendations()` |
| Advisor system prompt | [app/api/advisor/route.js](app/api/advisor/route.js) → `buildSystemPrompt()` |
| Email template | [app/api/send-report/route.js](app/api/send-report/route.js) → `buildHtml()` |
| Cron schedule | [vercel.json](vercel.json) |

---

## Notes for future agents

- **All financial truth lives in [lib/finance.js](lib/finance.js).** Numbers in advisor system prompts, email templates, etc. are computed live — don't hardcode amounts elsewhere.
- **State persistence:** Vercel KV in prod, in-memory locally. Resets if KV not configured. Test KV connectivity with `health` endpoint.
- **`DAILY_FLEX_BUDGET` is derived** from `ENVELOPES` (Food + Freedom sum) — don't hardcode it.
- **Bills are just expenses** with specific categories. `billsStatus()` queries the expense log to determine paid status (90%+ threshold). `payBill` and `undoBill` are conveniences over `addExpense` and `deleteExpense`.
- **No model knowledge in deterministic logic** — `recommendations()` is rule-based and fast. Only `/api/advisor` calls Claude.
- **Single-user app** — no auth on the UI, only the `LOG_SECRET` on the webhook. Don't expose the URL publicly without setting `LOG_SECRET`.
- **Don't bake API keys into source.** Use `.env.local` for dev, Vercel env vars for prod. The Config tab UI never stores keys — it only reports status via `/api/health`.
