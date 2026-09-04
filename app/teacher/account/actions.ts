"use server";

import { revalidatePath } from "next/cache";
import {
  removeStaffAvatar,
  upsertStaffAvatar,
  type StaffPhotoActionResult,
} from "@/lib/staff/photo-actions";
import { getSessionTeacher } from "@/lib/teacher/auth";

function revalidateTeacherAvatarPaths() {
  revalidatePath("/teacher", "layout");
  revalidatePath("/teacher/account");
}

export async function uploadTeacherAvatar(
  formData: FormData,
): Promise<StaffPhotoActionResult> {
  const profile = await getSessionTeacher();
  if (!profile) {
    return { ok: false, message: "Please sign in again." };
  }

  const result = await upsertStaffAvatar({
    userId: profile.id,
    table: "teacher_profiles",
    formData,
  });
  if (result.ok) revalidateTeacherAvatarPaths();
  return result;
}

export async function deleteTeacherAvatar(): Promise<StaffPhotoActionResult> {
  const profile = await getSessionTeacher();
  if (!profile) {
    return { ok: false, message: "Please sign in again." };
  }

  const result = await removeStaffAvatar({
    userId: profile.id,
    table: "teacher_profiles",
  });
  if (result.ok) revalidateTeacherAvatarPaths();
  return result;
}
