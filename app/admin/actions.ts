"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isNationalAdmin,
  isParishAdmin,
  requireSessionAdmin,
} from "@/lib/admin/auth";
import { parishAdminEnabled } from "@/lib/admin/features";
import {
  publicActionMessage,
  publicEmailFailureMessage,
} from "@/lib/safe-action-message";
import { findAuthUserIdByEmail } from "@/lib/supabase/auth-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminActionResult = {
  ok: boolean;
  message: string;
};

function unauthorizedResult(): AdminActionResult {
  return { ok: false, message: "Unauthorized." };
}

function forbiddenStaffResult(): AdminActionResult {
  return {
    ok: false,
    message: "Only a national or master desk can do that.",
  };
}

function actionFail(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): AdminActionResult {
  console.error("[admin/actions]", error);
  return { ok: false, message: publicActionMessage(error, fallback) };
}

export async function signOutAdmin() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login/admin");
}

export async function createAdminAccount(
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    const actor = await requireSessionAdmin();

    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const fullName = String(formData.get("fullName") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const parishIdRaw = String(formData.get("parishId") ?? "").trim();
    let parishId = parishIdRaw || null;

    if (isParishAdmin(actor)) {
      if (!parishAdminEnabled()) {
        return {
          ok: false,
          message: "Parish desks are paused. Contact the national desk.",
        };
      }
      if (!actor.parish_id) {
        return {
          ok: false,
          message: "Your parish desk has no parish assigned.",
        };
      }
      if (parishId && parishId !== actor.parish_id) {
        return {
          ok: false,
          message: "You can only invite admins to your own parish.",
        };
      }
      parishId = actor.parish_id;
    } else if (!isNationalAdmin(actor)) {
      return forbiddenStaffResult();
    } else if (parishId && !parishAdminEnabled()) {
      return {
        ok: false,
        message: "Parish desks are paused. Invite a national admin instead.",
      };
    }

    if (!email || !password) {
      return { ok: false, message: "Email and password are required." };
    }
    if (password.length < 8) {
      return { ok: false, message: "Password must be at least 8 characters." };
    }

    const service = createServiceSupabaseClient();

    const { data: existingAdmin } = await service
      .from("admin_profiles")
      .select("id, is_active")
      .eq("email", email)
      .maybeSingle();
    if (existingAdmin) {
      return {
        ok: false,
        message: existingAdmin.is_active
          ? "An admin with this email already exists."
          : "An inactive admin with this email already exists. Reactivate them on Access instead of creating a new account.",
      };
    }

    const { data: existingStudent } = await service
      .from("student_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingStudent) {
      return {
        ok: false,
        message:
          "This email belongs to a student account. Use a different email for admin access.",
      };
    }

    let userId: string | null = null;
    const existingAuthId = await findAuthUserIdByEmail(service, email);

    if (existingAuthId) {
      // Orphan Auth user (profile deleted earlier) — reclaim instead of failing.
      const { data: adminById } = await service
        .from("admin_profiles")
        .select("id")
        .eq("id", existingAuthId)
        .maybeSingle();
      if (adminById) {
        return {
          ok: false,
          message: "An admin with this email already exists.",
        };
      }

      const { data: studentById } = await service
        .from("student_profiles")
        .select("id")
        .eq("id", existingAuthId)
        .maybeSingle();
      if (studentById) {
        return {
          ok: false,
          message:
            "This email belongs to a student account. Use a different email for admin access.",
        };
      }

      const { error: updateError } = await service.auth.admin.updateUserById(
        existingAuthId,
        {
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || null, role: "admin" },
        },
      );
      if (updateError) {
        return actionFail(
          updateError,
          "Could not restore this email for admin access. Please try again.",
        );
      }
      userId = existingAuthId;
    } else {
      const { data: created, error: createError } =
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || null, role: "admin" },
        });

      if (createError || !created.user) {
        if (/already|registered|exists/i.test(createError?.message ?? "")) {
          const racedId = await findAuthUserIdByEmail(service, email);
          if (racedId) {
            const { error: updateError } =
              await service.auth.admin.updateUserById(racedId, {
                password,
                email_confirm: true,
                user_metadata: { full_name: fullName || null, role: "admin" },
              });
            if (!updateError) {
              userId = racedId;
            }
          }
        }
        if (!userId) {
          return actionFail(
            createError,
            "Could not create the admin account. Please try again.",
          );
        }
      } else {
        userId = created.user.id;
      }
    }

    const { error: profileError } = await service.from("admin_profiles").insert({
      id: userId,
      email,
      full_name: fullName || null,
      role: "admin",
      is_active: true,
      created_by: actor.id,
      parish_id: parishId,
    });

    if (profileError) {
      // Only roll back Auth when this invite created a brand-new user.
      if (!existingAuthId) {
        await service.auth.admin.deleteUser(userId);
      }
      return actionFail(
        profileError,
        "Could not save the admin profile. Please try again.",
      );
    }

    let parishName: string | null = null;
    let deskScopeLabel = "National desk — all UK parishes";
    if (parishId) {
      const { data: parish } = await service
        .from("parishes")
        .select("name")
        .eq("id", parishId)
        .maybeSingle();
      parishName = parish?.name ?? null;
      deskScopeLabel = parishName
        ? `Parish desk — ${parishName}`
        : "Parish desk";
    }

    const displayName = fullName || email.split("@")[0] || "new admin";
    const inviterName =
      actor.full_name?.trim() || actor.email || "A colleague";
    const deskKind = parishId ? ("parish" as const) : ("national" as const);
    const inviterDeskKind = isParishAdmin(actor)
      ? ("parish" as const)
      : ("national" as const);

    const { portalBaseUrl, sendAdminWelcomeEmail } = await import(
      "@/lib/email/backend"
    );
    const { SOD_SITE } = await import("@/lib/site-nav");

    const mail = await sendAdminWelcomeEmail({
      to: email,
      fullName: fullName || displayName,
      temporaryPassword: password,
      deskScopeLabel,
      inviterName,
      adminLoginUrl: `${portalBaseUrl()}/login/admin`,
      portalSupportUrl: `${portalBaseUrl()}/support`,
      siteUrl: SOD_SITE,
      deskKind,
      parishName: parishName ?? undefined,
      inviterDeskKind,
    });

    revalidatePath("/admin/access");

    if (mail.ok) {
      return {
        ok: true,
        message: `Welcome email sent to ${displayName} (${email}). ${deskScopeLabel}.`,
      };
    }

    console.error("[admin] welcome email failed", mail.message);
    return {
      ok: true,
      message: publicEmailFailureMessage(
        `${displayName} was added.`,
        mail.message,
      ),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return actionFail(error, "Could not create the admin account.");
  }
}

