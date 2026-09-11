"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  FINANCE_AUTH_REREQUEST_COOLDOWN_MS,
  FINANCE_AUTH_REQUESTS_PER_USER_PER_HOUR,
  FINANCE_EMAIL_CODE_MAX_ATTEMPTS,
  FINANCE_EMAIL_CODE_TTL_MS,
  financeApproverEmail,
  financeApproverTotpSecret,
  isFinancePayoutRailConfigured,
} from "@/lib/finance/approver-config";
import {
  FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE,
} from "@/lib/finance/payout-constants";
import { writeFinanceAudit } from "@/lib/finance/audit";
import { requireSessionFinance } from "@/lib/finance/auth";
import {
  generatePayoutEmailCode,
  hashPayeeBinding,
  hashPayoutEmailCode,
  verifyPayoutEmailCode,
} from "@/lib/finance/otp";
import {
  createPayoutDeclineToken,
  payoutDeclineUrl,
} from "@/lib/finance/payout-decline";
import {
  findOpenPayoutForTeacherPeriod,
  getFinancePayout,
  getLatestChallenge,
  listFinancePayouts,
  type FinancePayout,
} from "@/lib/finance/payouts";
import { periodLabelFromKey } from "@/lib/finance/periods-lock";
import { verifyTotp } from "@/lib/finance/totp";
import { financeDisplayName, formatGbp } from "@/lib/finance/types";
import { portalBaseUrl } from "@/lib/email/config";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { teacherDisplayName } from "@/lib/teacher/types";

export type FinancePayoutActionResult = {
  ok: boolean;
  message: string;
  payoutId?: string;
};

export type FinancePayoutDeskPayload = {
  railConfigured: boolean;
  paypalConfigured: boolean;
  paypalEnv: "sandbox" | "live";
  payouts: FinancePayout[];
  challengesByPayoutId: Record<
    string,
    {
      id: string;
      expiresAt: string;
      attemptCount: number;
      maxAttempts: number;
      consumed: boolean;
      declined: boolean;
    }
  >;
};

function revalidatePayoutPaths() {
  revalidatePath("/finance/payments");
  revalidatePath("/finance/books");
  revalidatePath("/finance");
  revalidatePath("/teacher/payments");
}

async function countRecentAuthRequests(actorId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const service = createServiceSupabaseClient();
  const { count, error } = await service
    .from("finance_payout_challenges")
    .select("id", { count: "exact", head: true })
    .eq("requested_by", actorId)
    .gte("created_at", since);
  if (error) {
    console.error("[finance/payouts/rate]", error.message);
    return FINANCE_AUTH_REQUESTS_PER_USER_PER_HOUR;
  }
  return count ?? 0;
}

export async function loadFinancePayoutsDesk(): Promise<FinancePayoutDeskPayload> {
  await requireSessionFinance();
  const railConfigured = isFinancePayoutRailConfigured();
  const { isPaypalPayoutsConfigured, paypalEnv } = await import(
    "@/lib/paypal/config"
  );
  const payouts = await listFinancePayouts({ limit: 120 });
  const challengesByPayoutId: FinancePayoutDeskPayload["challengesByPayoutId"] =
    {};

  await Promise.all(
    payouts
      .filter((p) =>
        ["pending_authorisation", "frozen", "draft"].includes(p.status),
      )
      .slice(0, 40)
      .map(async (payout) => {
        const challenge = await getLatestChallenge(payout.id);
        if (!challenge) return;
        challengesByPayoutId[payout.id] = {
          id: challenge.id,
          expiresAt: challenge.expires_at,
          attemptCount: challenge.attempt_count,
          maxAttempts: challenge.max_attempts,
          consumed: Boolean(challenge.consumed_at),
          declined: Boolean(challenge.declined_at),
        };
      }),
  );

  return {
    railConfigured,
    paypalConfigured: isPaypalPayoutsConfigured(),
    paypalEnv: paypalEnv(),
    payouts,
    challengesByPayoutId,
  };
}

