"use server";

import { redirect } from "next/navigation";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import { portalBaseUrl } from "@/lib/email/backend";
import { publicActionMessage } from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { requireSessionTeacher } from "@/lib/teacher/auth";

export type TeacherActionResult = {
  ok: boolean;
  message: string;
};

export async function signOutTeacher() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login/teacher");
}

export async function requestTeacherPasswordReset(
  emailRaw: string,
): Promise<TeacherActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  try {
    const service = createServiceSupabaseClient();
    const { data: profile } = await service
      .from("teacher_profiles")
      .select("id, email, full_name, is_active")
      .eq("email", email)
      .maybeSingle();

    // Same public message whether or not the account exists.
    const publicOk =
      "If that email is registered as a teacher, a temporary password is on its way.";

    if (!profile?.is_active) {
      return { ok: true, message: publicOk };
    }

    const temporaryPassword = createTemporaryPassword();
    const { error: updateError } = await service.auth.admin.updateUserById(
      profile.id,
      { password: temporaryPassword },
    );
    if (updateError) {
      console.error("[teacher/reset]", updateError.message);
      return {
        ok: false,
        message: "Could not reset access. Please try again.",
      };
    }

    const { sendTeacherWelcomeEmail } = await import("@/lib/email/backend");
    const base = portalBaseUrl();
    const mailed = await sendTeacherWelcomeEmail({
      to: profile.email,
      fullName: profile.full_name ?? undefined,
      temporaryPassword,
      inviterName: "School of Disciples",
      teacherLoginUrl: `${base}/login/teacher`,
      portalSupportUrl: `${base}/support`,
      siteUrl: SOD_SITE,
    });

    if (!mailed.ok) {
      console.error("[teacher/reset] email", mailed.message);
      return {
        ok: false,
        message: "Could not send the access email. Please try again.",
      };
    }

    return { ok: true, message: publicOk };
  } catch (error) {
    console.error("[teacher/reset]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not reset access. Please try again."),
    };
  }
}

export async function changeTeacherPassword(
  formData: FormData,
): Promise<TeacherActionResult> {
  try {
    const teacher = await requireSessionTeacher();
    const current = String(formData.get("currentPassword") ?? "");
    const next = String(formData.get("newPassword") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");

    if (!current || !next) {
      return { ok: false, message: "Enter your current and new password." };
    }
    if (next.length < 8) {
      return { ok: false, message: "New password must be at least 8 characters." };
    }
    if (next !== confirm) {
      return { ok: false, message: "New password and confirmation do not match." };
    }

    const supabase = await createServerSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: teacher.email,
      password: current,
    });
    if (signInError) {
      return { ok: false, message: "Current password is incorrect." };
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      console.error("[teacher/password]", error.message);
      return {
        ok: false,
        message: "Could not update password. Please try again.",
      };
    }

    return { ok: true, message: "Password updated." };
  } catch (error) {
    console.error("[teacher/password]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not update password. Please try again.",
      ),
    };
  }
}
