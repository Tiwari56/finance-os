// ════════════════════════════════════════════════════════════════
//  Feature registry — single source of truth.
//
//  Add a new feature by:
//    1. Drop a folder under features/<your-id>/
//    2. Export a default manifest from features/<your-id>/manifest.ts
//    3. Import it here and add to the FEATURES tuple
//
//  The catch-all API router and Config tab read from this list.
// ════════════════════════════════════════════════════════════════

import type { FeatureManifest } from "./core/types";

import expenses from "./expenses/manifest";
import debts from "./debts/manifest";
import bills from "./bills/manifest";
import ious from "./ious/manifest";
import envelopes from "./envelopes/manifest";
import goals from "./goals/manifest";
import allowance from "./allowance/manifest";
import recommendations from "./recommendations/manifest";
import advisor from "./advisor/manifest";
import reports from "./reports/manifest";
import history from "./history/manifest";
import automation from "./automation/manifest";
import config from "./config/manifest";

export const FEATURES: ReadonlyArray<FeatureManifest> = [
  expenses, debts, bills, ious, envelopes, goals,
  allowance, recommendations, advisor, reports, history, automation, config,
];

export type FeatureId = (typeof FEATURES)[number]["id"];

// ─── Topological sort by dependencies ─────────────────────────────
// Ensures `bills` (deps on expenses) loads after `expenses`.
function topoSort(features: ReadonlyArray<FeatureManifest>): FeatureManifest[] {
  const byId = new Map(features.map(f => [f.id, f]));
  const visited = new Set<string>();
  const sorted: FeatureManifest[] = [];

  function visit(f: FeatureManifest, stack: string[]) {
    if (visited.has(f.id)) return;
    if (stack.includes(f.id)) {
      throw new Error(`Feature dependency cycle: ${[...stack, f.id].join(" → ")}`);
    }
    for (const dep of f.dependencies ?? []) {
      const depFeature = byId.get(dep);
      if (!depFeature) {
        throw new Error(`Feature "${f.id}" depends on missing feature "${dep}"`);
      }
      visit(depFeature, [...stack, f.id]);
    }
    visited.add(f.id);
    sorted.push(f);
  }

  for (const f of features) visit(f, []);
  return sorted;
}

export const FEATURES_ORDERED = topoSort(FEATURES);

export function getFeature(id: string): FeatureManifest | undefined {
  return FEATURES.find(f => f.id === id);
}

export function getFeaturesByCategory() {
  const map: Record<string, FeatureManifest[]> = {};
  for (const f of FEATURES_ORDERED) {
    (map[f.category] ??= []).push(f);
  }
  return map;
}
