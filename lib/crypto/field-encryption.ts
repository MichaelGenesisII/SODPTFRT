import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Field encryption for teacher bank / PayPal values.
 * Key: TEACHER_PAYMENT_ENCRYPTION_KEY — 32-byte secret as base64 (or 64 hex chars).
 */
function loadKey(): Buffer {
  const raw = process.env.TEACHER_PAYMENT_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("Payment details encryption is not configured.");
  }
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error("Payment details encryption key must be 32 bytes.");
  }
  return key;
}

export function isPaymentEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/** Returns base64url payload: iv.ciphertext.tag */
export function encryptField(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptField(payload: string): string {
  const key = loadKey();
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload.");
  }
  const [ivB64, dataB64, tagB64] = parts;
  const iv = Buffer.from(ivB64!, "base64url");
  const data = Buffer.from(dataB64!, "base64url");
  const tag = Buffer.from(tagB64!, "base64url");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("Invalid encrypted payload.");
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
