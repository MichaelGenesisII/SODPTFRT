"use server";

import { after } from "next/server";
import { adminDeskScopeLabel } from "@/lib/admin/profile";
import {
  portalBaseUrl,
  sendAdminAccessRecoveryEmail,
} from "@/lib/email/backend";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import {
  publicActionMessage,
} from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminAccessResult = {
  ok: boolean;
  message: string;
};

type ParishEmbed = { name: string | null } | { name: string | null }[] | null;

/**
 * Public forgot-password for admin login.
 * Resets the auth password immediately, then emails a temporary one in the
 * background so the login UI is not blocked on SMTP (often several seconds).
 */
export async function requestAdminPasswordReset(
  emailRaw: string,
): Promise<AdminAccessResult> {
  const startedAt = Date.now();
  try {
    const email = emailRaw.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, message: "Enter a valid email address." };
    }

    const service = createServiceSupabaseClient();
    const { data: profile } = await service
      .from("admin_profiles")
      .select("id, email, full_name, role, parish_id, is_active, parishes(name)")
      .eq("email", email)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      return {
        ok: false,
        message:
          "We could not find an active admin account for that email. If you believe this is wrong, contact support.",
      };
    }

    const parishEmbed = profile.parishes as ParishEmbed;
    const parishName = Array.isArray(parishEmbed)
      ? parishEmbed[0]?.name ?? null
      : parishEmbed?.name ?? null;

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

    const mailPayload = {
      to: email,
      fullName: profile.full_name?.trim() || email.split("@")[0] || "Admin",
      temporaryPassword,
      deskScopeLabel,
      adminLoginUrl: `${portalBaseUrl()}/login/admin`,
      portalSupportUrl: `${portalBaseUrl()}/support`,
      siteUrl: SOD_SITE,
      deskKind,
      parishName: parishName ?? undefined,
    };

    // Respond as soon as the password is refreshed. SMTP to Namecheap often
    // takes several seconds; awaiting it made Forgot password feel stuck.
    after(async () => {
      const mailStartedAt = Date.now();
      let mailResult = await sendAdminAccessRecoveryEmail(mailPayload);
      if (!mailResult.ok) {
        console.error(
          "[login/admin] recovery email failed; retrying once",
          mailResult.message,
        );
        mailResult = await sendAdminAccessRecoveryEmail(mailPayload);
      }
      if (!mailResult.ok) {
        console.error(
          "[login/admin] recovery email failed after retry",
          mailResult.message,
        );
        return;
      }
      console.info(
        `[login/admin] recovery email sent in ${Date.now() - mailStartedAt}ms (total since request ${Date.now() - startedAt}ms)`,
      );
    });

    console.info(
      `[login/admin] password refreshed in ${Date.now() - startedAt}ms; email queued`,
    );

    return {
      ok: true,
      message: `Your desk password was refreshed. A temporary password is on its way to ${email} — check inbox and spam.`,
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
