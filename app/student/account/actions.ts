"use server";

import { revalidatePath } from "next/cache";
import { getSessionStudent } from "@/lib/student/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StudentAccountActionResult = {
  ok: boolean;
  message: string;
};

export async function changeStudentPassword(
  formData: FormData,
): Promise<StudentAccountActionResult> {
  try {
    const profile = await getSessionStudent();
    if (!profile) {
      return { ok: false, message: "Please sign in again." };
    }

    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!currentPassword || !newPassword) {
      return {
        ok: false,
        message: "Current and new passwords are required.",
      };
    }
    if (newPassword.length < 8) {
      return {
        ok: false,
        message: "New password must be at least 8 characters.",
      };
    }
    if (newPassword !== confirmPassword) {
      return { ok: false, message: "New passwords do not match." };
    }
    if (currentPassword === newPassword) {
      return {
        ok: false,
        message: "New password must be different from the current one.",
      };
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { ok: false, message: "Please sign in again." };
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verifyError) {
      return { ok: false, message: "Current password is incorrect." };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.error("[student/account/password]", error);
      return {
        ok: false,
        message: publicActionMessage(error, "Could not update your password."),
      };
    }

    revalidatePath("/student/account");
    return { ok: true, message: "Your password has been updated." };
  } catch (error) {
    console.error("[student/account/password]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not update your password."),
    };
  }
}
