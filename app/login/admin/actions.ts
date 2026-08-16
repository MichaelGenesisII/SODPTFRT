"use server";

import { adminDeskScopeLabel } from "@/lib/admin/profile";
import {
  portalBaseUrl,
  sendAdminAccessRecoveryViaBackend,
} from "@/lib/email/backend";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import {
  publicActionMessage,
  publicEmailFailureMessage,
} from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminAccessResult = {
  ok: boolean;
  message: string;
};

/**
 * Public forgot-password for admin login.
 * Resets the auth password and emails a temporary one (active admins only).
 */
export async function requestAdminPasswordReset(
  emailRaw: string,
): Promise<AdminAccessResult> {
  try {
    const email = emailRaw.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, message: "Enter a valid email address." };
    }

    const service = createServiceSupabaseClient();
    const { data: profile } = await service
      .from("admin_profiles")
      .select("id, email, full_name, role, parish_id, is_active")
      .eq("email", email)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      return {
        ok: false,
        message:
          "We could not find an active admin account for that email. If you believe this is wrong, contact support.",
      };
    }

    let parishName: string | null = null;
    if (profile.parish_id) {
      const { data: parish } = await service
        .from("parishes")
        .select("name")
        .eq("id", profile.parish_id)
        .maybeSingle();
      parishName = parish?.name ?? null;
    }

    const temporaryPassword = createTemporaryPassword();
    const { error: updateError } = await service.auth.admin.updateUserById(
      profile.id,
      { password: temporaryPassword },
    );

    if (updateError) {
      console.error("[login/admin] password update failed", updateError);
      return {
        ok: false,
        message: publicActionMessage(
          updateError.message,
          "Could not refresh your desk password. Please contact support.",
        ),
      };
    }

    const deskScopeLabel = adminDeskScopeLabel(
      {
        role: profile.role as "master" | "admin",
        parish_id: profile.parish_id ?? null,
      },
      parishName,
    );

    const deskKind = profile.parish_id
      ? ("parish" as const)
      : ("national" as const);

    const mailResult = await sendAdminAccessRecoveryViaBackend({
      to: email,
      fullName: profile.full_name?.trim() || email.split("@")[0] || "Admin",
      temporaryPassword,
      deskScopeLabel,
      adminLoginUrl: `${portalBaseUrl()}/login/admin`,
      portalSupportUrl: `${portalBaseUrl()}/support`,
      siteUrl: SOD_SITE,
      deskKind,
      parishName: parishName ?? undefined,
    });

    if (!mailResult.ok) {
      console.error("[login/admin] recovery email failed", mailResult.message);
      return {
        ok: false,
        message: publicEmailFailureMessage(
          "Password was refreshed, but the email could not be sent.",
          mailResult.message,
        ),
      };
    }

    return {
      ok: true,
      message: `A fresh temporary password has been emailed to ${email}.`,
    };
  } catch (error) {
    console.error("[login/admin] password reset failed", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not reset admin password. Please try again.",
      ),
    };
  }
}
