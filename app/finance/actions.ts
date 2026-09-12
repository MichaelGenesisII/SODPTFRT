"use server";

import { redirect } from "next/navigation";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import { portalBaseUrl } from "@/lib/email/backend";
import { requireSessionFinance } from "@/lib/finance/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinanceActionResult = {
  ok: boolean;
  message: string;
};

export async function signOutFinance() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login/finance");
}

export async function requestFinancePasswordReset(
  emailRaw: string,
): Promise<FinanceActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  try {
    const service = createServiceSupabaseClient();
    const { data: profile } = await service
      .from("finance_profiles")
      .select("id, email, full_name, is_active")
      .eq("email", email)
      .maybeSingle();

    const publicOk =
      "If that email is registered for Finance, a temporary password is on its way.";

    if (!profile?.is_active) {
      return { ok: true, message: publicOk };
    }

    const temporaryPassword = createTemporaryPassword();
    const { error: updateError } = await service.auth.admin.updateUserById(
      profile.id,
      { password: temporaryPassword },
    );
    if (updateError) {
      console.error("[finance/reset]", updateError.message);
      return {
        ok: false,
        message: "Could not reset access. Please try again.",
      };
    }

    const { sendFinanceWelcomeEmail } = await import("@/lib/email/backend");
    const base = portalBaseUrl();
    const mailed = await sendFinanceWelcomeEmail({
      to: profile.email,
      fullName: profile.full_name ?? undefined,
      temporaryPassword,
      inviterName: "School of Disciples",
      financeLoginUrl: `${base}/login/finance`,
      portalSupportUrl: `${base}/support`,
      siteUrl: SOD_SITE,
    });

    if (!mailed.ok) {
      console.error("[finance/reset] email", mailed.message);
      return {
        ok: false,
        message: "Could not send the access email. Please try again.",
      };
    }

    return { ok: true, message: publicOk };
  } catch (error) {
    console.error("[finance/reset]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not reset access. Please try again.",
      ),
    };
  }
}

export async function changeFinancePassword(
  formData: FormData,
): Promise<FinanceActionResult> {
  try {
    const finance = await requireSessionFinance();
    const current = String(formData.get("currentPassword") ?? "");
    const next = String(formData.get("newPassword") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");

    if (!current || !next) {
      return { ok: false, message: "Enter your current and new password." };
    }
    if (next.length < 8) {
      return {
        ok: false,
        message: "New password must be at least 8 characters.",
      };
    }
    if (next !== confirm) {
      return {
        ok: false,
        message: "New password and confirmation do not match.",
      };
    }

    const supabase = await createServerSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: finance.email,
      password: current,
    });
    if (signInError) {
      return { ok: false, message: "Current password is incorrect." };
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      console.error("[finance/password]", error.message);
      return {
        ok: false,
        message: "Could not update password. Please try again.",
      };
    }

    return { ok: true, message: "Password updated." };
  } catch (error) {
    console.error("[finance/password]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not update password. Please try again.",
      ),
    };
  }
}
