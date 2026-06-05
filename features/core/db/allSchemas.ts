// ════════════════════════════════════════════════════════════════
//  Central schema barrel — imports every feature's tables.
//  drizzle-kit uses this file for migrations.
//  features/core/db/client.ts imports this for the typed ORM.
// ════════════════════════════════════════════════════════════════

export * from "./schema";                          // core: profile, flags, monthHistory
export * from "../../expenses/schema";
export * from "../../debts/schema";
export * from "../../bills/schema";
export * from "../../ious/schema";
export * from "../../envelopes/schema";
export * from "../../goals/schema";
