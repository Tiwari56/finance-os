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
    { key: "survival",  label: "Rent & bills",        amount: 50_000, icon: "🏠", locked: true,  desc: "Rent, utilities, phone, commute — the things you have to pay.", order: 0 },
    { key: "food",      label: "Food & groceries",    amount: 10_000, icon: "🍱", locked: false, desc: "Groceries and eating out.",                                    order: 1 },
    { key: "freedom",   label: "Fun & shopping",      amount: 10_000, icon: "🎯", locked: false, desc: "Going out, shopping, hobbies. When it's zero, it's zero.",      order: 2 },
    { key: "sip",       label: "Savings & investing", amount: 10_000, icon: "📈", locked: true,  desc: "Money you set aside every month. Try never to skip it.",        order: 3 },
    { key: "debt",      label: "Debt payments",       amount: 15_000, icon: "⚡", locked: true,  desc: "EMIs and extra payments to clear debt faster.",                 order: 4 },
    { key: "emergency", label: "Emergency fund",      amount: 5_000,  icon: "🔒", locked: true,  desc: "A safety buffer for surprises.",                                order: 5 },
];
