import {
  isPaypalPayoutsConfigured,
  paypalActiveCredentials,
  paypalApiBaseUrl,
  paypalEnv,
  paypalWebhookId,
} from "@/lib/paypal/config";

type TokenCache = {
  env: string;
  accessToken: string;
  expiresAtMs: number;
};
let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (!isPaypalPayoutsConfigured()) {
    throw new Error("PayPal payouts are not configured.");
  }
  const creds = paypalActiveCredentials()!;
  const env = paypalEnv();
  const now = Date.now();
  if (
    tokenCache &&
    tokenCache.env === env &&
    tokenCache.expiresAtMs > now + 60_000
  ) {
    return tokenCache.accessToken;
  }

  const auth = Buffer.from(
    `${creds.clientId}:${creds.clientSecret}`,
  ).toString("base64");
  const res = await fetch(`${paypalApiBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    console.error("[paypal/token]", res.status, json.error_description);
    throw new Error("PayPal authentication failed.");
  }
  tokenCache = {
    env,
    accessToken: json.access_token,
    expiresAtMs: now + (json.expires_in ?? 30000) * 1000,
  };
  return json.access_token;
}

export type PaypalCreatePayoutInput = {
  idempotencyKey: string;
  senderBatchId: string;
  senderItemId: string;
  receiverEmail: string;
  amountGbp: number;
  currency?: string;
  note?: string;
  emailSubject?: string;
};

export type PaypalCreatePayoutResult = {
  ok: boolean;
  status: number;
  payoutBatchId: string | null;
  batchStatus: string | null;
  raw: unknown;
  errorMessage?: string;
};

export async function createPaypalPayout(
  input: PaypalCreatePayoutInput,
): Promise<PaypalCreatePayoutResult> {
  const token = await getAccessToken();
  const amount = input.amountGbp.toFixed(2);
  const body = {
    sender_batch_header: {
      sender_batch_id: input.senderBatchId.slice(0, 256),
      email_subject:
        input.emailSubject ?? "You have a payment from School of Disciples",
      email_message:
        "Teacher pay has been released. Please check your PayPal balance.",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: {
          value: amount,
          currency: (input.currency || "GBP").toUpperCase(),
        },
        receiver: input.receiverEmail.trim(),
        note: (input.note || "Teacher pay").slice(0, 1000),
        sender_item_id: input.senderItemId.slice(0, 127),
      },
    ],
  };

  const res = await fetch(`${paypalApiBaseUrl()}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": input.idempotencyKey.slice(0, 1000),
    },
    body: JSON.stringify(body),
  });

  const raw = await res.json().catch(() => ({}));
  const batch = (raw as { batch_header?: Record<string, unknown> })
    .batch_header;
  const payoutBatchId =
    typeof batch?.payout_batch_id === "string" ? batch.payout_batch_id : null;
  const batchStatus =
    typeof batch?.batch_status === "string" ? batch.batch_status : null;

  if (!res.ok) {
    const message =
      typeof (raw as { message?: string }).message === "string"
        ? (raw as { message: string }).message
        : "PayPal could not accept this payout.";
    console.error("[paypal/payouts/create]", res.status, message);
    return {
      ok: false,
      status: res.status,
      payoutBatchId,
      batchStatus,
      raw,
      errorMessage: message,
    };
  }

  return {
    ok: true,
    status: res.status,
    payoutBatchId,
    batchStatus,
    raw,
  };
}

export type PaypalBatchDetails = {
  ok: boolean;
  payoutBatchId: string;
  batchStatus: string | null;
  itemStatus: string | null;
  itemTxnId: string | null;
  raw: unknown;
};

export async function getPaypalPayoutBatch(
  payoutBatchId: string,
): Promise<PaypalBatchDetails> {
  const token = await getAccessToken();
  const res = await fetch(
    `${paypalApiBaseUrl()}/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[paypal/payouts/get]", res.status, raw);
    return {
      ok: false,
      payoutBatchId,
      batchStatus: null,
      itemStatus: null,
      itemTxnId: null,
      raw,
    };
  }

  const batch = (raw as { batch_header?: Record<string, unknown> })
    .batch_header;
  const items = (raw as { items?: Record<string, unknown>[] }).items ?? [];
  const first = items[0];
  const txn =
    first && typeof first.transaction_id === "string"
      ? first.transaction_id
      : null;
  const itemStatus =
    first && typeof first.transaction_status === "string"
      ? first.transaction_status
      : null;

  return {
    ok: true,
    payoutBatchId,
    batchStatus:
      typeof batch?.batch_status === "string" ? batch.batch_status : null,
    itemStatus,
    itemTxnId: txn,
    raw,
  };
}

export async function verifyPaypalWebhookSignature(input: {
  transmissionId: string;
  timestamp: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
  webhookEvent: unknown;
}): Promise<boolean> {
  const webhookId = paypalWebhookId();
  if (!webhookId) return false;

  const token = await getAccessToken();
  const res = await fetch(
    `${paypalApiBaseUrl()}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transmission_id: input.transmissionId,
        transmission_time: input.timestamp,
        cert_url: input.certUrl,
        auth_algo: input.authAlgo,
        transmission_sig: input.transmissionSig,
        webhook_id: webhookId,
        webhook_event: input.webhookEvent,
      }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    verification_status?: string;
  };
  if (!res.ok) {
    console.error("[paypal/webhook/verify]", res.status, json);
    return false;
  }
  return json.verification_status === "SUCCESS";
}