export async function prepareTeacherPeriodPayout(
  formData: FormData,
): Promise<FinancePayoutActionResult> {
  try {
    const finance = await requireSessionFinance();
    if (!isFinancePayoutRailConfigured()) {
      return { ok: false, message: FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE };
    }

    const periodKey = String(formData.get("periodKey") ?? "").trim();
    const teacherId = String(formData.get("teacherId") ?? "").trim();
    const amountRaw = String(formData.get("amountGbp") ?? "").trim();
    const amount = Number(amountRaw);

    if (!/^\d{4}-\d{2}$/.test(periodKey)) {
      return { ok: false, message: "Choose a valid pay period." };
    }
    if (!teacherId) {
      return { ok: false, message: "Teacher not found." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Amount must be greater than zero." };
    }

    const existing = await findOpenPayoutForTeacherPeriod(teacherId, periodKey);
    if (existing) {
      return {
        ok: true,
        message: "A payment for this teacher is already open.",
        payoutId: existing.id,
      };
    }

    const service = createServiceSupabaseClient();
    const { data: teacher, error: teacherError } = await service
      .from("teacher_profiles")
      .select("id, email, full_name, is_active")
      .eq("id", teacherId)
      .maybeSingle();

    if (teacherError || !teacher) {
      return { ok: false, message: "Teacher not found." };
    }
    if (!teacher.is_active) {
      return {
        ok: false,
        message: "This teacher is inactive and cannot be paid from the desk.",
      };
    }

    const { getTeacherPaymentDetailsPublic, getTeacherPaypalEmailForPayout } =
      await import("@/lib/teacher/payment-details");
    const payment = await getTeacherPaymentDetailsPublic(teacherId);
    if (!payment) {
      return {
        ok: false,
        message:
          "This teacher has not added payment details yet. Ask them to update their account before preparing a payment.",
      };
    }

    let payeeIdentifier: string | null = null;
    if (payment.preferredMethod === "paypal") {
      try {
        payeeIdentifier = await getTeacherPaypalEmailForPayout(teacherId);
      } catch (error) {
        console.error("[finance/payouts/paypal-id]", error);
        return {
          ok: false,
          message: "Payments are temporarily unavailable. Please try again later.",
        };
      }
    } else {
      payeeIdentifier = payment.bankAccountLast4
        ? `bank:••••${payment.bankAccountLast4}`
        : "bank";
    }

    const payeeName = teacherDisplayName(
      teacher as { full_name: string | null; email: string },
    );
    const reason = `Teacher pay · ${periodLabelFromKey(periodKey)}`;
    const idempotencyKey = `teacher-period:${periodKey}:${teacherId}:${randomUUID()}`;

    const { data: payout, error } = await service
      .from("finance_payouts")
      .insert({
        status: "draft",
        provider:
          payment.preferredMethod === "paypal" ? "paypal" : "outside",
        teacher_id: teacherId,
        payee_name: payeeName,
        payee_identifier: payeeIdentifier,
        amount_gbp: amount,
        currency: "GBP",
        reason,
        period_key: periodKey,
        idempotency_key: idempotencyKey,
        created_by: finance.id,
      })
      .select("id")
      .single();

    if (error || !payout) {
      console.error("[finance/payouts/prepare]", error?.message);
      return {
        ok: false,
        message: "Could not prepare this payment. Please try again.",
      };
    }

    await writeFinanceAudit({
      actorId: finance.id,
      action: "payout_draft",
      entityType: "finance_payout",
      entityId: payout.id as string,
      summary: `Draft payment ${payeeName} ${amount.toFixed(2)}`,
      after: {
        status: "draft",
        amount_gbp: amount,
        period_key: periodKey,
        teacher_id: teacherId,
      },
    });

    revalidatePayoutPaths();
    return {
      ok: true,
      message: "Payment drafted. Request authorisation when ready.",
      payoutId: payout.id as string,
    };
  } catch (error) {
    console.error("[finance/payouts/prepare]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not prepare this payment."),
    };
  }
}

