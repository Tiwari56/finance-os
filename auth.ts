// ════════════════════════════════════════════════════════════════
//  auth.ts — NextAuth v5 config
//  Providers: Google, GitHub, Credentials (email + password)
// ════════════════════════════════════════════════════════════════

import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/features/core/db/client";
import { users } from "@/features/core/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: DrizzleAdapter(db, {
        usersTable: users,
    } as never),
    session: { strategy: "jwt" },
    pages: {
        signIn: "/login",
    },
    providers: [
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
            ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
            : []),
        ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
            ? [GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET })]
            : []),
        Credentials({
            name: "Email",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                const [user] = await db
                    .select()
                    .from(users)
                    .where(eq(users.email, credentials.email as string))
                    .limit(1);

                if (!user?.passwordHash) return null;

                const valid = await bcrypt.compare(
                    credentials.password as string,
                    user.passwordHash,
                );
                if (!valid) return null;

                return { id: user.id, name: user.name, email: user.email, image: user.image };
            },
        }),
    ],
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
});
