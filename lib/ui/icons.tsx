"use client";

// ════════════════════════════════════════════════════════════════
//  lib/ui/icons.tsx — inline SVG icon set (stroke-based, 24×24).
//  Replaces emoji in app chrome (nav, headers, buttons). Emoji are
//  still fine as *content* (user-chosen envelope/bill icons).
// ════════════════════════════════════════════════════════════════

import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
    home: (
        <>
            <path d="M3 10.8 12 3.4l9 7.4" />
            <path d="M5.5 9.5V19a2 2 0 0 0 2 2H10v-5.5h4V21h2.5a2 2 0 0 0 2-2V9.5" />
        </>
    ),
    "pie-chart": (
        <>
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </>
    ),
    clock: (
        <>
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15.5 14" />
        </>
    ),
    "credit-card": (
        <>
            <rect x="2.5" y="5" width="19" height="14" rx="3" />
            <line x1="2.5" y1="10" x2="21.5" y2="10" />
        </>
    ),
    sparkles: (
        <>
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
            <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        </>
    ),
    sliders: (
        <>
            <line x1="4" y1="7" x2="20" y2="7" />
            <circle cx="9.5" cy="7" r="2.4" />
            <line x1="4" y1="17" x2="20" y2="17" />
            <circle cx="14.5" cy="17" r="2.4" />
        </>
    ),
    plus: (
        <>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </>
    ),
    x: (
        <>
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
        </>
    ),
    check: <polyline points="5 12.5 10 17.5 19 7" />,
    "chevron-down": <polyline points="6 9.5 12 15.5 18 9.5" />,
    copy: (
        <>
            <rect x="9" y="9" width="11.5" height="11.5" rx="2.5" />
            <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
        </>
    ),
    refresh: (
        <>
            <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.3" />
            <polyline points="3.5 3.5 3.5 8.5 8.5 8.5" />
        </>
    ),
    eye: (
        <>
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
    "eye-off": (
        <>
            <path d="M2.5 12S6 5.5 12 5.5c1.7 0 3.2.5 4.5 1.2M21.5 12S18 18.5 12 18.5c-1.7 0-3.2-.5-4.5-1.2" />
            <line x1="4" y1="20" x2="20" y2="4" />
        </>
    ),
    "log-out": (
        <>
            <path d="M9.5 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.5" />
            <polyline points="15.5 16.5 20 12 15.5 7.5" />
            <line x1="20" y1="12" x2="9.5" y2="12" />
        </>
    ),
    banknote: (
        <>
            <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
            <circle cx="12" cy="12" r="2.6" />
            <line x1="6" y1="12" x2="6.01" y2="12" />
            <line x1="18" y1="12" x2="18.01" y2="12" />
        </>
    ),
    flame: (
        <>
            <path d="M12 2.5s5.5 5 5.5 9.8a5.5 5.5 0 0 1-11 0c0-2.1 1-4 2.3-5.6C10.2 5 12 2.5 12 2.5z" />
            <path d="M12 21.5a3 3 0 0 0 3-3c0-1.6-1.4-3-3-4.5-1.6 1.5-3 2.9-3 4.5a3 3 0 0 0 3 3z" />
        </>
    ),
    "trending-down": (
        <>
            <polyline points="3 7 9.5 13.5 13.5 9.5 21 17" />
            <polyline points="15.5 17 21 17 21 11.5" />
        </>
    ),
    "trending-up": (
        <>
            <polyline points="3 17 9.5 10.5 13.5 14.5 21 7" />
            <polyline points="15.5 7 21 7 21 12.5" />
        </>
    ),
    calendar: (
        <>
            <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
            <line x1="3.5" y1="10" x2="20.5" y2="10" />
            <line x1="8" y1="3" x2="8" y2="7" />
            <line x1="16" y1="3" x2="16" y2="7" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </>
    ),
    "alert-circle": (
        <>
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12.8" />
            <line x1="12" y1="16.2" x2="12.01" y2="16.2" />
        </>
    ),
    receipt: (
        <>
            <path d="M5.5 3h13v18l-2.2-1.5L14 21l-2-1.5L10 21l-2.3-1.5L5.5 21z" />
            <line x1="9" y1="8.5" x2="15" y2="8.5" />
            <line x1="9" y1="12.5" x2="15" y2="12.5" />
        </>
    ),
    inbox: (
        <>
            <path d="M21 13.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4.5L5.7 5.3A2 2 0 0 1 7.6 4h8.8a2 2 0 0 1 1.9 1.3z" />
            <polyline points="3 13.5 9 13.5 10.5 16 13.5 16 15 13.5 21 13.5" />
        </>
    ),
    target: (
        <>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.2" />
        </>
    ),
    shield: (
        <>
            <path d="M12 2.8l7.5 2.8v6.1c0 4.3-3 7.5-7.5 8.9-4.5-1.4-7.5-4.6-7.5-8.9V5.6z" />
            <polyline points="8.8 12 11 14.2 15.2 9.8" />
        </>
    ),
    wallet: (
        <>
            <path d="M20 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20H19a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2H5.5" />
            <line x1="16.5" y1="13.5" x2="16.51" y2="13.5" />
        </>
    ),
    layers: (
        <>
            <polygon points="12 2 2 7 12 12 22 7" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
        </>
    ),
    "bar-chart": (
        <>
            <rect x="3" y="14" width="4" height="7" rx="1" />
            <rect x="10" y="9" width="4" height="12" rx="1" />
            <rect x="17" y="5" width="4" height="16" rx="1" />
        </>
    ),
    "chevron-right": <polyline points="9.5 6 15.5 12 9.5 18" />,
    edit: (
        <>
            <path d="M11.5 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6.5" />
            <path d="M16.5 2.5a2.121 2.121 0 0 1 3 3L10 15l-4 1 1-4z" />
        </>
    ),
    trash: (
        <>
            <polyline points="3 6.5 21 6.5" />
            <path d="M19 6.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5" />
            <path d="M9 6.5v-2a2 2 0 0 1 4 0v2" />
        </>
    ),
};

export type IconName = keyof typeof PATHS;

export function Icon({
    name, size = 20, strokeWidth = 1.8, className = "",
}: {
    name: IconName | string;
    size?: number;
    strokeWidth?: number;
    className?: string;
}) {
    const paths = PATHS[name as IconName];
    if (!paths) return null;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden
        >
            {paths}
        </svg>
    );
}

/** Brand mark — gradient rounded square with a pulse line. */
export function LogoMark({ size = 36 }: { size?: number }) {
    return (
        <div
            className="rounded-[28%] flex items-center justify-center shrink-0"
            style={{
                width: size,
                height: size,
                background: "linear-gradient(135deg, #7d99ff 0%, #5b7cfa 55%, #8b5cf6 100%)",
                boxShadow: "0 1px 0 rgba(255,255,255,0.35) inset, 0 8px 20px -8px rgba(91,124,250,0.7)",
            }}
        >
            <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="3 13.5 7.5 13.5 10 7 14 18 16.5 11.5 21 11.5" />
            </svg>
        </div>
    );
}
