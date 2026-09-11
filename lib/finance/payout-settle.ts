import { writeFinanceAudit } from "@/lib/finance/audit";
import { periodKeyFromIncurredOn } from "@/lib/finance/ledger";
import type { FinancePayout } from "@/lib/finance/payouts";
import { isPeriodLocked, periodLabelFromKey } from "@/lib/finance/periods-lock";
import { formatGbp } from "@/lib/finance/types";
import { portalBaseUrl } from "@/lib/email/config";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { teacherDisplayName } from "@/lib/teacher/types";

export type SettleResult = {
  ok: boolean;
  message: string;
  status?: string;
};

async function resolveTeacherPayCategoryId(
  service: ReturnType<typeof createServiceSupabaseClient>,
): Promise<string | null> {
  const { data } = await service
    .from("finance_categories")
    .select("id")
    .ilike("name", "Teacher pay")
    .is("retired_at", null)
    .maybeSingle();
  if (data?.id) return data.id as string;

  const { data: anyActive } = await service
    .from("finance_categories")
    .select("id")
    .is("retired_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (anyActive?.id as string | undefined) ?? null;
}

/** Record ledger + mark paid once provider (or outside) confirms settlement. */
export async function settlePayoutAsPaid(input: {
  payout: FinancePayout;
  actorId: string | null;
  provider: "outside" | "paypal";
  providerStatus: string;
  providerBatchId?: string | null;
  providerTxnId?: string | null;
  providerRaw?: unknown;
  auditAction: string;
  summary: string;
}): Promise<SettleResult> {
  const service = createServiceSupabaseClient();
  const payout = input.payout;

  if (payout.status === "paid" && payout.ledger_entry_id) {
    return { ok: true, message: "Already recorded as paid.", status: "paid" };
  }

  const incurredOn = payout.period_key
    ? `${payout.period_key}-01`
    : new Date().toISOString().slice(0, 10);
  const periodKey = payout.period_key ?? periodKeyFromIncurredOn(incurredOn);
  const now = new Date().toISOString();

  if (await isPeriodLocked(periodKey)) {
    await service
      .from("finance_payouts")
      .update({
        status: "authorised",
        authorised_at: payout.authorised_at ?? now,
        updated_at: now,
        failure_reason: "period_locked",
        provider: input.provider,
        provider_status: input.providerStatus,
        provider_batch_id: input.providerBatchId ?? payout.provider_batch_id,
        provider_txn_id: input.providerTxnId ?? null,
        provider_raw: input.providerRaw ?? null,
      })
      .eq("id", payout.id);

    return {
      ok: true,
      message: `${periodLabelFromKey(periodKey)} is locked. Authorisation was recorded; settle the books after unlock.`,
      status: "authorised",
    };
  }

  const categoryId =
    payout.category_id ?? (await resolveTeacherPayCategoryId(service));
  if (!categoryId) {
    return {
      ok: false,
      message: "Payments are temporarily unavailable. Please try again later.",
    };
  }

  let ledgerId = payout.ledger_entry_id;
  if (!ledgerId) {
    const { data: entry, error: entryError } = await service
      .from("finance_ledger_entries")
      .insert({
        direction: "out",
        category_id: categoryId,
        payee: payout.payee_name,
        amount_gbp: payout.amount_gbp,
        currency: payout.currency,
        incurred_on: incurredOn,
        settled_at: now,
        reason: payout.reason,
        status: "recorded",
        source: "portal_payout",
        created_by: input.actorId,
        period_key: periodKey,
      })
      .select("id")
      .single();

    if (entryError || !entry) {
      console.error("[finance/payouts/ledger]", entryError?.message);
      await service
        .from("finance_payouts")
        .update({
          status: "authorised",
          authorised_at: payout.authorised_at ?? now,
          updated_at: now,
          provider: input.provider,
          provider_status: input.providerStatus,
          provider_batch_id: input.providerBatchId ?? null,
          provider_raw: input.providerRaw ?? null,
        })
        .eq("id", payout.id);
      return {
        ok: false,
        message:
          "Payment was accepted, but the books could not be updated. Please try again.",
      };
    }
    ledgerId = entry.id as string;
  }

  const { error: paidError } = await service
    .from("finance_payouts")
    .update({
      status: "paid",
      authorised_at: payout.authorised_at ?? now,
      paid_at: now,
      ledger_entry_id: ledgerId,
      provider: input.provider,
      provider_status: input.providerStatus,
      provider_batch_id: input.providerBatchId ?? null,
      provider_txn_id: input.providerTxnId ?? null,
      provider_raw: input.providerRaw ?? null,
      failure_reason: null,
      updated_at: now,
    })
    .eq("id", payout.id)
    .in("status", [
      "pending_authorisation",
      "authorised",
      "sending",
      "failed",
    ]);

  if (paidError) {
    console.error("[finance/payouts/paid]", paidError.message);
    return {
      ok: false,
      message: "Could not finalise this payment. Please try again.",
    };
  }

  if (payout.teacher_id && payout.period_key) {
    await service.from("teacher_pay_period_marks").upsert(
      {
        period_key: payout.period_key,
        teacher_id: payout.teacher_id,
        marked_paid_at: now,
        marked_by: input.actorId,
        notes:
          input.provider === "paypal"
            ? "Settled via PayPal payout."
            : "Settled via authorised portal payment (outside provider).",
      },
      { onConflict: "period_key,teacher_id" },
    );
  }

  await writeFinanceAudit({
    actorId: input.actorId,
    action: input.auditAction,
    entityType: "finance_payout",
    entityId: payout.id,
    summary: input.summary,
    before: { status: payout.status },
    after: {
      status: "paid",
      ledger_entry_id: ledgerId,
      provider: input.provider,
      provider_status: input.providerStatus,
    },
  });

  // Spec Q25: notify on provider-confirmed paid only (never on authorised).
  if (payout.status !== "paid") {
    void notifyTeacherPayoutPaid({
      ...payout,
      status: "paid",
      paid_at: now,
      provider: input.provider,
    }).catch((error) => {
      console.error("[finance/payouts/paid-mail]", error);
    });
  }

  return {
    ok: true,
    message:
      input.provider === "paypal"
        ? "Payment sent via PayPal and recorded."
        : "Payment released and recorded as paid outside the portal.",
    status: "paid",
  };
}

async function notifyTeacherPayoutPaid(payout: FinancePayout) {
  if (!payout.teacher_id) return;
  const service = createServiceSupabaseClient();
  const { data: teacher } = await service
    .from("teacher_profiles")
    .select("id, email, full_name")
    .eq("id", payout.teacher_id)
    .maybeSingle();
  if (!teacher?.email) return;

  const periodLabel = payout.period_key
    ? periodLabelFromKey(payout.period_key)
    : "Teacher pay";
  const paidAt = payout.paid_at ?? new Date().toISOString();
  const { sendTeacherPayoutPaidEmail } = await import("@/lib/email/backend");
  const mail = await sendTeacherPayoutPaidEmail({
    to: teacher.email as string,
    teacherName: teacherDisplayName({
      email: teacher.email as string,
      full_name: (teacher.full_name as string | null) ?? null,
    }),
    amountLabel: formatGbp(payout.amount_gbp),
    periodLabel,
    methodLabel: payout.provider === "paypal" ? "PayPal" : "Bank / outside",
    paidAtLabel: new Date(paidAt).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }),
    reason: payout.reason ?? "Teacher pay",
    portalPaymentsUrl: `${portalBaseUrl()}/teacher/payments`,
    siteUrl: portalBaseUrl(),
  });
  if (!mail.ok) {
    console.error("[finance/payouts/paid-mail]", mail.message);
  }
}

export function mapPaypalItemStatusToPayout(status: string | null): {
  terminal: boolean;
  payoutStatus: "paid" | "failed" | "returned" | "sending";
  providerStatus: string;
} {
  const s = (status ?? "").toUpperCase();
  if (s === "SUCCESS") {
    return { terminal: true, payoutStatus: "paid", providerStatus: s };
  }
  if (s === "FAILED" || s === "BLOCKED" || s === "DENIED") {
    return { terminal: true, payoutStatus: "failed", providerStatus: s };
  }
  if (s === "RETURNED" || s === "REFUNDED") {
    return { terminal: true, payoutStatus: "returned", providerStatus: s };
  }
  if (s === "UNCLAIMED") {
    return { terminal: false, payoutStatus: "sending", providerStatus: s };
  }
  return {
    terminal: false,
    payoutStatus: "sending",
    providerStatus: s || "PENDING",
  };
}