/** Ad-hoc payout: finance enters payee + method (PayPal or outside). */
export async function prepareCustomPayout(
  formData: FormData,
): Promise<FinancePayoutActionResult> {
  try {
    const finance = await requireSessionFinance();
    if (!isFinancePayoutRailConfigured()) {
      return { ok: false, message: FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE };
    }

    const payeeName = String(formData.get("payeeName") ?? "").trim();
    const providerRaw = String(formData.get("provider") ?? "")
      .trim()
      .toLowerCase();
    const paypalEmail = String(formData.get("paypalEmail") ?? "")
      .trim()
      .toLowerCase();
    const amountRaw = String(formData.get("amountGbp") ?? "").trim();
    const amount = Number(amountRaw);
    const reason = String(formData.get("reason") ?? "").trim();
    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const teacherId = String(formData.get("teacherId") ?? "").trim() || null;
    const periodKey = String(formData.get("periodKey") ?? "").trim() || null;

    if (payeeName.length < 1 || payeeName.length > 200) {
      return { ok: false, message: "Enter a payee name." };
    }
    if (providerRaw !== "paypal" && providerRaw !== "outside") {
      return { ok: false, message: "Choose PayPal or bank / outside." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Amount must be greater than zero." };
    }
    if (!categoryId) {
      return { ok: false, message: "Choose a category." };
    }
    if (!reason || reason.length > 2000) {
      return { ok: false, message: "Enter a short reason for this payment." };
    }
    if (providerRaw === "paypal") {
      if (!paypalEmail.includes("@") || paypalEmail.length > 254) {
        return { ok: false, message: "Enter a valid PayPal email." };
      }
    }
    if ((teacherId && !periodKey) || (!teacherId && periodKey)) {
      return {
        ok: false,
        message: "To mark a teacher paid, choose both the teacher and the pay period.",
      };
    }
    if (periodKey && !/^\d{4}-\d{2}$/.test(periodKey)) {
      return { ok: false, message: "Choose a valid pay period." };
    }

    const service = createServiceSupabaseClient();
    const { data: category, error: catError } = await service
      .from("finance_categories")
      .select("id")
      .eq("id", categoryId)
      .is("retired_at", null)
      .maybeSingle();
    if (catError || !category) {
      return { ok: false, message: "Choose a valid category." };
    }

    let resolvedPayeeName = payeeName;
    if (teacherId) {
      const { data: teacher, error: teacherError } = await service
        .from("teacher_profiles")
        .select("id, email, full_name, is_active")
        .eq("id", teacherId)
        .maybeSingle();
      if (teacherError || !teacher) {
        return { ok: false, message: "Teacher not found." };
      }
      if (!teacher.is_active) {
        return {
          ok: false,
          message: "This teacher is inactive and cannot be linked.",
        };
      }
      if (!payeeName) {
        resolvedPayeeName = teacherDisplayName(
          teacher as { full_name: string | null; email: string },
        );
      }
    }

    const provider = providerRaw as "paypal" | "outside";
    const payeeIdentifier =
      provider === "paypal" ? paypalEmail : "outside:manual";
    const idempotencyKey = `custom:${finance.id}:${randomUUID()}`;

    const { data: payout, error } = await service
      .from("finance_payouts")
      .insert({
        status: "draft",
        provider,
        teacher_id: teacherId,
        payee_name: resolvedPayeeName,
        payee_identifier: payeeIdentifier,
        amount_gbp: amount,
        currency: "GBP",
        reason,
        period_key: periodKey,
        category_id: categoryId,
        idempotency_key: idempotencyKey,
        created_by: finance.id,
      })
      .select("id")
      .single();

    if (error || !payout) {
      console.error("[finance/payouts/prepare-custom]", error?.message);
      return {
        ok: false,
        message: "Could not prepare this payment. Please try again.",
      };
    }

    await writeFinanceAudit({
      actorId: finance.id,
      action: "payout_draft_custom",
      entityType: "finance_payout",
      entityId: payout.id as string,
      summary: `Draft custom payment ${resolvedPayeeName} ${amount.toFixed(2)}`,
      after: {
        status: "draft",
        amount_gbp: amount,
        provider,
        teacher_id: teacherId,
        period_key: periodKey,
        category_id: categoryId,
      },
    });

    revalidatePayoutPaths();
    return {
      ok: true,
      message: "Payment drafted. Request authorisation when ready.",
      payoutId: payout.id as string,
    };
  } catch (error) {
    console.error("[finance/payouts/prepare-custom]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not prepare this payment."),
    };
  }
}

