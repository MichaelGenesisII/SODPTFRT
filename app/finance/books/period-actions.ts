"use server";

import { revalidatePath } from "next/cache";
import { writeFinanceAudit } from "@/lib/finance/audit";
import { requireSessionFinance } from "@/lib/finance/auth";
import {
  getPeriodLock,
  listFinancePeriodLocks,
  periodLabelFromKey,
  type FinancePeriodLock,
} from "@/lib/finance/periods-lock";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinancePeriodLockActionResult = {
  ok: boolean;
  message: string;
};

export async function loadFinancePeriodLocks(): Promise<FinancePeriodLock[]> {
  await requireSessionFinance();
  return listFinancePeriodLocks();
}

export async function lockFinancePeriod(
  formData: FormData,
): Promise<FinancePeriodLockActionResult> {
  try {
    const finance = await requireSessionFinance();
    const periodKey = String(formData.get("periodKey") ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(periodKey)) {
      return { ok: false, message: "Choose a valid month to lock." };
    }

    const existing = await getPeriodLock(periodKey);
    if (existing?.locked) {
      return { ok: false, message: "This month is already locked." };
    }

    const now = new Date().toISOString();
    const service = createServiceSupabaseClient();
    const { error } = await service.from("finance_periods").upsert(
      {
        period_key: periodKey,
        locked: true,
        locked_by: finance.id,
        locked_at: now,
        updated_at: now,
      },
      { onConflict: "period_key" },
    );

    if (error) {
      console.error("[finance/periods/lock]", error.message);
      return {
        ok: false,
        message: "Could not lock this month. Please try again.",
      };
    }

    await writeFinanceAudit({
      actorId: finance.id,
      action: "period_lock",
      entityType: "finance_period",
      entityId: periodKey,
      summary: `Locked ${periodLabelFromKey(periodKey)}`,
      before: existing
        ? { locked: existing.locked, reopened_at: existing.reopened_at }
        : null,
      after: { locked: true, locked_at: now },
    });

    revalidatePath("/finance/books");
    revalidatePath("/finance");
    return {
      ok: true,
      message: `${periodLabelFromKey(periodKey)} is locked.`,
    };
  } catch (error) {
    console.error("[finance/periods/lock]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not lock this month."),
    };
  }
}

export async function unlockFinancePeriod(
  formData: FormData,
): Promise<FinancePeriodLockActionResult> {
  try {
    const finance = await requireSessionFinance();
    const periodKey = String(formData.get("periodKey") ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(periodKey)) {
      return { ok: false, message: "Choose a valid month to unlock." };
    }

    const existing = await getPeriodLock(periodKey);
    if (!existing?.locked) {
      return { ok: false, message: "This month is not locked." };
    }

    const now = new Date().toISOString();
    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("finance_periods")
      .update({
        locked: false,
        reopened_at: now,
        reopened_by: finance.id,
        updated_at: now,
      })
      .eq("period_key", periodKey);

    if (error) {
      console.error("[finance/periods/unlock]", error.message);
      return {
        ok: false,
        message: "Could not unlock this month. Please try again.",
      };
    }

    await writeFinanceAudit({
      actorId: finance.id,
      action: "period_unlock",
      entityType: "finance_period",
      entityId: periodKey,
      summary: `Reopened ${periodLabelFromKey(periodKey)}`,
      before: {
        locked: true,
        locked_at: existing.locked_at,
      },
      after: { locked: false, reopened_at: now },
    });

    revalidatePath("/finance/books");
    revalidatePath("/finance");
    return {
      ok: true,
      message: `${periodLabelFromKey(periodKey)} was reopened. The reopen is on record.`,
    };
  } catch (error) {
    console.error("[finance/periods/unlock]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not unlock this month."),
    };
  }
}
