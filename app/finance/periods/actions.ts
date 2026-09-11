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
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (!periodKey || !teacherId) {
      return { ok: false, message: "Missing period or teacher." };
    }

    const service = createServiceSupabaseClient();
    const { error } = await service.from("teacher_pay_period_marks").upsert(
      {
        period_key: periodKey,
        teacher_id: teacherId,
        marked_paid_at: new Date().toISOString(),
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

    revalidatePath("/finance/periods");
    revalidatePath("/finance/books");
    revalidatePath("/finance");
    return { ok: true, message: "Marked as paid." };
  } catch (error) {
    console.error("[finance/periods/mark]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not mark as paid."),
    };
  }
}

export async function clearTeacherPaid(
  formData: FormData,
): Promise<FinancePeriodActionResult> {
  try {
    await requireSessionFinance();
    const periodKey = String(formData.get("periodKey") ?? "").trim();
    const teacherId = String(formData.get("teacherId") ?? "").trim();

    if (!periodKey || !teacherId) {
      return { ok: false, message: "Missing period or teacher." };
    }

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("teacher_pay_period_marks")
      .delete()
      .eq("period_key", periodKey)
      .eq("teacher_id", teacherId);

    if (error) {
      console.error("[finance/periods/unmark]", error.message);
      return {
        ok: false,
        message: "Could not clear paid status. Please try again.",
      };
    }

    revalidatePath("/finance/periods");
    revalidatePath("/finance/books");
    revalidatePath("/finance");
    return { ok: true, message: "Paid mark cleared." };
  } catch (error) {
    console.error("[finance/periods/unmark]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not clear paid status."),
    };
  }
}
