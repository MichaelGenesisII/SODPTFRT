import type { AuthError } from "@supabase/supabase-js";

/** Stale / missing refresh cookies — treat as signed out, not a hard failure. */
export function isStaleRefreshAuthError(
  error: AuthError | { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = (error.code || "").toLowerCase();
  const message = (error.message || "").toLowerCase();
  return (
    code === "refresh_token_not_found" ||
    code === "session_not_found" ||
    message.includes("refresh token") ||
    message.includes("invalid claim") ||
    message.includes("session from session_id claim")
  );
}
