// ════════════════════════════════════════════════════════════════
//  middleware.ts — protects all pages except public ones.
//  Uses the Edge-safe auth.config (no DB adapter) so it never
//  imports the libSQL client into the Edge runtime.
// ════════════════════════════════════════════════════════════════

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const path = req.nextUrl.pathname;

    const isAuthRoute     = path.startsWith("/api/auth");
    const isLoginPage     = path === "/login";
    const isPublicApiRoute =
        path.startsWith("/api/log-expense") || // n8n webhook (uses LOG_SECRET)
        path.startsWith("/api/health");

    if (isAuthRoute || isLoginPage || isPublicApiRoute) {
        return NextResponse.next();
    }

    if (!isLoggedIn) {
        const loginUrl = new URL("/login", req.nextUrl.origin);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
