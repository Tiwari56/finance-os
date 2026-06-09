// ════════════════════════════════════════════════════════════════
//  allowance/lib/math.ts
//
//  Two functions:
//
//    1) dailyAllowance(...)   — legacy "evenly-distribute remaining flex
//                              budget across remaining days" calculator.
//                              Kept for back-compat with summary/state/
//                              send-report/advisor callers.
//
//    2) smartAllowance(input) — dynamic allowance that asks "given EVERY-
//                              thing about your financial situation —
//                              income, what's already spent, unpaid bills,
//                              debt EMIs, pace so far, days until salary —
//                              what's the SAFE amount to spend today?"
//
//  All math is pure. Date defaults to `new Date()` when not passed.
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

// ─── Smart allowance ──────────────────────────────────────────────

export interface SmartAllowanceInput {
    income:           number;   // monthly take-home
    salaryDay:        number;   // day of month (1-28)
    flexSpentCycle:   number;   // flex (food+freedom) spent since last salary
    flexBudgetCycle:  number;   // flex budget per cycle
    billsRemaining:   number;   // unpaid fixed bills still due this cycle
    debtEmiRemaining: number;   // EMI commitments not yet paid this cycle
    sipRemaining:     number;   // SIP / locked savings not yet executed
    todaySpentFlex:   number;   // flex-category spend strictly today
    todaySpentTotal:  number;   // any spend today (flex + non-flex)
    now?:             Date;
}

export interface SmartAllowanceResult {
    /** Suggested spend for TODAY after subtracting what's already gone today */
    suggestedToday:      number;
    /** Even-pacing baseline (what dailyAllowance would have given you) */
    baselinePerDay:      number;
    /** Pace-corrected per-day (lower if burning fast, higher if under-pacing) */
    smartPerDay:         number;
    /** Total money committed to bills + EMI + SIP that you can't spend on flex */
    obligations:         number;
    /** Flex still safely available across the cycle */
    safelyAvailableFlex: number;
    cycle: {
        daysInCycle:  number;
        dayOfCycle:   number;
        daysLeft:     number;
        pctCycleGone: number;
        pctFlexGone:  number;
        cycleStart:   Date;
        cycleEnd:     Date;
    };
    pace: {
        /** % over (positive) or under (negative) the expected linear pace */
        overpaceBy: number;
        /** Plain-language pace verdict */
        verdict:    "under" | "on-track" | "watch" | "over";
    };
    /** One-line explanation suitable for UI / advisor */
    rationale:           string;
}

function startOfCycle(salaryDay: number, now: Date): {
    start: Date; end: Date; days: number; dayOfCycle: number;
} {
    const dayClamped = Math.max(1, Math.min(28, salaryDay));
    const y = now.getFullYear();
    const m = now.getMonth();
    const todayDate = now.getDate();
    const start = todayDate >= dayClamped
        ? new Date(y, m,     dayClamped)
        : new Date(y, m - 1, dayClamped);
    const end   = todayDate >= dayClamped
        ? new Date(y, m + 1, dayClamped)
        : new Date(y, m,     dayClamped);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const dayOfCycle = Math.max(1, Math.round((now.getTime() - start.getTime()) / 86400000) + 1);
    return { start, end, days, dayOfCycle };
}

export function smartAllowance(input: SmartAllowanceInput): SmartAllowanceResult {
    const now = input.now ?? new Date();
    const { start, end, days, dayOfCycle } = startOfCycle(input.salaryDay, now);
    const daysLeft = Math.max(1, days - dayOfCycle + 1);
    const pctCycleGone = Math.round((dayOfCycle / days) * 100);
    const pctFlexGone  = input.flexBudgetCycle > 0
        ? Math.round((input.flexSpentCycle / input.flexBudgetCycle) * 100)
        : 0;

    const obligations = Math.max(0,
        input.billsRemaining + input.debtEmiRemaining + input.sipRemaining
    );

    const flexRemaining = Math.max(0, input.flexBudgetCycle - input.flexSpentCycle);

    // Baseline: even pacing across remaining days
    const baselinePerDay = Math.floor(flexRemaining / daysLeft);

    // Pace correction: if user is N% ahead of where they should be by now,
    // shrink the per-day to bring them back in line over the rest of the
    // cycle. If under-pace, bump up slightly so budget isn't hoarded.
    const overpaceBy = pctFlexGone - pctCycleGone;
    let paceFactor = 1;
    let verdict: SmartAllowanceResult["pace"]["verdict"];
    if (overpaceBy > 25)      { paceFactor = 0.65; verdict = "over"; }
    else if (overpaceBy > 12) { paceFactor = 0.82; verdict = "watch"; }
    else if (overpaceBy < -15){ paceFactor = 1.12; verdict = "under"; }
    else                       { paceFactor = 1.00; verdict = "on-track"; }
    const smartPerDay = Math.max(0, Math.floor(baselinePerDay * paceFactor));

    // Today's suggestion = smart per-day minus what already went out today
    const suggestedToday = Math.max(0, smartPerDay - input.todaySpentFlex);

    const safelyAvailableFlex = flexRemaining;

    // Rationale
    const inr = (n: number) =>
        "₹" + Math.round(Math.max(0, n)).toLocaleString("en-IN");
    const rationale = (() => {
        if (verdict === "over") {
            return `Burning ${Math.abs(overpaceBy)}% faster than your pace. Trimmed today's spend to keep you safe. ${inr(flexRemaining)} flex left across ${daysLeft} days.`;
        }
        if (verdict === "watch") {
            return `Slightly ahead of pace. Pulled today back by ${Math.round((1 - paceFactor) * 100)}%.`;
        }
        if (verdict === "under") {
            return `Spending under pace. Small upward correction so budget doesn't sit idle.`;
        }
        return `On pace. ${inr(flexRemaining)} flex left across ${daysLeft} days.`;
    })();

    return {
        suggestedToday,
        baselinePerDay,
        smartPerDay,
        obligations,
        safelyAvailableFlex,
        cycle: {
            daysInCycle: days,
            dayOfCycle,
            daysLeft,
            pctCycleGone,
            pctFlexGone,
            cycleStart: start,
            cycleEnd:   end,
        },
        pace: {
            overpaceBy,
            verdict,
        },
        rationale,
    };
}
