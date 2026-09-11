"use server";

import { revalidatePath } from "next/cache";
import { requireSessionFinance } from "@/lib/finance/auth";
import { listPayRates } from "@/lib/finance/pay";
import type { TeacherPayRate } from "@/lib/finance/types";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinanceRatesActionResult = {
  ok: boolean;
  message: string;
};

export async function listRatesForFinance(): Promise<TeacherPayRate[]> {
  await requireSessionFinance();
  return listPayRates();
}

export async function createPayRate(
  formData: FormData,
): Promise<FinanceRatesActionResult> {
  try {
    await requireSessionFinance();
    const amountRaw = String(formData.get("amountGbp") ?? "").trim();
    const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
    const label = String(formData.get("label") ?? "").trim() || null;
    const amount = Number(amountRaw);

    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, message: "Enter a valid amount in pounds." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return { ok: false, message: "Choose a valid effective date." };
    }

    const service = createServiceSupabaseClient();
    const { error } = await service.from("teacher_pay_rates").insert({
      amount_gbp: amount,
      effective_from: effectiveFrom,
      label,
      is_default: true,
    });

    if (error) {
      console.error("[finance/rates/create]", error.message);
      return {
        ok: false,
        message: "Could not save this rate. Please try again.",
      };
    }

    revalidatePath("/finance/rates");
    revalidatePath("/finance");
    revalidatePath("/finance/periods");
    revalidatePath("/finance/books");
    return { ok: true, message: "Rate saved." };
  } catch (error) {
    console.error("[finance/rates/create]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not save this rate."),
    };
  }
}

export async function updatePayRate(
  formData: FormData,
): Promise<FinanceRatesActionResult> {
  try {
    await requireSessionFinance();
    const id = String(formData.get("id") ?? "").trim();
    const amountRaw = String(formData.get("amountGbp") ?? "").trim();
    const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
    const label = String(formData.get("label") ?? "").trim() || null;
    const amount = Number(amountRaw);

    if (!id) return { ok: false, message: "Rate not found." };
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, message: "Enter a valid amount in pounds." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return { ok: false, message: "Choose a valid effective date." };
    }

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("teacher_pay_rates")
      .update({
        amount_gbp: amount,
        effective_from: effectiveFrom,
        label,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("[finance/rates/update]", error.message);
      return {
        ok: false,
        message: "Could not update this rate. Please try again.",
      };
    }

    revalidatePath("/finance/rates");
    revalidatePath("/finance");
    revalidatePath("/finance/periods");
    revalidatePath("/finance/books");
    return { ok: true, message: "Rate updated." };
  } catch (error) {
    console.error("[finance/rates/update]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not update this rate."),
    };
  }
}

export async function deletePayRate(
  formData: FormData,
): Promise<FinanceRatesActionResult> {
  try {
    await requireSessionFinance();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, message: "Rate not found." };

    const service = createServiceSupabaseClient();
    const { count } = await service
      .from("teacher_pay_rates")
      .select("id", { count: "exact", head: true });

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        message: "Keep at least one rate so session pay can be calculated.",
      };
    }

    const { error } = await service
      .from("teacher_pay_rates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[finance/rates/delete]", error.message);
      return {
        ok: false,
        message: "Could not delete this rate. Please try again.",
      };
    }

    revalidatePath("/finance/rates");
    revalidatePath("/finance");
    revalidatePath("/finance/periods");
    revalidatePath("/finance/books");
    return { ok: true, message: "Rate deleted." };
  } catch (error) {
    console.error("[finance/rates/delete]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not delete this rate."),
    };
  }
}
