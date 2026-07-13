// ════════════════════════════════════════════════════════════════
//  tests/helpers/db.ts
//  Creates an in-memory libSQL + Drizzle DB for tests.
//  Each call returns a fresh isolated instance.
// ════════════════════════════════════════════════════════════════
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@/features/core/db/allSchemas";

export function createTestDb() {
    const client = createClient({ url: "file::memory:" });
    const db = drizzle(client, { schema });
    return { db, client };
}

// DDL to create all tables used in tests (mirrors the Drizzle schemas)
export const TEST_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER,
  image TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user'
);
CREATE TABLE IF NOT EXISTS ai_settings (
  user_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'anthropic',
  encrypted_key TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  updated_ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  PRIMARY KEY (provider, provider_account_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  session_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires INTEGER NOT NULL,
  PRIMARY KEY (identifier, token)
);
CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'User',
  income REAL NOT NULL DEFAULT 180000,
  salary_day INTEGER NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'INR'
);
CREATE TABLE IF NOT EXISTS flags (
  id TEXT PRIMARY KEY,
  salary_received INTEGER NOT NULL DEFAULT 0,
  envelopes_setup INTEGER NOT NULL DEFAULT 0,
  last_salary_month TEXT,
  setup_complete INTEGER NOT NULL DEFAULT 0,
  webhook_secret TEXT,
  banked_week REAL NOT NULL DEFAULT 0,
  banked_week_key TEXT,
  banked_total REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS month_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  total_spent REAL NOT NULL DEFAULT 0,
  flex_spent REAL NOT NULL DEFAULT 0,
  total_paid REAL NOT NULL DEFAULT 0,
  net_debt REAL NOT NULL DEFAULT 0,
  saved_goals REAL NOT NULL DEFAULT 0,
  snapshot_ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  ts INTEGER NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  merchant TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  account_suffix TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  client_request_id TEXT UNIQUE,
  note TEXT,
  envelope_id TEXT,
  project_id TEXT
);
CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0,
  emi REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#9F77DD',
  type TEXT NOT NULL DEFAULT 'friend',
  "order" INTEGER NOT NULL DEFAULT 0,
  principal REAL NOT NULL DEFAULT 0,
  due_day INTEGER,
  tenure_months INTEGER,
  opened_ts INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  last_paid_ts INTEGER,
  credit_limit REAL,
  min_due REAL,
  statement_balance REAL
);
CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  debt_id TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT,
  expense_id TEXT
);
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  due_day INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  icon TEXT NOT NULL DEFAULT '🧾',
  active INTEGER NOT NULL DEFAULT 1,
  "order" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bill_payments (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  bill_id TEXT NOT NULL,
  amount REAL NOT NULL,
  month TEXT NOT NULL,
  partial INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE TABLE IF NOT EXISTS envelopes (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  icon TEXT NOT NULL DEFAULT '💰',
  locked INTEGER NOT NULL DEFAULT 0,
  desc TEXT NOT NULL DEFAULT '',
  "order" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  label TEXT NOT NULL,
  needed REAL NOT NULL,
  saved REAL NOT NULL DEFAULT 0,
  icon TEXT NOT NULL DEFAULT '🎯',
  target_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  "order" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS goal_contributions (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  goal_id TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS ious (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  ts INTEGER NOT NULL,
  note TEXT,
  settled_ts INTEGER,
  settled_amt REAL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  priority TEXT NOT NULL DEFAULT 'planned',
  budget REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  icon TEXT NOT NULL DEFAULT '📦',
  created_ts INTEGER NOT NULL,
  target_ts INTEGER
);
`;

export async function setupTestDb() {
    const { db, client } = createTestDb();
    // Execute each CREATE TABLE statement
    const stmts = TEST_DDL
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => ({ sql: s, args: [] }));
    await client.batch(stmts);
    return { db, client };
}
