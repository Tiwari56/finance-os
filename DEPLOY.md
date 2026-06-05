# Deploy Finance OS

Step-by-step to ship the app live on Vercel + Turso. Total time ≈ 20 minutes. Cost: $0/mo on the free tiers.

---

## Architecture overview

```
   ┌──────────┐        ┌──────────────────┐        ┌─────────────────┐
   │  Phone   │──SMS──▶│  n8n (your VPS / │──HTTP─▶│ Vercel          │
   │ iPhone/  │        │  home server /   │        │  Finance OS     │
   │ Android  │        │  Railway)        │        │  Next.js + APIs │
   └──────────┘        └──────────────────┘        └────────┬────────┘
                                                            │
                                            ┌───────────────┴────────────────┐
                                            │                                │
                                       ┌────▼─────┐                  ┌───────▼──────┐
                                       │  Turso   │                  │  Resend      │
                                       │  libSQL  │                  │  daily email │
                                       │  (data)  │                  │              │
                                       └──────────┘                  └──────────────┘
```

**What lives where:**

| Component | Host | Free tier |
|---|---|---|
| Frontend + APIs (Next.js) | **Vercel Hobby** | 100 GB bandwidth, 1M function invocations/mo, 2 cron jobs |
| Database (libSQL/SQLite) | **Turso Starter** | 9 GB, 1B reads/mo, 25M writes/mo, 500 databases |
| AI advisor | **Anthropic API** | Pay-per-use (≈ $0.10/mo for daily analysis) |
| Email reports | **Resend** | 3000 emails/mo, 100/day |
| SMS automation | **n8n** | See below — n8n cannot run on Vercel |

---

## Step 1 — Create the Turso database (5 min)