export async function requestPayoutAuthorisation(
  formData: FormData,
): Promise<FinancePayoutActionResult> {
  try {
    const finance = await requireSessionFinance();
    if (!isFinancePayoutRailConfigured()) {
      return { ok: false, message: FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE };
    }

    const payoutId = String(formData.get("payoutId") ?? "").trim();
    if (!payoutId) return { ok: false, message: "Payment not found." };

    const payout = await getFinancePayout(payoutId);
    if (!payout) return { ok: false, message: "Payment not found." };

    if (
      !["draft", "frozen", "pending_authorisation", "expired"].includes(
        payout.status,
      )
    ) {
      return {
        ok: false,
        message: "Authorisation cannot be requested for this payment.",
      };
    }

    const recent = await countRecentAuthRequests(finance.id);
    if (recent >= FINANCE_AUTH_REQUESTS_PER_USER_PER_HOUR) {
      return {
        ok: false,
        message: "Too many authorisation requests. Please wait and try again.",
      };
    }

    const latest = await getLatestChallenge(payoutId);
    if (latest && !latest.consumed_at && !latest.declined_at) {
      const age = Date.now() - new Date(latest.created_at).getTime();
      if (age < FINANCE_AUTH_REREQUEST_COOLDOWN_MS) {
        return {
          ok: false,
          message: "Authorisation was just requested. Please wait a moment.",
        };
      }
    }

    const approver = financeApproverEmail();
    if (!approver) {
      return { ok: false, message: FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE };
    }

    const emailCode = generatePayoutEmailCode();
    const expiresAt = new Date(Date.now() + FINANCE_EMAIL_CODE_TTL_MS);
    const service = createServiceSupabaseClient();

    const { data: challenge, error: challengeError } = await service
      .from("finance_payout_challenges")
      .insert({
        payout_id: payoutId,
        code_hash: hashPayoutEmailCode(payoutId, emailCode),
        amount_gbp: payout.amount_gbp,
        payee_hash: hashPayeeBinding(payout.payee_name),
        expires_at: expiresAt.toISOString(),
        attempt_count: 0,
        max_attempts: FINANCE_EMAIL_CODE_MAX_ATTEMPTS,
        requested_by: finance.id,
      })
      .select("id")
      .single();

    if (challengeError || !challenge) {
      console.error("[finance/payouts/challenge]", challengeError?.message);
      return {
        ok: false,
        message: "Could not start authorisation. Please try again.",
      };
    }

    const now = new Date().toISOString();
    const { error: statusError } = await service
      .from("finance_payouts")
      .update({
        status: "pending_authorisation",
        failure_reason: null,
        updated_at: now,
      })
      .eq("id", payoutId);

    if (statusError) {
      console.error("[finance/payouts/request-status]", statusError.message);
      return {
        ok: false,
        message: "Could not start authorisation. Please try again.",
      };
    }

    const declineToken = createPayoutDeclineToken({
      payoutId,
      challengeId: challenge.id as string,
      expiresAtMs: expiresAt.getTime(),
    });

    const {
      sendFinancePayoutAuthorisationEmail,
    } = await import("@/lib/email/backend");

    const mail = await sendFinancePayoutAuthorisationEmail({
      to: approver,
      payeeName: payout.payee_name,
      amountLabel: formatGbp(payout.amount_gbp),
      reason: payout.reason ?? "Teacher pay",
      requesterName: financeDisplayName(finance),
      requestedAtLabel: new Date().toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
      emailCode,
      declineUrl: payoutDeclineUrl(declineToken),
      siteUrl: portalBaseUrl(),
    });

    if (!mail.ok) {
      console.error("[finance/payouts/auth-mail]", mail.message);
      await service
        .from("finance_payouts")
        .update({
          status: "draft",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payoutId);
      return {
        ok: false,
        message:
          "Authorisation email could not be sent. The payment stays as a draft — try again shortly.",
      };
    }

    await writeFinanceAudit({
      actorId: finance.id,
      action: "payout_request_authorisation",
      entityType: "finance_payout",
      entityId: payoutId,
      summary: `Requested authorisation for ${payout.payee_name}`,
      before: { status: payout.status },
      after: { status: "pending_authorisation", challenge_id: challenge.id },
    });

    revalidatePayoutPaths();
    return {
      ok: true,
      message:
        "Authorisation requested — waiting for the code. Ask the authoriser for the code.",
      payoutId,
    };
  } catch (error) {
    console.error("[finance/payouts/request]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not request authorisation. Please try again.",
      ),
    };
  }
}

