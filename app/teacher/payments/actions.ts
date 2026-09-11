"use server";

import { requireSessionTeacher } from "@/lib/teacher/auth";
import {
  getFinancePayout,
  type FinancePayout,
} from "@/lib/finance/payouts";
import { buildPayPeriodReport } from "@/lib/finance/pay";
import { periodLabelFromKey } from "@/lib/finance/periods-lock";
import { parseMonthPeriodKey } from "@/lib/finance/types";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { teacherDisplayName } from "@/lib/teacher/types";

export type TeacherPaymentRow = {
  id: string;
  status: FinancePayout["status"];
  provider: FinancePayout["provider"];
  amountGbp: number;
  currency: string;
  reason: string | null;
  periodKey: string | null;
  periodLabel: string;
  paidAt: string | null;
  createdAt: string;
};

function mapRow(row: Record<string, unknown>): TeacherPaymentRow {
  const periodKey = (row.period_key as string | null) ?? null;
  return {
    id: row.id as string,
    status: row.status as FinancePayout["status"],
    provider: row.provider as FinancePayout["provider"],
    amountGbp: Number(row.amount_gbp),
    currency: (row.currency as string) || "GBP",
    reason: (row.reason as string | null) ?? null,
    periodKey,
    periodLabel: periodKey ? periodLabelFromKey(periodKey) : "Payment",
    paidAt: (row.paid_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function listTeacherPayments(): Promise<TeacherPaymentRow[]> {
  const teacher = await requireSessionTeacher();
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_payouts")
    .select(
      "id, status, provider, amount_gbp, currency, reason, period_key, paid_at, created_at",
    )
    .eq("teacher_id", teacher.id)
    .in("status", ["paid", "sending", "failed", "returned", "authorised"])
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error("[teacher/payments/list]", error.message);
    throw new Error("Payments could not be loaded.");
  }

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export type TeacherRemittance = {
  payout: FinancePayout;
  periodLabel: string;
  teacherName: string;
  teacherEmail: string;
  sessionCount: number | null;
  rateLabel: string | null;
};

export async function getTeacherRemittance(
  payoutId: string,
): Promise<TeacherRemittance | null> {
  const teacher = await requireSessionTeacher();
  const payout = await getFinancePayout(payoutId);
  if (!payout || payout.teacher_id !== teacher.id) return null;
  if (payout.status !== "paid") return null;

  let sessionCount: number | null = null;
  let rateLabel: string | null = null;
  if (payout.period_key) {
    try {
      const parsed = parseMonthPeriodKey(payout.period_key);
      if (parsed) {
        const report = await buildPayPeriodReport(parsed);
        const row = report.teachers.find((t) => t.teacherId === teacher.id);
        if (row) {
          sessionCount = row.sessionCount;
          const first = row.sessions[0];
          rateLabel = first?.rateLabel ?? null;
        }
      }
    } catch (error) {
      console.error("[teacher/remittance/period]", error);
    }
  }

  return {
    payout,
    periodLabel: payout.period_key
      ? periodLabelFromKey(payout.period_key)
      : "Teacher pay",
    teacherName: teacherDisplayName(teacher),
    teacherEmail: teacher.email,
    sessionCount,
    rateLabel,
  };
}
