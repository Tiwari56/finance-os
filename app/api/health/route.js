// ════════════════════════════════════════════════════════════════
//  GET /api/health
//  Returns which env vars are configured WITHOUT exposing values.
//  Used by the Configuration tab to show "connected" badges.
//
//  GET /api/health?test=anthropic  → live-test the Claude API
//  GET /api/health?test=resend     → live-test Resend
// ════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getState, getStorageInfo } from "../../../lib/store";

export const dynamic = "force-dynamic";

// Show first 4 + last 4 chars of a key, nothing else
function masked(v) {
  if (!v) return null;
  if (v.length <= 12) return "•••••";
  return v.slice(0, 6) + "…" + v.slice(-4);
}

async function testAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [{ role: "user", content: "Reply with just: ok" }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `API ${res.status}: ${t.slice(0, 150)}` };
    }
    return { ok: true, message: "Claude API reachable" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function testResend() {
  const key = process.env.RESEND_API_KEY;
  const to  = process.env.REPORT_EMAIL;
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  if (!to)  return { ok: false, error: "REPORT_EMAIL not set" };
  try {
    // Domain list endpoint is cheap and verifies the key
    const res = await fetch("https://api.resend.com/domains", {
      headers: { "Authorization": `Bearer ${key}` },
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${t.slice(0, 150)}` };
    }
    const data = await res.json();
    return { ok: true, message: `Resend key valid · ${data.data?.length || 0} domain(s) configured · sends to ${to}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function GET(req) {
  const url = new URL(req.url);
  const test = url.searchParams.get("test");

  if (test === "anthropic") return NextResponse.json(await testAnthropic());
  if (test === "resend")    return NextResponse.json(await testResend());

  // Storage status: actual backend selected (kv / file / memory) + record counts
  const info = await getStorageInfo();
  const kvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  let storage = {
    type:        info.backend === "kv" ? "vercel-kv" : info.backend === "file" ? "local-file" : "in-memory",
    backend:     info.backend,
    persistent:  info.persistent,
    configured:  info.persistent,
    urlHint:     masked(process.env.KV_REST_API_URL),
    tokenHint:   masked(process.env.KV_REST_API_TOKEN),
    ...(info.path     && { filePath:  info.path }),
    ...(info.sizeBytes && { fileSize: info.sizeBytes }),
    ...(info.modified && { fileModified: info.modified }),
  };
  try {
    const s = await getState();
    storage.records = {
      expenses:     s.expenses?.length || 0,
      debtPayments: s.debtPayments?.length || 0,
      closedMonths: s.history?.length || 0,
    };
    if (s.expenses?.length > 0) {
      const tses = s.expenses.map(e => e.ts).sort((a, b) => a - b);
      storage.earliestExpense = new Date(tses[0]).toISOString();
      storage.latestExpense   = new Date(tses[tses.length - 1]).toISOString();
    }
  } catch (err) {
    storage.error = err.message;
  }

  // Default: status snapshot
  return NextResponse.json({
    anthropic: {
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      hint:       masked(process.env.ANTHROPIC_API_KEY),
    },
    resend: {
      configured:    Boolean(process.env.RESEND_API_KEY),
      hint:          masked(process.env.RESEND_API_KEY),
      reportEmail:   process.env.REPORT_EMAIL || null,
    },
    openclaw: {
      secretConfigured: Boolean(process.env.LOG_SECRET),
      secretHint:       masked(process.env.LOG_SECRET),
    },
    storage,
    runtime: {
      nodeEnv: process.env.NODE_ENV || "development",
      vercel:  Boolean(process.env.VERCEL),
    },
  });
}
