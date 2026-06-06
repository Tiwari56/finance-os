// middleware.ts — protect all pages except /login and /api/auth/*
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
    const isLoginPage = req.nextUrl.pathname === "/login";
    const isPublicApiRoute =
        req.nextUrl.pathname.startsWith("/api/log-expense") || // for n8n webhook
        req.nextUrl.pathname.startsWith("/api/health");

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
