// ════════════════════════════════════════════════════════════════
//  envelopes/lib/keys.ts
//
//  Envelope ids are globally unique. The original single-user data
//  used semantic ids ("food", "freedom", …). Multi-user rows are
//  namespaced as "<userId>:<key>" so they can't collide. This helper
//  recovers the semantic key either way.
// ════════════════════════════════════════════════════════════════

export type EnvelopeKey = "survival" | "food" | "freedom" | "sip" | "debt" | "emergency";

export function envelopeKeyOf(id: string): string {
    const i = id.lastIndexOf(":");
    return i >= 0 ? id.slice(i + 1) : id;
}

export function envelopeIdFor(userId: string, key: EnvelopeKey): string {
    return `${userId}:${key}`;
}

/** Flex envelopes drive the daily allowance. */
export const FLEX_ENVELOPE_KEYS: ReadonlySet<string> = new Set(["food", "freedom"]);

export function isFlexEnvelope(id: string): boolean {
    return FLEX_ENVELOPE_KEYS.has(envelopeKeyOf(id));
}

/** Seed template for new users (generic starting split — editable in Config). */
export const DEFAULT_ENVELOPE_TEMPLATE: ReadonlyArray<{
    key: EnvelopeKey; label: string; amount: number; icon: string; locked: boolean; desc: string; order: number;
}> = [
    { key: "survival",  label: "Essentials",     amount: 50_000, icon: "🏠", locked: true,  desc: "Rent, utilities, family, commute — the non-negotiables.", order: 0 },
    { key: "food",      label: "Food",           amount: 10_000, icon: "🍱", locked: false, desc: "Groceries and eating out.",                                order: 1 },
    { key: "freedom",   label: "Lifestyle",      amount: 10_000, icon: "🎯", locked: false, desc: "Personal spending and fun. When it's zero, it's zero.",   order: 2 },
    { key: "sip",       label: "Investing",      amount: 10_000, icon: "📈", locked: true,  desc: "Auto-debit investments. Never pause.",                     order: 3 },
    { key: "debt",      label: "Debt payoff",    amount: 15_000, icon: "⚡", locked: true,  desc: "EMIs plus extra attack. Highest interest first.",          order: 4 },
    { key: "emergency", label: "Emergency fund", amount: 5_000,  icon: "🔒", locked: true,  desc: "A small buffer that grows once debt is cleared.",          order: 5 },
];
