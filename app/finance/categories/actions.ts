"use server";

import { revalidatePath } from "next/cache";
import { writeFinanceAudit } from "@/lib/finance/audit";
import { requireSessionFinance } from "@/lib/finance/auth";
import {
  listFinanceCategories,
  type FinanceCategory,
} from "@/lib/finance/ledger";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinanceCategoryActionResult = {
  ok: boolean;
  message: string;
};

export async function listCategoriesForFinance(options?: {
  includeRetired?: boolean;
}): Promise<FinanceCategory[]> {
  await requireSessionFinance();
  return listFinanceCategories(options);
}

export async function createFinanceCategory(
  formData: FormData,
): Promise<FinanceCategoryActionResult> {
  try {
    const finance = await requireSessionFinance();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, message: "Enter a category name." };
    if (name.length > 80) {
      return { ok: false, message: "Category name must be 80 characters or fewer." };
    }

    const service = createServiceSupabaseClient();
    const { data: existing } = await service
      .from("finance_categories")
      .select("id, retired_at")
      .ilike("name", name)
      .is("retired_at", null)
      .maybeSingle();

    if (existing) {
      return { ok: false, message: "That category already exists." };
    }

    const { data: maxRow } = await service
      .from("finance_categories")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sortOrder = Number(maxRow?.sort_order ?? 0) + 10;

    const { error } = await service.from("finance_categories").insert({
      name,
      sort_order: sortOrder,
      created_by: finance.id,
    });

    if (error) {
      console.error("[finance/categories/create]", error.message);
      return {
        ok: false,
        message: "Could not save this category. Please try again.",
      };
    }

    revalidatePath("/finance/categories");
    revalidatePath("/finance/ledger");
    revalidatePath("/finance/books");
    await writeFinanceAudit({
      actorId: finance.id,
      action: "category_create",
      entityType: "finance_category",
      summary: `Added category ${name}`,
      after: { name },
    });
    return { ok: true, message: "Category added." };
  } catch (error) {
    console.error("[finance/categories/create]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not save this category."),
    };
  }
}

export async function renameFinanceCategory(
  formData: FormData,
): Promise<FinanceCategoryActionResult> {
  try {
    const finance = await requireSessionFinance();
    const id = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    if (!id) return { ok: false, message: "Category not found." };
    if (!name) return { ok: false, message: "Enter a category name." };
    if (name.length > 80) {
      return { ok: false, message: "Category name must be 80 characters or fewer." };
    }

    const service = createServiceSupabaseClient();
    const { data: before } = await service
      .from("finance_categories")
      .select("id, name")
      .eq("id", id)
      .is("retired_at", null)
      .maybeSingle();

    if (!before) {
      return { ok: false, message: "Category not found." };
    }

    const { data: clash } = await service
      .from("finance_categories")
      .select("id")
      .ilike("name", name)
      .is("retired_at", null)
      .neq("id", id)
      .maybeSingle();

    if (clash) {
      return { ok: false, message: "That category already exists." };
    }

    const { error } = await service
      .from("finance_categories")
      .update({
        name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("retired_at", null);

    if (error) {
      console.error("[finance/categories/rename]", error.message);
      return {
        ok: false,
        message: "Could not rename this category. Please try again.",
      };
    }

    revalidatePath("/finance/categories");
    revalidatePath("/finance/ledger");
    revalidatePath("/finance/books");
    await writeFinanceAudit({
      actorId: finance.id,
      action: "category_rename",
      entityType: "finance_category",
      entityId: id,
      summary: `Renamed category to ${name}`,
      before: { name: before.name },
      after: { name },
    });
    return { ok: true, message: "Category renamed." };
  } catch (error) {
    console.error("[finance/categories/rename]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not rename this category."),
    };
  }
}

export async function retireFinanceCategory(
  formData: FormData,
): Promise<FinanceCategoryActionResult> {
  try {
    const finance = await requireSessionFinance();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, message: "Category not found." };

    const service = createServiceSupabaseClient();
    const { data: before } = await service
      .from("finance_categories")
      .select("id, name")
      .eq("id", id)
      .is("retired_at", null)
      .maybeSingle();

    if (!before) {
      return { ok: false, message: "Category not found." };
    }

    const { count } = await service
      .from("finance_categories")
      .select("id", { count: "exact", head: true })
      .is("retired_at", null);

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        message: "Keep at least one active category for new entries.",
      };
    }

    const retiredAt = new Date().toISOString();
    const { error } = await service
      .from("finance_categories")
      .update({
        retired_at: retiredAt,
        updated_at: retiredAt,
      })
      .eq("id", id)
      .is("retired_at", null);

    if (error) {
      console.error("[finance/categories/retire]", error.message);
      return {
        ok: false,
        message: "Could not retire this category. Please try again.",
      };
    }

    revalidatePath("/finance/categories");
    revalidatePath("/finance/ledger");
    revalidatePath("/finance/books");
    await writeFinanceAudit({
      actorId: finance.id,
      action: "category_retire",
      entityType: "finance_category",
      entityId: id,
      summary: `Retired category ${before.name}`,
      before: { name: before.name, retired_at: null },
      after: { name: before.name, retired_at: retiredAt },
    });
    return { ok: true, message: "Category retired." };
  } catch (error) {
    console.error("[finance/categories/retire]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not retire this category."),
    };
  }
}
