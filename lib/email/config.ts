function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function fromAddress(): string {
  return (
    trimEnv("EMAIL_FROM_ADDRESS") ||
    trimEnv("RESEND_FROM") ||
    ""
  );
}

function domainFromEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "portal.schoolofdisciples.org";
  }
  return email.slice(at + 1).toLowerCase();
}

/** Lazy email settings — always read current process.env (Next/serverless safe). */
export const emailConfig = {
  get from() {
    return {
      name: trimEnv("EMAIL_FROM_NAME") || "School of Disciples",
      address: fromAddress(),
    };
  },
  get replyTo() {
    return trimEnv("EMAIL_REPLY_TO");
  },
  get noreply() {
    return (
      trimEnv("EMAIL_NOREPLY") ||
      trimEnv("EMAIL_FROM_ADDRESS") ||
      undefined
    );
  },
  get messageIdDomain() {
    return (
      trimEnv("EMAIL_MESSAGE_ID_DOMAIN") ||
      domainFromEmail(fromAddress())
    );
  },
  get orgAddress() {
    return (
      trimEnv("EMAIL_ORG_ADDRESS") ||
      "School of Disciples, Belfast, Northern Ireland"
    );
  },
  get listUnsubscribeMailto() {
    return trimEnv("EMAIL_LIST_UNSUBSCRIBE_MAILTO");
  },
};

/** @deprecated Use emailConfig — kept for template imports. */
export const config = emailConfig;

export function resendApiKey(): string | undefined {
  return trimEnv("RESEND_API_KEY");
}

export function isEmailConfigured(): boolean {
  return Boolean(resendApiKey() && emailConfig.from.address);
}

export function formatFromAddress(): string {
  const { name, address } = emailConfig.from;
  if (!address) return "";
  return name ? `${name} <${address}>` : address;
}

/** Absolute portal origin for links inside emails. */
export function portalBaseUrl(): string {
  return (
    trimEnv("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "") ||
    trimEnv("EMAIL_PORTAL_URL")?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
