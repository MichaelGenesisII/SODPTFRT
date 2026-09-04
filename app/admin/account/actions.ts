"use server";

import { revalidatePath } from "next/cache";
import { getSessionAdmin } from "@/lib/admin/auth";
import {
  removeStaffAvatar,
  upsertStaffAvatar,
  type StaffPhotoActionResult,
} from "@/lib/staff/photo-actions";

function revalidateAdminAvatarPaths() {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/account");
}

export async function uploadAdminAvatar(
  formData: FormData,
): Promise<StaffPhotoActionResult> {
  const profile = await getSessionAdmin();
  if (!profile) {
    return { ok: false, message: "Please sign in again." };
  }

  const result = await upsertStaffAvatar({
    userId: profile.id,
    table: "admin_profiles",
    formData,
  });
  if (result.ok) revalidateAdminAvatarPaths();
  return result;
}

export async function deleteAdminAvatar(): Promise<StaffPhotoActionResult> {
  const profile = await getSessionAdmin();
  if (!profile) {
    return { ok: false, message: "Please sign in again." };
  }

  const result = await removeStaffAvatar({
    userId: profile.id,
    table: "admin_profiles",
  });
  if (result.ok) revalidateAdminAvatarPaths();
  return result;
}
