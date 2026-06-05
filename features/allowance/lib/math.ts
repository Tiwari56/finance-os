// ════════════════════════════════════════════════════════════════
//  allowance/lib/math.ts
//  Daily allowance calculation — pure function, no DB.
// ════════════════════════════════════════════════════════════════

export interface AllowanceResult {
    perDay: number;
    remaining: number;
    daysLeft: number;
    dayOfMonth: number;
    daysInMonth: number;
    pctMonthGone: number;
    pctBudgetGone: number;
}

export function dailyAllowance(
    flexBudgetTotal: number,
    spentThisMonth: number,
    today: Date = new Date()
): AllowanceResult {
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);
    const remaining = Math.max(0, flexBudgetTotal - spentThisMonth);
    return {
        perDay: Math.floor(remaining / daysLeft),
        remaining,
        daysLeft,
        dayOfMonth,
        daysInMonth,
        pctMonthGone: Math.round((dayOfMonth / daysInMonth) * 100),
        pctBudgetGone: Math.round((spentThisMonth / Math.max(1, flexBudgetTotal)) * 100),
    };
}
