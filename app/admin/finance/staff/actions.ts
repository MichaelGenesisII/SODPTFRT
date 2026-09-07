"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
} from "@/lib/admin/auth";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import { portalBaseUrl } from "@/lib/email/backend";
import type { FinanceProfile } from "@/lib/finance/types";
import { publicActionMessage } from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { findAuthUserIdByEmail } from "@/lib/supabase/auth-admin";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinanceStaffActionResult = {
  ok: boolean;
  message: string;
  temporaryPassword?: string;
};

function unauthorized(): FinanceStaffActionResult {
  return { ok: false, message: "Unauthorized." };
}

function fail(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): FinanceStaffActionResult {
  console.error("[admin/finance/staff]", error);
  return { ok: false, message: publicActionMessage(error, fallback) };
}

export async function listFinanceStaff(): Promise<FinanceProfile[]> {
  const actor = await requireSessionAdmin();
  if (!isNationalAdmin(actor)) {
    throw new Error("Unauthorized");
  }
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_profiles")
    .select(
      "id, email, full_name, is_active, created_at, updated_at, avatar_path",
    )
    .order("created_at", { ascending: false });

  if (error) {
    // Soft-fail if avatar columns not migrated yet.
    if (/avatar_path|schema cache|column .* does not exist/i.test(error.message)) {
      const legacy = await service
        .from("finance_profiles")
        .select("id, email, full_name, is_active, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (legacy.error) {
        console.error("[listFinanceStaff]", legacy.error.message);
        throw new Error("Finance staff are temporarily unavailable.");
      }
      return (legacy.data ?? []).map((row) => ({
        ...(row as FinanceProfile),
        avatar_path: null,
      }));
    }
    console.error("[listFinanceStaff]", error.message);
    throw new Error("Finance staff are temporarily unavailable.");
  }
  return (data ?? []) as FinanceProfile[];
}

