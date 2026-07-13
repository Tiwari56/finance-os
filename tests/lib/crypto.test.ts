// ════════════════════════════════════════════════════════════════
//  tests/lib/crypto.test.ts — AES-256-GCM secret storage
// ════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret-for-vitest-0123456789abcdef";
});

describe("encryptSecret / decryptSecret", () => {
    it("round-trips an API key", async () => {
        const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
        const key = "sk-ant-api03-EXAMPLE-KEY-abcdef1234567890";
        const enc = encryptSecret(key);
        expect(enc).not.toContain(key);           // ciphertext ≠ plaintext
        expect(decryptSecret(enc)).toBe(key);
    });

    it("produces a different ciphertext each call (random IV)", async () => {
        const { encryptSecret } = await import("@/lib/crypto");
        const a = encryptSecret("same-input");
        const b = encryptSecret("same-input");
        expect(a).not.toBe(b);
    });

    it("wire format is iv:tag:ct (3 base64 parts)", async () => {
        const { encryptSecret } = await import("@/lib/crypto");
        expect(encryptSecret("x").split(":")).toHaveLength(3);
    });

    it("rejects tampered ciphertext (GCM auth)", async () => {
        const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
        const enc = encryptSecret("sk-ant-secret");
        const parts = enc.split(":");
        // flip a byte in the ciphertext
        const ct = Buffer.from(parts[2], "base64");
        ct[0] = ct[0] ^ 0xff;
        const tampered = `${parts[0]}:${parts[1]}:${ct.toString("base64")}`;
        expect(() => decryptSecret(tampered)).toThrow();
    });

    it("rejects malformed payloads", async () => {
        const { decryptSecret } = await import("@/lib/crypto");
        expect(() => decryptSecret("not-a-valid-payload")).toThrow();
    });
});

describe("maskKey", () => {
    it("masks the middle of long keys", async () => {
        const { maskKey } = await import("@/lib/crypto");
        const masked = maskKey("sk-ant-api03-Br8AkT74doP14t_gQAA");
        expect(masked).toBe("sk-ant-…gQAA");
        expect(masked.length).toBeLessThan(15);
    });

    it("fully hides short strings", async () => {
        const { maskKey } = await import("@/lib/crypto");
        expect(maskKey("short")).toBe("•••••");
    });
});