export async function releasePayout(
  formData: FormData,
): Promise<FinancePayoutActionResult> {
  try {
    const finance = await requireSessionFinance();
    if (!isFinancePayoutRailConfigured()) {
      return { ok: false, message: FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE };
    }

    const payoutId = String(formData.get("payoutId") ?? "").trim();
    const emailCode = String(formData.get("emailCode") ?? "").trim();
    const totpCode = String(formData.get("totpCode") ?? "").trim();

    if (!payoutId) return { ok: false, message: "Payment not found." };

    const payout = await getFinancePayout(payoutId);
    if (!payout) return { ok: false, message: "Payment not found." };
    if (payout.status !== "pending_authorisation") {
      return {
        ok: false,
        message: "This payment is not waiting for authorisation.",
      };
    }

    const challenge = await getLatestChallenge(payoutId);
    if (!challenge || challenge.consumed_at || challenge.declined_at) {
      return {
        ok: false,
        message: "Request authorisation again before releasing.",
      };
    }
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      const service = createServiceSupabaseClient();
      await service
        .from("finance_payouts")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payoutId);
      return {
        ok: false,
        message: "The emailed code has expired. Request authorisation again.",
      };
    }

    if (
      Number(challenge.amount_gbp) !== payout.amount_gbp ||
      challenge.payee_hash !== hashPayeeBinding(payout.payee_name)
    ) {
      const service = createServiceSupabaseClient();
      await service
        .from("finance_payouts")
        .update({
          status: "draft",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payoutId);
      return {
        ok: false,
        message:
          "This payment changed after authorisation was requested. Request a new code.",
      };
    }

    const totpSecret = financeApproverTotpSecret();
    if (!totpSecret) {
      return { ok: false, message: FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE };
    }

    const emailOk = verifyPayoutEmailCode(
      payoutId,
      emailCode,
      challenge.code_hash,
    );
    const totpStep = verifyTotp(totpSecret, totpCode);
    const bothOk = emailOk && totpStep !== null;

    const service = createServiceSupabaseClient();

    if (!bothOk) {
      const nextAttempts = challenge.attempt_count + 1;
      await service
        .from("finance_payout_challenges")
        .update({ attempt_count: nextAttempts })
        .eq("id", challenge.id);

      if (nextAttempts >= challenge.max_attempts) {
        await service
          .from("finance_payouts")
          .update({
            status: "frozen",
            updated_at: new Date().toISOString(),
          })
          .eq("id", payoutId);

        const approver = financeApproverEmail();
        if (approver) {
          const {
            sendFinancePayoutFreezeNoticeEmail,
          } = await import("@/lib/email/backend");
          await sendFinancePayoutFreezeNoticeEmail({
            to: approver,
            payeeName: payout.payee_name,
            amountLabel: formatGbp(payout.amount_gbp),
            siteUrl: portalBaseUrl(),
          }).catch((error) => {
            console.error("[finance/payouts/freeze-mail]", error);
          });
        }

        if (finance.email) {
          const {
            sendFinancePayoutFreezeNoticeEmail,
          } = await import("@/lib/email/backend");
          await sendFinancePayoutFreezeNoticeEmail({
            to: finance.email,
            payeeName: payout.payee_name,
            amountLabel: formatGbp(payout.amount_gbp),
            siteUrl: portalBaseUrl(),
          }).catch((error) => {
            console.error("[finance/payouts/freeze-mail-finance]", error);
          });
        }

        await writeFinanceAudit({
          actorId: finance.id,
          action: "payout_frozen",
          entityType: "finance_payout",
          entityId: payoutId,
          summary: `Frozen after failed codes · ${payout.payee_name}`,
          after: { status: "frozen", attempts: nextAttempts },
        });

        revalidatePayoutPaths();
        return {
          ok: false,
          message:
            "Too many incorrect codes. This payment is frozen. Request authorisation again to continue.",
        };
      }

      await writeFinanceAudit({
        actorId: finance.id,
        action: "payout_release_failed",
        entityType: "finance_payout",
        entityId: payoutId,
        summary: "Incorrect authorisation codes",
        after: { attempts: nextAttempts },
      });

      return {
        ok: false,
        message: "Those codes could not be verified. Please try again.",
      };
    }

    if (totpStep === null) {
      return {
        ok: false,
        message: "Those codes could not be verified. Please try again.",
      };
    }

    const { error: stepError } = await service
      .from("finance_totp_consumed_steps")
      .insert({
        step: totpStep,
        payout_id: payoutId,
      });

    if (stepError) {
      if (/duplicate|unique/i.test(stepError.message)) {
        return {
          ok: false,
          message: "Those codes could not be verified. Please try again.",
        };
      }
      console.error("[finance/payouts/totp-step]", stepError.message);
      return {
        ok: false,
        message: "Could not release this payment. Please try again.",
      };
    }

    const verifiedAt = new Date().toISOString();
    await service
      .from("finance_payout_challenges")
      .update({
        consumed_at: verifiedAt,
        email_verified_at: verifiedAt,
        totp_verified_at: verifiedAt,
      })
      .eq("id", challenge.id);

    await service
      .from("finance_payouts")
      .update({
        status: "authorised",
        authorised_at: verifiedAt,
        updated_at: verifiedAt,
      })
      .eq("id", payoutId)
      .eq("status", "pending_authorisation");

    const authorised = await getFinancePayout(payoutId);
    if (!authorised) {
      return { ok: false, message: "Payment not found." };
    }

    // PayPal rail (Phase 4 sandbox) when the draft is a PayPal payout.
    if (authorised.provider === "paypal") {
      const { dispatchPaypalPayout } = await import(
        "@/lib/finance/payout-paypal"
      );
      const sent = await dispatchPaypalPayout({
        payout: authorised,
        actorId: finance.id,
      });
      revalidatePayoutPaths();
      return { ...sent, payoutId };
    }

    // Bank / outside settlement (no provider send).
    const { settlePayoutAsPaid } = await import(
      "@/lib/finance/payout-settle"
    );
    const settled = await settlePayoutAsPaid({
      payout: authorised,
      actorId: finance.id,
      provider: "outside",
      providerStatus: "outside",
      auditAction: "payout_paid_outside",
      summary: `Released ${authorised.payee_name} ${authorised.amount_gbp.toFixed(2)} (outside)`,
    });
    revalidatePayoutPaths();
    return { ...settled, payoutId };
  } catch (error) {
    console.error("[finance/payouts/release]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not release this payment. Please try again.",
      ),
    };
  }
}

