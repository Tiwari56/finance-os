// ════════════════════════════════════════════════════════════════
//  lib/crypto.ts — AES-256-GCM for secrets at rest (BYOK API keys).
//
//  Key derivation: scrypt(AI_KEY_SECRET ?? AUTH_SECRET). A dedicated
//  AI_KEY_SECRET lets you rotate auth without invalidating stored
//  keys, but AUTH_SECRET works fine as the default.
//
//  Wire format: base64(iv) + ":" + base64(authTag) + ":" + base64(ct)
// ════════════════════════════════════════════════════════════════

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SCRYPT_SALT = "finance-os-ai-key-v1";

function deriveKey(): Buffer {
    const secret = process.env.AI_KEY_SECRET || process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AI_KEY_SECRET or AUTH_SECRET must be set to encrypt stored API keys");
    }
    return scryptSync(secret, SCRYPT_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
    const key = deriveKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
    const [ivB64, tagB64, ctB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed encrypted payload");
    const key = deriveKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(ctB64, "base64")),
        decipher.final(),
    ]).toString("utf8");
}

/** "sk-ant-api03-Br8A…QAA" → "sk-ant-…iQAA" for safe display */
export function maskKey(key: string): string {
    if (key.length <= 14) return "•••••";
    return key.slice(0, 7) + "…" + key.slice(-4);
}