export async function inviteFinanceUser(
  formData: FormData,
): Promise<FinanceStaffActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return unauthorized();

    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const fullName = String(formData.get("fullName") ?? "").trim();
    let password = String(formData.get("password") ?? "").trim();

    if (!email) {
      return { ok: false, message: "Email is required." };
    }
    if (!password) {
      password = createTemporaryPassword();
    }
    if (password.length < 8) {
      return { ok: false, message: "Password must be at least 8 characters." };
    }

    const service = createServiceSupabaseClient();

    const { data: existingFinance } = await service
      .from("finance_profiles")
      .select("id, is_active")
      .eq("email", email)
      .maybeSingle();
    if (existingFinance) {
      return {
        ok: false,
        message: existingFinance.is_active
          ? "A Finance Admin with this email already exists."
          : "An inactive Finance Admin with this email already exists. Reactivate them instead.",
      };
    }

    const { data: existingAdmin } = await service
      .from("admin_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingAdmin) {
      return {
        ok: false,
        message:
          "This email belongs to an admin account. Use a different email for Finance access.",
      };
    }

    const { data: existingTeacher } = await service
      .from("teacher_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingTeacher) {
      return {
        ok: false,
        message:
          "This email belongs to a teacher account. Use a different email for Finance access.",
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
          "This email belongs to a student account. Use a different email for Finance access.",
      };
    }

    let userId: string | null = null;
    const existingAuthId = await findAuthUserIdByEmail(service, email);

    if (existingAuthId) {
      const { data: financeById } = await service
        .from("finance_profiles")
        .select("id")
        .eq("id", existingAuthId)
        .maybeSingle();
      if (financeById) {
        return {
          ok: false,
          message: "A Finance Admin with this email already exists.",
        };
      }
      const { data: adminById } = await service
        .from("admin_profiles")
        .select("id")
        .eq("id", existingAuthId)
        .maybeSingle();
      if (adminById) {
        return {
          ok: false,
          message:
            "This email belongs to an admin account. Use a different email for Finance access.",
        };
      }
      const { data: teacherById } = await service
        .from("teacher_profiles")
        .select("id")
        .eq("id", existingAuthId)
        .maybeSingle();
      if (teacherById) {
        return {
          ok: false,
          message:
            "This email belongs to a teacher account. Use a different email for Finance access.",
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
            "This email belongs to a student account. Use a different email for Finance access.",
        };
      }

      const { error: updateError } = await service.auth.admin.updateUserById(
        existingAuthId,
        {
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || null, role: "finance" },
        },
      );
      if (updateError) {
        return fail(
          updateError,
          "Could not restore this email for Finance access. Please try again.",
        );
      }
      userId = existingAuthId;
    } else {
      const { data: created, error: createError } =
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || null, role: "finance" },
        });
      if (createError || !created.user) {
        return fail(
          createError,
          "Could not create this Finance account. Please try again.",
        );
      }
      userId = created.user.id;
    }

    const { error: profileError } = await service
      .from("finance_profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name: fullName || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    if (profileError) {
      if (!existingAuthId) {
        await service.auth.admin.deleteUser(userId).catch(() => undefined);
      }
      return fail(
        profileError,
        "Could not save the Finance profile. Please try again.",
      );
    }

    const base = portalBaseUrl();
    const { sendFinanceWelcomeEmail } = await import("@/lib/email/backend");
    const mail = await sendFinanceWelcomeEmail({
      to: email,
      fullName: fullName || undefined,
      temporaryPassword: password,
      inviterName: actor.full_name?.trim() || actor.email,
      financeLoginUrl: `${base}/login/finance`,
      portalSupportUrl: `${base}/support`,
      siteUrl: SOD_SITE,
    });

    revalidatePath("/admin/access");

    if (!mail.ok) {
      console.error("[inviteFinanceUser] email", mail.message);
      return {
        ok: true,
        message:
          "Finance Admin created, but the welcome email could not be sent. Share the temporary password securely.",
        temporaryPassword: password,
      };
    }

    return {
      ok: true,
      message: "Finance Admin invited. Welcome email sent.",
      temporaryPassword: password,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function setFinanceUserActive(input: {
  financeId: string;
  isActive: boolean;
}): Promise<FinanceStaffActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return unauthorized();

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("finance_profiles")
      .update({
        is_active: input.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.financeId);

    if (error) return fail(error, "Could not update this Finance Admin.");

    revalidatePath("/admin/access");
    return {
      ok: true,
      message: input.isActive
        ? "Finance Admin reactivated."
        : "Finance Admin deactivated.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function updateFinanceProfile(input: {
  financeId: string;
  fullName: string;
  email: string;
}): Promise<FinanceStaffActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return unauthorized();

    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    if (!email) return { ok: false, message: "Email is required." };

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("finance_profiles")
      .update({
        full_name: fullName || null,
        email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.financeId);

    if (error) return fail(error);

    await service.auth.admin
      .updateUserById(input.financeId, {
        email,
        user_metadata: { full_name: fullName || null },
      })
      .catch((err) => {
        console.error("[updateFinanceProfile] auth email", err);
      });

    revalidatePath("/admin/access");
    return { ok: true, message: "Finance Admin updated." };
  } catch (error) {
    return fail(error);
  }
}

/** Hard-delete a Finance Admin. No email. */
export async function deleteFinanceUser(input: {
  financeId: string;
}): Promise<FinanceStaffActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return unauthorized();

    const financeId = input.financeId.trim();
    if (!financeId) return { ok: false, message: "Finance Admin is required." };

    const service = createServiceSupabaseClient();

    const { data: profile } = await service
      .from("finance_profiles")
      .select("id")
      .eq("id", financeId)
      .maybeSingle();
    if (!profile) {
      return { ok: false, message: "Finance Admin not found." };
    }

    const { error: profileError } = await service
      .from("finance_profiles")
      .delete()
      .eq("id", financeId);
    if (profileError) return fail(profileError);

    const { error: authError } = await service.auth.admin.deleteUser(financeId);
    if (authError) {
      console.error("[deleteFinanceUser] auth", authError.message);
      revalidatePath("/admin/access");
      return {
        ok: true,
        message:
          "Finance Admin removed from the directory. Sign-in cleanup may need a retry later.",
      };
    }

    revalidatePath("/admin/access");
    return { ok: true, message: "Finance Admin deleted." };
  } catch (error) {
    return fail(error);
  }
}