/** Re-run PayPal send for authorised / failed payouts under the same idempotency key. */
export async function retryPaypalPayoutSend(
  formData: FormData,
): Promise<FinancePayoutActionResult> {
  try {
    const finance = await requireSessionFinance();
    const payoutId = String(formData.get("payoutId") ?? "").trim();
    if (!payoutId) return { ok: false, message: "Payment not found." };

    const payout = await getFinancePayout(payoutId);
    if (!payout) return { ok: false, message: "Payment not found." };
    if (payout.provider !== "paypal") {
      return { ok: false, message: "This payment is not a PayPal payout." };
    }
    if (!["authorised", "failed"].includes(payout.status)) {
      return {
        ok: false,
        message: "Only authorised or failed PayPal payments can be retried.",
      };
    }

    const { dispatchPaypalPayout } = await import(
      "@/lib/finance/payout-paypal"
    );
    const result = await dispatchPaypalPayout({
      payout,
      actorId: finance.id,
    });
    revalidatePayoutPaths();
    return { ...result, payoutId };
  } catch (error) {
    console.error("[finance/payouts/retry]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not retry this payment. Please try again.",
      ),
    };
  }
}

export async function refreshPaypalPayout(
  formData: FormData,
): Promise<FinancePayoutActionResult> {
  try {
    const finance = await requireSessionFinance();
    const payoutId = String(formData.get("payoutId") ?? "").trim();
    if (!payoutId) return { ok: false, message: "Payment not found." };

    const payout = await getFinancePayout(payoutId);
    if (!payout) return { ok: false, message: "Payment not found." };
    if (payout.provider !== "paypal") {
      return { ok: false, message: "This payment is not a PayPal payout." };
    }

    const { refreshPaypalPayoutStatus } = await import(
      "@/lib/finance/payout-paypal"
    );
    const result = await refreshPaypalPayoutStatus({
      payout,
      actorId: finance.id,
    });
    revalidatePayoutPaths();
    return { ...result, payoutId };
  } catch (error) {
    console.error("[finance/payouts/refresh]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not refresh this payment. Please try again.",
      ),
    };
  }
}