Sign up at [turso.tech](https://turso.tech). Then in their CLI or web dashboard:

```bash
# Install CLI (one-time)
curl -sSfL https://get.tur.so/install.sh | bash

# Auth
turso auth signup
# or: turso auth login

# Create the DB (pick a region close to you — bom = Mumbai, sin = Singapore)
turso db create finance-os --location bom

# Get the URL and a long-lived auth token
turso db show finance-os --url
turso db tokens create finance-os --expiration none
```

Save both values — you'll paste them into Vercel in Step 4.

---

## Step 2 — Push the schema to Turso (1 min)

From your project directory:

```bash
# Tell Drizzle to point at Turso instead of local file
export TURSO_DATABASE_URL="libsql://finance-os-<your-username>.turso.io"
export TURSO_AUTH_TOKEN="eyJhbGciOi..."

# Create all tables in Turso based on your features/*/schema.ts files
npm run db:push
```

You should see something like `[✓] Changes applied`.

Verify in the Turso dashboard (your DB → **Data** tab) that the tables `expenses`, `debts`, `bills`, `envelopes`, `profile`, etc. all exist (empty).

---

## Step 3 — Copy your local data into Turso (1 min)

If you already have data in `data/finance.db` locally (you almost certainly do — it's where your SMS-logged expenses live), push it up:

```bash
# Same env vars from Step 2 still in your shell
npm run sync-to-turso
```

Expected output:
```
→ Syncing local SQLite → Turso
  local:  file:.../data/finance.db
  remote: finance-os-yourname.turso.io
  ✓ profile: 1 rows
  ✓ flags: 1 rows
  ✓ envelopes: 6 rows
  ✓ bills: 6 rows
  ✓ debts: 16 rows
  ✓ expenses: 22 rows
  ✓ debt_payments: 10 rows
  ✓ ious: 3 rows
✓ Done. Synced 64 rows to finance-os-yourname.turso.io.
```

Open the Turso dashboard to confirm rows are there. If anything looks wrong, fix locally and re-run — the script uses `INSERT OR REPLACE`, so it's safe to repeat.

---

## Step 4 — Deploy to Vercel (5 min)

### 4a. Push code to GitHub

```bash
cd /Users/nishit.tiwari/Documents/Personal/finance-os
git init                                  # if not already a git repo
git add -A
git commit -m "Finance OS v2 ready to deploy"

# Create a private repo on GitHub (https://github.com/new), then:
git remote add origin git@github.com:YOURUSERNAME/finance-os.git
git branch -M main
git push -u origin main
```

### 4b. Import on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. **Import** your `finance-os` repo
3. Framework: Next.js (auto-detected). Click **Deploy** — first build will fail because env vars aren't set yet, that's expected.

### 4c. Add env vars

Project → **Settings → Environment Variables**. Add all of these for **Production, Preview, Development**:

| Variable | Value | Purpose |
|---|---|---|
| `TURSO_DATABASE_URL` | `libsql://...turso.io` (from Step 1) | DB connection |
| `TURSO_AUTH_TOKEN` | `eyJhbGciOi...` (from Step 1) | DB auth |
| `LOG_SECRET` | `db3b8ae7...` (same as `.env.local`) | n8n SMS webhook auth + manual cron trigger |
| `CRON_SECRET` | new long random string (`openssl rand -hex 24`) | Authenticates Vercel-scheduled cron calls |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | AI advisor |
| `RESEND_API_KEY` | `re_...` (from resend.com) | Daily/weekly email |
| `REPORT_EMAIL` | `you@example.com` | Where the daily email goes |

> ⚠️ **Rotate your secrets**. The `ANTHROPIC_API_KEY` and `LOG_SECRET` you see in your local `.env.local` may have been pasted in chat earlier. Treat them as compromised — go to `console.anthropic.com/settings/keys` and revoke, then issue new ones.

### 4d. Redeploy

Project → **Deployments** → **(latest) → Redeploy** → check "Use existing Build Cache" → **Redeploy**.

Watch the build log. Once it shows `● Ready`, the app is live at `https://your-project.vercel.app`.

### 4e. Verify

Open `https://your-project.vercel.app` — you should see your dashboard with all the data you synced. Click through Today / Debts / History / AI / Config; everything should match local.

Smoke-test the SMS endpoint:

```bash
curl -X POST https://your-project.vercel.app/api/log-expense \
  -H 'Content-Type: application/json' \
  -d '{"amount":1,"merchant":"DEPLOY-TEST","secret":"<LOG_SECRET>"}'
# expect: {"ok":true,"logged":{...},"message":"Logged ..."}
```

Smoke-test the cron (forces a daily email):

```bash
curl "https://your-project.vercel.app/api/send-report?type=daily&secret=<LOG_SECRET>"
# expect: {"ok":true, "sent":true, ...}  → email arrives
```

---

## Step 5 — Repoint n8n at the production URL (2 min)

In your n8n workflow (the SMS one):

1. Open the **HTTP Request** node that posts to Finance OS
2. Change the URL from `http://host.docker.internal:3000/api/log-expense` to `https://your-project.vercel.app/api/log-expense`
3. Save + activate

Send yourself a test SMS from your bank → it should land in the Turso DB within seconds, and you'll see it on the dashboard within the 60-second React Query refetch.

---

## Step 6 — Confirm crons are scheduled (1 min)

Vercel project → **Settings → Cron Jobs**. You should see:

| Path | Schedule | Last run |
|---|---|---|
| `/api/send-report?type=daily` | `0 3 * * *` (3 AM UTC = 8:30 AM IST) | – |
| `/api/send-report?type=weekly` | `0 2 * * 1` (Mon 7:30 AM IST) | – |

The next-run column updates after Vercel picks them up (~5 min). On the first scheduled trigger you should get an email; if not, check **Logs** for that function.

---

# Can n8n run on Vercel? — **No.**

n8n is a long-running stateful workflow engine. It needs:

- A **persistent process** that runs indefinitely (Vercel functions are serverless and shut down after each request — max 60s execution on Hobby)
- A **writable database** that survives between requests (Vercel filesystem is read-only outside `/tmp`, and there is no shared state across function invocations)
- **Websockets** and the UI editor running 24/7 (Vercel has no websocket persistence)
- **Background workers and cron triggers** managed by n8n itself, not by the host

Vercel is a great fit for stateless web apps (like Finance OS) but a poor fit for n8n.

### Where to run n8n instead

| Option | Cost | Best for |
|---|---|---|
| **Self-host (Docker on your Mac / home server)** | Free | What you're already doing — keep it. Use cloudflared / ngrok to give n8n a public URL when you're outside your LAN. |
| **[Railway](https://railway.app)** | ~$5/mo | Easiest cloud option. Click "Deploy n8n template" → done. Includes free Postgres. |
| **[Render](https://render.com)** | $7/mo + free Postgres | Similar to Railway, slightly more configuration. |
| **[Fly.io](https://fly.io)** | Free tier supports it | Lower-level than Railway; great if you want full control. |
| **[Hetzner CX11 VPS](https://hetzner.com)** | €4/mo | If you want a personal server for n8n + other things. |
| **[n8n.cloud](https://n8n.cloud)** | $20/mo Starter | Official hosted n8n. Most expensive but zero ops. |

### Recommendation for your setup

Since SMS already works on your Mac via the iPhone forwarder → n8n on Docker → Finance OS, and you already pointed it at the Vercel deployment:

**Short term:** keep n8n on Docker on your Mac. It only runs when you're working anyway, and the SMS forwarder app keeps SMS queued until n8n is reachable.

**If you want it 24/7** (e.g. SMS at 3 AM gets logged immediately): deploy n8n to **Railway** for $5/mo. The Railway template is ready to import — set your `WEBHOOK_URL` to the Railway public URL and update the iPhone SMS forwarder to point there.

That's it. With Vercel + Turso + n8n-anywhere you have a fully serverless personal finance OS for under $5/mo (or $0 if you keep n8n local).

---

## Maintenance & troubleshooting

| Problem | Fix |
|---|---|
| Vercel build fails on `lib/store.js` | Make sure `better-sqlite3` is NOT in `package.json` (we removed it — it's incompatible with serverless). The bridge uses `@libsql/client` only. |
| `/api/v2/state` returns `ok:false` | The deployed instance can't reach Turso. Re-check `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` env vars in Vercel. |
| N8N webhook returns 401 | `LOG_SECRET` on Vercel doesn't match what n8n is sending. Re-copy from `.env.local`, save in Vercel, redeploy. |
| Daily email isn't arriving | Vercel → Logs → filter by `send-report`. Common: Resend free tier requires the `from:` address to be on a verified domain. Use Resend's `onboarding@resend.dev` for tests, then add your domain later. |
| AI advisor errors | Check `ANTHROPIC_API_KEY` is set and not expired. Vercel → Logs → search "advisor". |
| Want to roll back data | Turso has automatic point-in-time recovery on paid tiers; on Starter, dump regularly with `turso db shell finance-os ".dump" > backup.sql` |

---

## Useful URLs after deploy

| What | Where |
|---|---|
| Dashboard | `https://your-project.vercel.app` |
| Webhook for n8n | `https://your-project.vercel.app/api/log-expense` |
| Manual daily email | `https://your-project.vercel.app/api/send-report?type=daily&secret=<LOG_SECRET>` |
| Health probe | `https://your-project.vercel.app/api/health` |
| Vercel logs | `https://vercel.com/<your-org>/<project>/logs` |
| Turso data viewer | `https://app.turso.tech/<your-org>/<db>/data` |
