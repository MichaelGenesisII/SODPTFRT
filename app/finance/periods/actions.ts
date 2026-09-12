"use server";

import { revalidatePath } from "next/cache";
import { requireSessionFinance } from "@/lib/finance/auth";
import {
  buildPayPeriodReport,
  payPeriodCsv,
  resolvePeriodInput,
} from "@/lib/finance/pay";
import {
  listFinanceTeacherPaymentSummaries,
  methodLabel,
} from "@/lib/teacher/payment-details";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinancePeriodActionResult = {
  ok: boolean;
  message: string;
  csv?: string;
  filename?: string;
};

export async function getPayPeriodReport(periodKey?: string | null) {
  await requireSessionFinance();
  const period = resolvePeriodInput(periodKey);
  const report = await buildPayPeriodReport({
    year: period.year,
    month: period.month,
  });
  try {
    const summaries = await listFinanceTeacherPaymentSummaries(
      report.teachers.map((t) => t.teacherId),
    );
    for (const teacher of report.teachers) {
      const summary = summaries.get(teacher.teacherId);
      teacher.hasPaymentDetails = Boolean(summary?.hasDetails);
      teacher.paymentMethodLabel = summary?.preferredMethod
        ? methodLabel(summary.preferredMethod)
        : null;
      teacher.paymentPayeeMask = summary?.payeeMask ?? null;
      teacher.paymentRecentlyChanged = Boolean(summary?.recentlyChanged);
    }
  } catch (error) {
    console.error("[finance/periods/payment-details]", error);
  }
  return report;
}

export async function exportPayPeriodCsv(
  periodKey: string,
): Promise<FinancePeriodActionResult> {
  try {
    await requireSessionFinance();
    const period = resolvePeriodInput(periodKey);
    const report = await buildPayPeriodReport({
      year: period.year,
      month: period.month,
    });
    const csv = payPeriodCsv(report);
    return {
      ok: true,
      message: "Export ready.",
      csv,
      filename: `teacher-pay-${report.periodKey}.csv`,
    };
  } catch (error) {
    console.error("[finance/periods/export]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not export this period. Please try again.",
      ),
    };
  }
}

export async function markTeacherPaid(
  formData: FormData,
): Promise<FinancePeriodActionResult> {
  try {
    const finance = await requireSessionFinance();
    const periodKey = String(formData.get("periodKey") ?? "").trim();
    const teacherId = String(formData.get("teacherId") ?? "").trim();
    const amountRaw = String(formData.get("amountGbp") ?? "").trim();
    const amount = Number(amountRaw);
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (!periodKey || !teacherId) {
      return { ok: false, message: "Missing period or teacher." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Amount must be greater than zero." };
    }

    const service = createServiceSupabaseClient();
    const { data: existingMark } = await service
      .from("teacher_pay_period_marks")
      .select("teacher_id, marked_paid_at")
      .eq("period_key", periodKey)
      .eq("teacher_id", teacherId)
      .maybeSingle();
    const alreadyMarked = Boolean(existingMark?.marked_paid_at);

    const { data: teacher } = await service
      .from("teacher_profiles")
      .select("id, email, full_name")
      .eq("id", teacherId)
      .maybeSingle();
    if (!teacher) {
      return { ok: false, message: "Teacher not found." };
    }

    const now = new Date().toISOString();
    const { error } = await service.from("teacher_pay_period_marks").upsert(
      {
        period_key: periodKey,
        teacher_id: teacherId,
        marked_paid_at: now,
        marked_by: finance.id,
        notes,
      },
      { onConflict: "period_key,teacher_id" },
    );

    if (error) {
      console.error("[finance/periods/mark]", error.message);
      return {
        ok: false,
        message: "Could not mark as paid. Please try again.",
      };
    }

    // First-time mark: auto-log to Books (same spine as authorised payouts).
    if (!alreadyMarked) {
      const { data: category } = await service
        .from("finance_categories")
        .select("id")
        .ilike("name", "Teacher pay")
        .is("retired_at", null)
        .maybeSingle();
      let categoryId = (category?.id as string | undefined) ?? null;
      if (!categoryId) {
        const { data: anyActive } = await service
          .from("finance_categories")
          .select("id")
          .is("retired_at", null)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        categoryId = (anyActive?.id as string | undefined) ?? null;
      }
      if (!categoryId) {
        return {
          ok: false,
          message: "Could not record this on the books. Please try again later.",
        };
      }

      const { teacherDisplayName } = await import("@/lib/teacher/types");
      const { periodLabelFromKey } = await import("@/lib/finance/periods-lock");
      const payee = teacherDisplayName({
        email: teacher.email as string,
        full_name: (teacher.full_name as string | null) ?? null,
      });
      const { error: ledgerError } = await service
        .from("finance_ledger_entries")
        .insert({
          direction: "out",
          category_id: categoryId,
          payee,
          amount_gbp: amount,
          currency: "GBP",
          incurred_on: `${periodKey}-01`,
          settled_at: now,
          reason: `Teacher pay · ${periodLabelFromKey(periodKey)} (marked paid)`,
          status: "recorded",
          source: "portal_payout",
          created_by: finance.id,
          period_key: periodKey,
        });
      if (ledgerError) {
        console.error("[finance/periods/mark-ledger]", ledgerError.message);
        return {
          ok: false,
          message:
            "Marked as paid, but the books could not be updated. Please add the entry on Books.",
        };
      }
    }

    revalidatePath("/finance/periods");
    revalidatePath("/finance/payments");
    revalidatePath("/finance/books");
    revalidatePath("/finance");
    return {
      ok: true,
      message: alreadyMarked
        ? "Marked as paid."
        : "Marked as paid and recorded on the books.",
    };
  } catch (error) {
    console.error("[finance/periods/mark]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not mark as paid."),
    };
  }
}