export async function cancelPayout(
  formData: FormData,
): Promise<FinancePayoutActionResult> {
  try {
    const finance = await requireSessionFinance();
    const payoutId = String(formData.get("payoutId") ?? "").trim();
    if (!payoutId) return { ok: false, message: "Payment not found." };

    const payout = await getFinancePayout(payoutId);
    if (!payout) return { ok: false, message: "Payment not found." };

    if (
      !["draft", "pending_authorisation", "frozen", "expired"].includes(
        payout.status,
      )
    ) {
      return {
        ok: false,
        message: "This payment can no longer be cancelled.",
      };
    }

    const now = new Date().toISOString();
    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("finance_payouts")
      .update({
        status: "cancelled",
        cancelled_at: now,
        updated_at: now,
      })
      .eq("id", payoutId);

    if (error) {
      console.error("[finance/payouts/cancel]", error.message);
      return {
        ok: false,
        message: "Could not cancel this payment. Please try again.",
      };
    }

    await writeFinanceAudit({
      actorId: finance.id,
      action: "payout_cancel",
      entityType: "finance_payout",
      entityId: payoutId,
      summary: `Cancelled ${payout.payee_name}`,
      before: { status: payout.status },
      after: { status: "cancelled" },
    });

    revalidatePayoutPaths();
    return {
      ok: true,
      message: "Payment cancelled. Request authorisation again if needed.",
      payoutId,
    };
  } catch (error) {
    console.error("[finance/payouts/cancel]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not cancel this payment."),
    };
  }
}

/** Public decline path — no finance session. */
export async function declinePayoutFromToken(
  token: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { verifyPayoutDeclineToken } = await import(
      "@/lib/finance/payout-decline"
    );
    const verified = verifyPayoutDeclineToken(token);
    if (!verified.ok) {
      return { ok: false, message: verified.message };
    }

    const service = createServiceSupabaseClient();
    const { data: challenge, error: challengeError } = await service
      .from("finance_payout_challenges")
      .select(
        "id, payout_id, consumed_at, declined_at, expires_at",
      )
      .eq("id", verified.challengeId)
      .eq("payout_id", verified.payoutId)
      .maybeSingle();

    if (challengeError || !challenge) {
      return { ok: false, message: "This link is no longer valid." };
    }
    if (challenge.declined_at) {
      return { ok: true, message: "This payment was already declined." };
    }
    if (challenge.consumed_at) {
      return {
        ok: false,
        message: "This payment was already released and cannot be declined.",
      };
    }

    const now = new Date().toISOString();
    await service
      .from("finance_payout_challenges")
      .update({ declined_at: now })
      .eq("id", challenge.id);

    const { data: payout } = await service
      .from("finance_payouts")
      .select("id, status, payee_name")
      .eq("id", verified.payoutId)
      .maybeSingle();

    if (
      payout &&
      ["pending_authorisation", "draft", "frozen"].includes(
        payout.status as string,
      )
    ) {
      await service
        .from("finance_payouts")
        .update({
          status: "declined",
          updated_at: now,
        })
        .eq("id", verified.payoutId);
    }

    await writeFinanceAudit({
      actorId: null,
      action: "payout_declined",
      entityType: "finance_payout",
      entityId: verified.payoutId,
      summary: `Declined via email link${payout?.payee_name ? ` · ${payout.payee_name}` : ""}`,
      after: { status: "declined" },
    });

    revalidatePayoutPaths();
    return {
      ok: true,
      message: "Payment declined. No money was sent.",
    };
  } catch (error) {
    console.error("[finance/payouts/decline]", error);
    return {
      ok: false,
      message: "This link could not be used. Please try again later.",
    };
  }
}
