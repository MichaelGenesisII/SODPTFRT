const ALLOWED_PREFIXES = ["/admin", "/student", "/alumni"] as const;

/** Prevent open redirects from /auth/continue?next=… */
export function safeAuthContinuePath(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("://")
  ) {
    return "/";
  }

  const path = value.split("#")[0]?.split("?")[0] ?? value;
  for (const prefix of ALLOWED_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return value;
    }
  }

  return "/";
}
