import {
  formatGbp,
  monthDateBounds,
  monthPeriodKey,
  parseMonthPeriodKey,
  rateForClassDate,
  type PayPeriodSessionRow,
  type PayPeriodTeacherTotal,
  type TeacherPayRate,
} from "@/lib/finance/types";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { teacherDisplayName } from "@/lib/teacher/types";

export async function listPayRates(): Promise<TeacherPayRate[]> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("teacher_pay_rates")
    .select(
      "id, amount_gbp, effective_from, label, is_default, created_at, updated_at",
    )
    .order("effective_from", { ascending: false });

  if (error) {
    console.error("[finance/rates]", error.message);
    throw new Error("Pay rates are temporarily unavailable.");
  }

  return (data ?? []).map((row) => ({
    ...row,
    amount_gbp: Number(row.amount_gbp),
  })) as TeacherPayRate[];
}

export async function buildPayPeriodReport(input: {
  year: number;
  month: number;
}): Promise<{
  periodKey: string;
  label: string;
  startIso: string;
  endIso: string;
  teachers: PayPeriodTeacherTotal[];
  sessionCount: number;
  grossGbp: number;
}> {
  const periodKey = monthPeriodKey(input.year, input.month);
  const { startIso, endIso, label } = monthDateBounds(input.year, input.month);
  const service = createServiceSupabaseClient();

  const [rates, classesResult, marksResult] = await Promise.all([
    listPayRates(),
    service
      .from("zoom_classes")
      .select("id, title, scheduled_start")
      .gte("scheduled_start", startIso)
      .lte("scheduled_start", endIso),
    service
      .from("teacher_pay_period_marks")
      .select("teacher_id, marked_paid_at")
      .eq("period_key", periodKey),
  ]);

  if (classesResult.error) {
    console.error("[finance/period/classes]", classesResult.error.message);
    throw new Error("Pay period data is temporarily unavailable.");
  }

  const classes = classesResult.data ?? [];
  const classById = new Map(classes.map((c) => [c.id as string, c]));
  const classIds = classes.map((c) => c.id as string);

  const paidByTeacher = new Map<string, string>();
  for (const mark of marksResult.data ?? []) {
    paidByTeacher.set(mark.teacher_id as string, mark.marked_paid_at as string);
  }

  if (classIds.length === 0) {
    return {
      periodKey,
      label,
      startIso,
      endIso,
      teachers: [],
      sessionCount: 0,
      grossGbp: 0,
    };
  }

  const { data: deliveries, error: deliveryError } = await service
    .from("class_teaching_deliveries")
    .select("id, class_id, teacher_id, status")
    .in("class_id", classIds)
    .in("status", ["delivered", "covered"]);

  if (deliveryError) {
    console.error("[finance/period/deliveries]", deliveryError.message);
    throw new Error("Pay period data is temporarily unavailable.");
  }

  const teacherIds = [
    ...new Set((deliveries ?? []).map((d) => d.teacher_id as string)),
  ];
  const teacherById = new Map<
    string,
    { id: string; email: string; full_name: string | null }
  >();
  if (teacherIds.length) {
    const { data: teachers, error: teacherError } = await service
      .from("teacher_profiles")
      .select("id, email, full_name")
      .in("id", teacherIds);
    if (teacherError) {
      console.error("[finance/period/teachers]", teacherError.message);
      throw new Error("Pay period data is temporarily unavailable.");
    }
    for (const t of teachers ?? []) {
      teacherById.set(t.id as string, t as {
        id: string;
        email: string;
        full_name: string | null;
      });
    }
  }

  const sessions: PayPeriodSessionRow[] = [];
  for (const row of deliveries ?? []) {
    const status = row.status as "delivered" | "covered";
    if (status !== "delivered" && status !== "covered") continue;
    const klass = classById.get(row.class_id as string);
    const teacher = teacherById.get(row.teacher_id as string);
    if (!klass || !teacher) continue;

    const rate = rateForClassDate(rates, klass.scheduled_start as string);
    sessions.push({
      deliveryId: row.id as string,
      classId: klass.id as string,
      classTitle: klass.title as string,
      scheduledStart: klass.scheduled_start as string,
      status,
      teacherId: teacher.id,
      teacherName: teacherDisplayName(teacher),
      teacherEmail: teacher.email,
      rateId: rate?.id ?? null,
      rateAmountGbp: rate?.amount_gbp ?? 0,
      rateLabel: rate?.label ?? null,
    });
  }

  const byTeacher = new Map<string, PayPeriodTeacherTotal>();
  for (const session of sessions) {
    const existing = byTeacher.get(session.teacherId);
    const rateLabel =
      session.rateLabel?.trim() ||
      (session.rateId ? formatGbp(session.rateAmountGbp) : "No rate");
    if (!existing) {
      byTeacher.set(session.teacherId, {
        teacherId: session.teacherId,
        teacherName: session.teacherName,
        teacherEmail: session.teacherEmail,
        sessionCount: 1,
        grossGbp: session.rateAmountGbp,
        ratesUsed: [rateLabel],
        markedPaidAt: paidByTeacher.get(session.teacherId) ?? null,
        sessions: [session],
      });
      continue;
    }
    existing.sessionCount += 1;
    existing.grossGbp += session.rateAmountGbp;
    existing.sessions.push(session);
    if (!existing.ratesUsed.includes(rateLabel)) {
      existing.ratesUsed.push(rateLabel);
    }
  }

  const teachers = [...byTeacher.values()].sort((a, b) =>
    a.teacherName.localeCompare(b.teacherName),
  );
  for (const teacher of teachers) {
    teacher.sessions.sort((a, b) =>
      a.scheduledStart.localeCompare(b.scheduledStart),
    );
  }

  return {
    periodKey,
    label,
    startIso,
    endIso,
    teachers,
    sessionCount: sessions.length,
    grossGbp: teachers.reduce((sum, t) => sum + t.grossGbp, 0),
  };
}

export function currentMonthPeriod(): {
  year: number;
  month: number;
  key: string;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month, key: monthPeriodKey(year, month) };
}

export function resolvePeriodInput(periodKey?: string | null): {
  year: number;
  month: number;
  key: string;
} {
  if (periodKey) {
    const parsed = parseMonthPeriodKey(periodKey);
    if (parsed) {
      return {
        year: parsed.year,
        month: parsed.month,
        key: monthPeriodKey(parsed.year, parsed.month),
      };
    }
  }
  return currentMonthPeriod();
}

export function payPeriodCsv(report: {
  label: string;
  teachers: PayPeriodTeacherTotal[];
}): string {
  const lines = [
    "Teacher,Email,Class date,Class title,Status,Rate GBP,Amount GBP,Period",
  ];
  for (const teacher of report.teachers) {
    for (const session of teacher.sessions) {
      const date = session.scheduledStart.slice(0, 10);
      lines.push(
        [
          csvCell(teacher.teacherName),
          csvCell(teacher.teacherEmail),
          csvCell(date),
          csvCell(session.classTitle),
          csvCell(session.status),
          csvCell(session.rateAmountGbp.toFixed(2)),
          csvCell(session.rateAmountGbp.toFixed(2)),
          csvCell(report.label),
        ].join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