export async function setAdminActive(
  adminId: string,
  isActive: boolean,
): Promise<AdminActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return forbiddenStaffResult();
    if (adminId === actor.id) {
      return { ok: false, message: "You cannot deactivate your own account." };
    }

    const service = createServiceSupabaseClient();
    const { data: target } = await service
      .from("admin_profiles")
      .select("role")
      .eq("id", adminId)
      .maybeSingle();

    if (!target) {
      return { ok: false, message: "Admin not found." };
    }
    if (target.role === "master") {
      return { ok: false, message: "The master admin cannot be deactivated." };
    }

    const { error } = await service
      .from("admin_profiles")
      .update({ is_active: isActive })
      .eq("id", adminId);

    if (error) {
      return actionFail(error, "Could not update admin status.");
    }

    revalidatePath("/admin/access");
    return {
      ok: true,
      message: isActive ? "Admin reactivated." : "Admin deactivated.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return actionFail(error);
  }
}

export async function deleteAdminAccount(
  adminId: string,
): Promise<AdminActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return forbiddenStaffResult();
    if (adminId === actor.id) {
      return { ok: false, message: "You cannot delete your own account." };
    }

    const service = createServiceSupabaseClient();
    const { data: target } = await service
      .from("admin_profiles")
      .select("role, email, full_name")
      .eq("id", adminId)
      .maybeSingle();

    if (!target) {
      return { ok: false, message: "Admin not found." };
    }
    if (target.role === "master") {
      return { ok: false, message: "The master admin cannot be deleted." };
    }

    // Delete Auth user; admin_profiles should cascade on id.
    // Also remove profile first if Auth delete is blocked, to avoid orphans.
    await service.from("admin_profiles").delete().eq("id", adminId);

    const { error } = await service.auth.admin.deleteUser(adminId);
    if (error) {
      // Profile already removed — surface a calm message if Auth cleanup failed.
      console.error("[admin] auth delete after profile remove", error);
      return actionFail(
        error,
        "Admin profile was removed, but login cleanup failed. Try inviting again — the desk will reclaim the email.",
      );
    }

    revalidatePath("/admin/access");
    const label = target.full_name || target.email;
    return { ok: true, message: `${label} has been deleted.` };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return actionFail(error);
  }
}

export async function changeOwnPassword(
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    await requireSessionAdmin();

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
      return { ok: false, message: "New password must be at least 8 characters." };
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
      return unauthorizedResult();
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
      return actionFail(error, "Could not update your password.");
    }

    return { ok: true, message: "Your password has been updated." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return actionFail(error);
  }
}

export async function resetAdminPassword(
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return forbiddenStaffResult();

    const adminId = String(formData.get("adminId") ?? "");
    const password = String(formData.get("password") ?? "");

    if (!adminId || password.length < 8) {
      return {
        ok: false,
        message: "Admin and a password of at least 8 characters are required.",
      };
    }

    const service = createServiceSupabaseClient();
    const { data: target } = await service
      .from("admin_profiles")
      .select("role")
      .eq("id", adminId)
      .maybeSingle();

    if (!target) {
      return { ok: false, message: "Admin not found." };
    }
    if (target.role === "master" && adminId !== actor.id) {
      return { ok: false, message: "Cannot reset another master password here." };
    }

    const { error } = await service.auth.admin.updateUserById(adminId, {
      password,
    });

    if (error) {
      return actionFail(error, "Could not update the password.");
    }

    revalidatePath("/admin/access");
    return { ok: true, message: "Password updated." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return actionFail(error);
  }
}

/** Assign parish scope (null = national desk). Masters stay national. */
export async function setAdminParishScope(
  adminId: string,
  parishId: string | null,
): Promise<AdminActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return forbiddenStaffResult();
    if (!adminId) return { ok: false, message: "Admin id is required." };

    const service = createServiceSupabaseClient();
    const { data: target } = await service
      .from("admin_profiles")
      .select("role, email")
      .eq("id", adminId)
      .maybeSingle();

    if (!target) return { ok: false, message: "Admin not found." };
    if (target.role === "master") {
      return {
        ok: false,
        message: "Master accounts are always national scope.",
      };
    }

    if (parishId) {
      const { data: parish } = await service
        .from("parishes")
        .select("id, name")
        .eq("id", parishId)
        .maybeSingle();
      if (!parish) return { ok: false, message: "Parish not found." };
    }

    const { error } = await service
      .from("admin_profiles")
      .update({ parish_id: parishId })
      .eq("id", adminId);

    if (error) return actionFail(error, "Could not update parish scope.");

    revalidatePath("/admin/access");
    return {
      ok: true,
      message: parishId
        ? "Admin scoped to parish."
        : "Admin set to national desk.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return actionFail(error);
  }
}
