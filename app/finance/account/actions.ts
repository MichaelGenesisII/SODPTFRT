"use server";

import { revalidatePath } from "next/cache";
import { getSessionFinance } from "@/lib/finance/auth";
import {
  removeStaffAvatar,
  upsertStaffAvatar,
  type StaffPhotoActionResult,
} from "@/lib/staff/photo-actions";

function revalidateFinanceAvatarPaths() {
  revalidatePath("/finance", "layout");
  revalidatePath("/finance/account");
}

export async function uploadFinanceAvatar(
  formData: FormData,
): Promise<StaffPhotoActionResult> {
  const profile = await getSessionFinance();
  if (!profile) {
    return { ok: false, message: "Please sign in again." };
  }

  const result = await upsertStaffAvatar({
    userId: profile.id,
    table: "finance_profiles",
    formData,
  });
  if (result.ok) revalidateFinanceAvatarPaths();
  return result;
}

export async function deleteFinanceAvatar(): Promise<StaffPhotoActionResult> {
  const profile = await getSessionFinance();
  if (!profile) {
    return { ok: false, message: "Please sign in again." };
  }

  const result = await removeStaffAvatar({
    userId: profile.id,
    table: "finance_profiles",
  });
  if (result.ok) revalidateFinanceAvatarPaths();
  return result;
}
