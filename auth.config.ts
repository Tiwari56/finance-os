// ════════════════════════════════════════════════════════════════
//  auth.config.ts — Edge-safe NextAuth config
//
//  Contains ONLY config that's safe to import from middleware
//  (Edge runtime). No DB adapter, no Node-only providers.
//  The full config (with Drizzle adapter + Credentials) lives in
//  ./auth.ts and `satisfies` this file.
//
//  This split is the official NextAuth v5 pattern for Edge support.
//  See https://authjs.dev/guides/edge-compatibility
// ════════════════════════════════════════════════════════════════

import type { NextAuthConfig } from "next-auth";

export default {
    session: { strategy: "jwt" },
    pages: {
        signIn: "/login",
    },
    // No providers / adapter here — those live in ./auth.ts.
    providers: [],
    callbacks: {
        jwt({ token, user }) {
            if (user) token.id = user.id;
            return token;
        },
        session({ session, token }) {
            if (token?.id) session.user.id = token.id as string;
            return session;
        },
    },
} satisfies NextAuthConfig;
