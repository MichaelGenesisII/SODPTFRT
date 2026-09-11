import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinancePeriodLock = {
  period_key: string;
  locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
};

export async function listFinancePeriodLocks(): Promise<FinancePeriodLock[]> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_periods")
    .select(
      "period_key, locked, locked_by, locked_at, reopened_at, reopened_by",
    )
    .order("period_key", { ascending: false });

  if (error) {
    console.error("[finance/periods/list]", error.message);
    throw new Error("Period locks could not be loaded.");
  }
  return (data ?? []) as FinancePeriodLock[];
}

export async function getPeriodLock(
  periodKey: string,
): Promise<FinancePeriodLock | null> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_periods")
    .select(
      "period_key, locked, locked_by, locked_at, reopened_at, reopened_by",
    )
    .eq("period_key", periodKey)
    .maybeSingle();

  if (error) {
    console.error("[finance/periods/get]", error.message);
    throw new Error("Period lock could not be loaded.");
  }
  return (data as FinancePeriodLock | null) ?? null;
}

export async function isPeriodLocked(periodKey: string): Promise<boolean> {
  const row = await getPeriodLock(periodKey);
  return Boolean(row?.locked);
}

export function periodLabelFromKey(periodKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey.trim());
  if (!match) return periodKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
