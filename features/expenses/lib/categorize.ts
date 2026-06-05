// ════════════════════════════════════════════════════════════════
//  expenses/lib/categorize.ts
//  Pure function: merchant text → category key
//  Used by both the API log handler and n8n parity tests.
// ════════════════════════════════════════════════════════════════

export const CATEGORIES = {
    food: { label: "Food", envelope: "food", icon: "🍱", keywords: ["swiggy", "zomato", "blinkit", "zepto", "grocery", "restaurant", "cafe", "dominos", "kfc", "mcdonald", "dunzo", "bigbasket", "instamart"] },
    freedom: { label: "Lifestyle", envelope: "freedom", icon: "🎯", keywords: ["amazon", "flipkart", "myntra", "bookmyshow", "pvr", "bar", "liquor", "smoke", "cigarette", "party", "uber eats", "nykaa", "ajio"] },
    rent: { label: "Rent", envelope: "survival", icon: "🏠", keywords: ["rent", "landlord"] },
    maintenance: { label: "Maintenance", envelope: "survival", icon: "⚡", keywords: ["maintenance", "society", "electricity", "water", "gas"] },
    subscriptions: { label: "Subscriptions", envelope: "survival", icon: "📺", keywords: ["netflix", "prime", "hotstar", "spotify", "youtube"] },
    family: { label: "Family", envelope: "survival", icon: "📱", keywords: ["family", "recharge", "jio", "airtel", "vi ", "vodafone"] },
    furniture: { label: "Furniture", envelope: "survival", icon: "🛋️", keywords: ["furlenco", "rentomojo", "cityfurnish"] },
    commute: { label: "Commute", envelope: "survival", icon: "🚇", keywords: ["uber", "ola", "rapido", "metro", "petrol", "fuel", "fastag", "irctc"] },
    bills: { label: "Bills", envelope: "survival", icon: "🧾", keywords: ["broadband", "insurance"] },
    sip: { label: "SIP", envelope: "sip", icon: "📈", keywords: ["sip", "mutual fund", "mf "] },
    debt: { label: "Debt/EMI", envelope: "debt", icon: "💳", keywords: ["emi", "loan", "credit card", "axis", "repayment"] },
    renovation: { label: "Renovation", envelope: "freedom", icon: "🧱", keywords: ["tile", "paint", "carpenter", "plumber", "renovation", "cement"] },
    other: { label: "Other", envelope: "freedom", icon: "📦", keywords: [] },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

export const FLEX_ENVELOPES = new Set(["food", "freedom"]);

export function categorize(text: string = ""): CategoryKey {
    const lower = text.toLowerCase();
    for (const [key, cat] of Object.entries(CATEGORIES)) {
        if (cat.keywords.some((k) => lower.includes(k))) return key as CategoryKey;
    }
    return "other";
}

export function isFlexCategory(cat: CategoryKey): boolean {
    return FLEX_ENVELOPES.has(CATEGORIES[cat].envelope);
}
