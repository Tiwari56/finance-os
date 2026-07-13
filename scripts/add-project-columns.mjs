// Idempotent migration: adds projects table and project_id to expenses.
// Run once after pulling this branch: node scripts/add-project-columns.mjs
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../data/finance.db");

const db = new Database(DB_PATH);

const run = (sql) => { try { db.exec(sql); console.log("OK:", sql.slice(0, 60).trim()); } catch (e) { if (e.message.includes("already exists") || e.message.includes("duplicate column")) { console.log("SKIP (already exists)"); } else { throw e; } } };

run(`CREATE TABLE IF NOT EXISTS projects (
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
)`);

run(`ALTER TABLE expenses ADD COLUMN project_id TEXT`);

db.close();
console.log("Done.");
