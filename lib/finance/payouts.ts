import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinancePayoutStatus =
  | "draft"
  | "pending_authorisation"
  | "authorised"
  | "sending"
  | "paid"
  | "declined"
  | "failed"
  | "returned"
  | "cancelled"
  | "expired"
  | "frozen";

export type FinancePayout = {
  id: string;
  status: FinancePayoutStatus;
  provider: "outside" | "paypal";
  teacher_id: string | null;
  payee_name: string;
  payee_identifier: string | null;
  amount_gbp: number;
  currency: string;
  reason: string | null;
  period_key: string | null;
  category_id: string | null;
  ledger_entry_id: string | null;
  idempotency_key: string;
  provider_batch_id: string | null;
  provider_txn_id: string | null;
  provider_status: string | null;
  failure_reason: string | null;
  created_by: string | null;
  authorised_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancePayoutChallenge = {
  id: string;
  payout_id: string;
  code_hash: string;
  amount_gbp: number;
  payee_hash: string;
  expires_at: string;
  consumed_at: string | null;
  attempt_count: number;
  max_attempts: number;
  requested_by: string | null;
  email_verified_at: string | null;
  totp_verified_at: string | null;
  declined_at: string | null;
  created_at: string;
};

const PAYOUT_SELECT =
  "id, status, provider, teacher_id, payee_name, payee_identifier, amount_gbp, currency, reason, period_key, category_id, ledger_entry_id, idempotency_key, provider_batch_id, provider_txn_id, provider_status, failure_reason, created_by, authorised_at, paid_at, cancelled_at, created_at, updated_at";

function mapPayout(row: Record<string, unknown>): FinancePayout {
  return {
    id: row.id as string,
    status: row.status as FinancePayoutStatus,
    provider: row.provider as "outside" | "paypal",
    teacher_id: (row.teacher_id as string | null) ?? null,
    payee_name: row.payee_name as string,
    payee_identifier: (row.payee_identifier as string | null) ?? null,
    amount_gbp: Number(row.amount_gbp),
    currency: (row.currency as string) || "GBP",
    reason: (row.reason as string | null) ?? null,
    period_key: (row.period_key as string | null) ?? null,
    category_id: (row.category_id as string | null) ?? null,
    ledger_entry_id: (row.ledger_entry_id as string | null) ?? null,
    idempotency_key: row.idempotency_key as string,
    provider_batch_id: (row.provider_batch_id as string | null) ?? null,
    provider_txn_id: (row.provider_txn_id as string | null) ?? null,
    provider_status: (row.provider_status as string | null) ?? null,
    failure_reason: (row.failure_reason as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    authorised_at: (row.authorised_at as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function listFinancePayouts(options?: {
  limit?: number;
}): Promise<FinancePayout[]> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_payouts")
    .select(PAYOUT_SELECT)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (error) {
    console.error("[finance/payouts/list]", error.message);
    throw new Error("Payments could not be loaded.");
  }
  return (data ?? []).map((row) => mapPayout(row as Record<string, unknown>));
}

export async function getFinancePayout(
  id: string,
): Promise<FinancePayout | null> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_payouts")
    .select(PAYOUT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[finance/payouts/get]", error.message);
    throw new Error("Payment could not be loaded.");
  }
  return data ? mapPayout(data as Record<string, unknown>) : null;
}

export async function getLatestChallenge(
  payoutId: string,
): Promise<FinancePayoutChallenge | null> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_payout_challenges")
    .select(
      "id, payout_id, code_hash, amount_gbp, payee_hash, expires_at, consumed_at, attempt_count, max_attempts, requested_by, email_verified_at, totp_verified_at, declined_at, created_at",
    )
    .eq("payout_id", payoutId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[finance/payouts/challenge]", error.message);
    throw new Error("Authorisation could not be loaded.");
  }
  if (!data) return null;
  return {
    ...data,
    amount_gbp: Number(data.amount_gbp),
    attempt_count: Number(data.attempt_count),
    max_attempts: Number(data.max_attempts),
  } as FinancePayoutChallenge;
}

export async function findOpenPayoutForTeacherPeriod(
  teacherId: string,
  periodKey: string,
): Promise<FinancePayout | null> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_payouts")
    .select(PAYOUT_SELECT)
    .eq("teacher_id", teacherId)
    .eq("period_key", periodKey)
    .in("status", [
      "draft",
      "pending_authorisation",
      "authorised",
      "sending",
      "failed",
      "frozen",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[finance/payouts/open]", error.message);
    throw new Error("Payments could not be loaded.");
  }
  return data ? mapPayout(data as Record<string, unknown>) : null;
}
