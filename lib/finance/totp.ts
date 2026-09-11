import { createHmac, timingSafeEqual } from "node:crypto";

const STEP_SECONDS = 30;

/** Decode base32 (RFC 4648) without padding requirements. */
export function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) throw new Error("Invalid base32 secret.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(buf).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function totpStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

export function generateTotp(
  base32Secret: string,
  step = totpStep(),
): string {
  return hotp(decodeBase32(base32Secret), step);
}

/**
 * Verify a 6-digit TOTP with ±1 step tolerance.
 * Returns the matching step on success (for replay recording), else null.
 */
export function verifyTotp(
  base32Secret: string,
  code: string,
  nowMs = Date.now(),
): number | null {
  const trimmed = code.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) return null;
  const centre = totpStep(nowMs);
  const expectedBuf = Buffer.from(trimmed);
  for (const step of [centre, centre - 1, centre + 1]) {
    const candidate = Buffer.from(hotp(decodeBase32(base32Secret), step));
    if (
      candidate.length === expectedBuf.length &&
      timingSafeEqual(candidate, expectedBuf)
    ) {
      return step;
    }
  }
  return null;
}
