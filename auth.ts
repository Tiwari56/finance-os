// ════════════════════════════════════════════════════════════════
//  auth.ts — NextAuth v5 (Node runtime)
//  Composes the Edge-safe config from ./auth.config.ts and adds
//  the DB adapter + Credentials provider here (Node-only deps).
// ════════════════════════════════════════════════════════════════

import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/features/core/db/client";
import { users } from "@/features/core/db/schema";
import { eq } from "drizzle-orm";
import authConfig from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    adapter: DrizzleAdapter(db, {
        usersTable: users,
    } as never),
    providers: [
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
});
