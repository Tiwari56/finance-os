// ════════════════════════════════════════════════════════════════
//  debts/lib/avalanche.ts
//  Debt avalanche projection — pure function, no DB.
// ════════════════════════════════════════════════════════════════

export interface DebtSnapshot {
    id: string;
    name: string;
    balance: number;
    rate: number;
    emi: number;
    type: string;
}

export interface AvalancheResult {
    months: number;
    finalBal: DebtSnapshot[];
    hist: Array<{ month: number; total: number; payoffs: string[] }>;
}

export function avalanche(debts: DebtSnapshot[], monthlyPayment: number): AvalancheResult {
    let bal = debts.map(d => ({ ...d }));
    let months = 0;
    const hist = [{ month: 0, total: bal.reduce((s, d) => s + d.balance, 0), payoffs: [] as string[] }];

    while (bal.some(d => d.balance > 0) && months < 120) {
        months++;
        let rem = monthlyPayment;
        const payoffs: string[] = [];

        // Pay EMIs first
        bal = bal.map(d => {
            if (d.balance <= 0) return d;
            const p = Math.min(d.emi || 0, d.balance);
            rem -= p;
            const nb = Math.max(0, d.balance - p);
            if (nb <= 1 && d.balance > 1) payoffs.push(d.name);
            return { ...d, balance: nb };
        });

        // Avalanche: highest rate first with remaining budget
        const targets = [...bal].filter(d => d.balance > 0).sort((a, b) => b.rate - a.rate);
        for (const t of targets) {
            if (rem <= 0) break;
            const p = Math.min(rem, t.balance);
            rem -= p;
            bal = bal.map(d => {
                if (d.id !== t.id) return d;
                const nb = Math.max(0, d.balance - p);
                if (nb <= 1 && d.balance > 1) payoffs.push(d.name);
                return { ...d, balance: nb };
            });
        }

        // Monthly interest
        bal = bal.map(d => d.balance > 0 ? { ...d, balance: d.balance * (1 + d.rate / 100 / 12) } : d);
        hist.push({ month: months, total: bal.reduce((s, d) => s + d.balance, 0), payoffs });
    }

    return { months, hist, finalBal: bal };
}
