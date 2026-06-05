// ════════════════════════════════════════════════════════════════
//  /api/log-expense — backward-compat shim
//
//  The n8n SMS workflow and OpenCLAW automation post here. Internally
//  this is now the same handler as /api/expenses/log so all data
//  lands in the unified SQLite store.
// ════════════════════════════════════════════════════════════════

import { logExpense } from "../../../features/expenses/api/log";

export const dynamic = "force-dynamic";

export async function POST(req) {
  return logExpense(req);
}

// Keep the GET probe — returns the contract reference.
export async function GET() {
  return Response.json({
    ok: true,
    contract: "finance-os/log-expense v2 (DB-backed)",
    forwardsTo: "/api/expenses/log",
    expectedBody: {
      amount:          "number, required, >0",
      merchant:        "string, optional",
      source:          "string, optional (info-only)",
      secret:          "string, required if LOG_SECRET set",
      category:        "string, optional — auto-detected from merchant if absent",
      clientRequestId: "string, optional — idempotency key",
      ts:              "number, optional — ms epoch txn time, default now",
      currency:        "string, optional — default INR",
      accountSuffix:   "string, optional",
      note:            "string, optional",
    },
  });
}
