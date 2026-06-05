// ════════════════════════════════════════════════════════════════
//  Feature module contract.
//  Every feature exports a default manifest of this shape.
//  The catch-all API router and Config tab read these manifests.
// ════════════════════════════════════════════════════════════════

import type { ComponentType } from "react";
import type { z } from "zod";

export type FeatureCategory =
  | "money"        // expenses, bills, envelopes, ious, goals
  | "debts"        // debts module
  | "analysis"     // advisor, history, recommendations
  | "automation"   // sms webhook, n8n contract
  | "system";      // storage, integrations health, data export

/** A single user-editable setting rendered automatically in the Config tab. */
export type SettingDef =
  | {
      key: string;
      label: string;
      description: string;
      type: "boolean";
      default: boolean;
    }
  | {
      key: string;
      label: string;
      description: string;
      type: "number";
      default: number;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      key: string;
      label: string;
      description: string;
      type: "string";
      default: string;
      placeholder?: string;
    }
  | {
      key: string;
      label: string;
      description: string;
      type: "select";
      default: string;
      options: ReadonlyArray<{ value: string; label: string }>;
    };

/** A typed action handler. Mounted at /api/<featureId>/<path>. */
export type ActionHandler<Input = unknown, Output = unknown> = (
  input: Input,
  ctx: ActionContext
) => Promise<Output>;

export interface ActionContext {
  /** Request URL (for query params, headers etc) */
  request: Request;
  /** Resolved feature settings (from DB, with defaults applied) */
  settings: Record<string, unknown>;
  /** Whether the caller is same-origin browser (for read endpoints) */
  sameOrigin: boolean;
}

/** Map of "METHOD /path" → handler. Method defaults to POST if omitted. */
export type RouteMap = Record<string, ActionHandler<any, any>>;

/** UI slot — features opt into the Today tab and/or Config tab. */
export interface UiSlot {
  component: ComponentType<any>;
  order: number;
  /** Optional predicate: hide this card when it has nothing to show. */
  visibleWhen?: (state: unknown) => boolean;
}

export interface FeatureManifest {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  icon: string;
  version: number;

  /** Drizzle table objects (any[] — they're opaque to the registry). */
  schemas?: ReadonlyArray<unknown>;

  /** API route map. Defaults to empty. */
  routes?: RouteMap;

  /** UI contributions to host tabs. */
  ui?: {
    todayCard?: UiSlot;
    configSection?: UiSlot;
    tab?: { id: string; label: string; component: ComponentType<any>; order: number };
  };

  /** User-editable settings shown in Config → this feature. */
  settings?: ReadonlyArray<SettingDef>;

  /** Other feature ids this one depends on. */
  dependencies?: ReadonlyArray<string>;

  /** Health probe for Config → System Health. Returns ok=false to surface issues. */
  health?: () => Promise<{ ok: boolean; info?: string }>;

  /** Whether the feature can be toggled off by the user. Core features can't. */
  optional?: boolean;

  /** Optional Zod schema declaring the shape of this feature's settings,
   *  used at runtime to validate persisted values. */
  settingsSchema?: z.ZodTypeAny;
}

/** Type-safe constructor. Use this so all manifests share the same shape. */
export function defineFeature<T extends FeatureManifest>(manifest: T): T {
  // Runtime sanity: catch typos at module load
  if (!manifest.id || !/^[a-z][a-z0-9_-]*$/.test(manifest.id)) {
    throw new Error(`Feature id "${manifest.id}" must be lower-kebab/snake`);
  }
  if (!manifest.name || !manifest.description) {
    throw new Error(`Feature "${manifest.id}" requires name and description`);
  }
  return manifest;
}

// ─── Domain types shared across features ──────────────────────────
// (Each feature can extend these; kept minimal here to avoid coupling.)

export type EnvelopeType =
  | "survival"
  | "food"
  | "freedom"
  | "sip"
  | "debt"
  | "emergency";

export type DebtType = "cc" | "formal" | "friend";

export type UrgencyLevel = "danger" | "warning" | "info" | "good";
