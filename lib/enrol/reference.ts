/**
 * Application reference numbers for enrolment + bank payment matching.
 * Display form: SOD-26-K7MH-4QX2 (readable)
 * Compact form: SOD26K7MH4QX2 (bank transfer reference, 12 chars)
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomChars(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

function yearToken(date = new Date()): string {
  return String(date.getFullYear()).slice(-2);
}

export type ApplicationReference = {
  /** Human-readable with separators */
  display: string;
  /** Compact form for bank payment reference field */
  compact: string;
};

export function createApplicationReference(
  date = new Date(),
): ApplicationReference {
  const yy = yearToken(date);
  const a = randomChars(4);
  const b = randomChars(4);
  return {
    display: `SOD-${yy}-${a}-${b}`,
    compact: `SOD${yy}${a}${b}`,
  };
}

/** Temporary portal password — letters + digits, easy to type once. */
export function createTemporaryPassword(length = 10): string {
  return randomChars(length);
}
