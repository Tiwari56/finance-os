// ════════════════════════════════════════════════════════════════
//  tests/api/ai-access.test.ts
//  Contract tests for the AI access-control layer.
//  (Pattern: file-content assertions, same as auth-routes.test.ts —
//   the pure crypto is unit-tested in tests/lib/crypto.test.ts.)
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("AI access control wiring", () => {
    it("advisor route resolves per-user access instead of using env key directly", () => {
        const route = read("app/api/advisor/route.js");
        expect(route).toContain("resolveAiAccess");
        expect(route).toContain("access.key");          // uses resolved key
        expect(route).toContain("recordAiUsage");        // usage counted
        // env key must NOT be read directly in the POST handler anymore
        const postSection = route.slice(route.indexOf("export async function POST"));
        expect(postSection).not.toContain("process.env.ANTHROPIC_API_KEY");
    });

    it("advisor route returns 403 for locked users and 429 for capped", () => {
        const route = read("app/api/advisor/route.js");
        expect(route).toContain("403");
        expect(route).toContain("429");
        expect(route).toContain("daily-cap");
    });

    it("aiAccess resolves BYOK before admin env key", () => {
        const src = read("lib/aiAccess.ts");
        const byokIdx = src.indexOf("aiSettings");
        const adminIdx = src.indexOf('role === "admin"');
        expect(byokIdx).toBeGreaterThan(-1);
        expect(adminIdx).toBeGreaterThan(-1);
        expect(byokIdx).toBeLessThan(adminIdx);   // BYOK checked first
    });

    it("aiAccess enforces a daily cap on the admin env key", () => {
        const src = read("lib/aiAccess.ts");
        expect(src).toContain("ADMIN_KEY_DAILY_CAP");
        expect(src).toContain("daily-cap");
    });

    it("stored keys are encrypted, never plaintext", () => {
        const keyApi = read("features/advisor/api/key.ts");
        expect(keyApi).toContain("encryptSecret");
        // the schema column is named encrypted_key
        const schema = read("features/core/db/schema.ts");
        expect(schema).toContain("encrypted_key");
    });

    it("key management endpoint validates the key against Anthropic before saving", () => {
        const keyApi = read("features/advisor/api/key.ts");
        expect(keyApi).toContain("api.anthropic.com");
        expect(keyApi).toContain("validateAnthropicKey");
    });

    it("key status endpoint never returns the raw key", () => {
        const access = read("lib/aiAccess.ts");
        // aiAccessStatus must expose only the masked hint
        const statusSection = access.slice(access.indexOf("export async function aiAccessStatus"));
        expect(statusSection).toContain("keyHint");
        expect(statusSection).not.toMatch(/key:\s*access\.key/);
    });

    it("first registered user becomes admin", () => {
        const reg = read("app/api/auth/register/route.ts");
        expect(reg).toContain('anyUser ? "user" : "admin"');
    });

    it("users table has a role column defaulting to user", () => {
        const schema = read("features/core/db/schema.ts");
        expect(schema).toContain('text("role").notNull().default("user")');
    });
});
