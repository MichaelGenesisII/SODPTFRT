/**
 * PayPal Payouts config — Phase 5 supports sandbox and live via PAYPAL_ENV.
 */

export type PaypalEnv = "sandbox" | "live";

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function paypalEnv(): PaypalEnv {
  const raw = (trimEnv("PAYPAL_ENV") ?? "sandbox").toLowerCase();
  return raw === "live" ? "live" : "sandbox";
}

export function paypalApiBaseUrl(): string {
  return paypalEnv() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paypalSandboxCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = trimEnv("PAYPAL_SANDBOX_CLIENT_ID");
  const clientSecret = trimEnv("PAYPAL_SANDBOX_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function paypalLiveCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = trimEnv("PAYPAL_LIVE_CLIENT_ID");
  const clientSecret = trimEnv("PAYPAL_LIVE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Credentials for the active PAYPAL_ENV. */
export function paypalActiveCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  return paypalEnv() === "live"
    ? paypalLiveCredentials()
    : paypalSandboxCredentials();
}

export function isPaypalPayoutsConfigured(): boolean {
  return Boolean(paypalActiveCredentials());
}

export function paypalWebhookId(): string | undefined {
  return paypalEnv() === "live"
    ? trimEnv("PAYPAL_LIVE_WEBHOOK_ID")
    : trimEnv("PAYPAL_SANDBOX_WEBHOOK_ID");
}

/** Calm copy — never names env vars. */
export const PAYPAL_UNAVAILABLE_MESSAGE =
  "Online payouts are not available right now.";
