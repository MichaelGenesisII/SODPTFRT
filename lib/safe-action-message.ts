/**
 * Public-facing action / toast copy. Strips secrets and technical leakage
 * before anything reaches the browser UI.
 */

const SECRETISH =
  /password|passwd|secret|api[_-]?key|bearer\s+[a-z0-9._-]+|service_role|jwt|authorization|postgres:\/\/|mysql:\/\/|mongodb(\+srv)?:\/\/|smtp:\/\/|EMAIL_[A-Z_]+|private[_-]?key|-----BEGIN/i;

const TECHNICAL =
  /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|socket hang up|getaddrinfo|SMTP|nodemailer|Postgrest|PGRST|supabase\.co|supabase\/|relation ["']|column ["'].*does not exist|violates (foreign key|unique|check)|permission denied for|stack trace|at\s+\S+\s+\(|\.sql\b|row level security|\brls\b|service[_ ]?role|security definer|postgres|uuid_generate|could not find the table|schema cache/i;

const EMAIL_TECHNICAL =
  /smtp|nodemailer|ECONN|ENOTFOUND|authentication failed|invalid login|relay|outbox|EMAIL_/i;

function redact(value: string): string {
  return value
    .replace(
      /Bearer\s+[A-Za-z0-9._\-]+/gi,
      "Bearer [redacted]",
    )
    .replace(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[redacted-token]",
    )
    .replace(
      /(postgres|mysql|mongodb(\+srv)?|smtp):\/\/[^\s]+/gi,
      "[redacted-connection]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (email) => {
      // Keep short support-style addresses in known safe messages; redact others in dumps
      if (/schoolofdisciples\.org$/i.test(email) || /example\.com$/i.test(email)) {
        return email;
      }
      return "[email]";
    })
    .trim();
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

/**
 * Message safe to show in toasts / action results.
 * Intentional short UX copy passes through; raw DB/SMTP/stack text does not.
 */
export function publicActionMessage(
  raw: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (raw == null) return fallback;
  const source =
    typeof raw === "string"
      ? raw
      : raw instanceof Error
        ? raw.message
        : typeof raw === "object" &&
            raw !== null &&
            "message" in raw &&
            typeof (raw as { message: unknown }).message === "string"
          ? (raw as { message: string }).message
          : "";

  const cleaned = redact(source);
  if (!cleaned) return fallback;

  if (SECRETISH.test(cleaned) || TECHNICAL.test(cleaned)) {
    return fallback;
  }

  // Cap length — long dumps are almost never intentional UX copy.
  if (cleaned.length > 160) {
    return fallback;
  }

  // In production, reject messages that look like library/driver noise.
  if (isProduction() && /error:|exception|undefined is not|cannot read/i.test(cleaned)) {
    return fallback;
  }

  return cleaned;
}

/** Lifecycle / campaign email failures — never surface SMTP internals. */
export function publicEmailFailureMessage(prefix: string, detail?: string): string {
  const safePrefix = publicActionMessage(prefix, prefix);
  if (!detail) {
    return `${safePrefix} The email could not be sent.`;
  }
  if (isProduction() || EMAIL_TECHNICAL.test(detail) || SECRETISH.test(detail)) {
    return `${safePrefix} The email could not be sent. Check the email service and try again.`;
  }
  const safeDetail = publicActionMessage(detail, "");
  if (!safeDetail) {
    return `${safePrefix} The email could not be sent.`;
  }
  return `${safePrefix} Email issue: ${safeDetail}`;
}

/**
 * Generic unavailable copy when a desk/feature cannot load.
 * Never mention SQL files, table names, or schema setup.
 */
export function publicUnavailableMessage(
  deskLabel = "This desk",
): string {
  return `${deskLabel} is temporarily unavailable. Please try again later.`;
}

/** Last-line toast sanitizer (client). */
export function publicToastMessage(
  message: string,
  tone: "success" | "error" | "info",
): string {
  if (tone !== "error") {
    // Still redact secrets if someone accidentally passes them.
    if (SECRETISH.test(message)) {
      return "Done.";
    }
    return message.length > 220 ? `${message.slice(0, 217)}…` : message;
  }
  return publicActionMessage(message);
}
