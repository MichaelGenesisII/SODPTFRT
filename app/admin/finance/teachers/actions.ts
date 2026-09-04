"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
} from "@/lib/admin/auth";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import { portalBaseUrl } from "@/lib/email/backend";
import {
  publicActionMessage,
} from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { findAuthUserIdByEmail } from "@/lib/supabase/auth-admin";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { TeacherProfile } from "@/lib/teacher/types";

export type FinanceTeacherActionResult = {
  ok: boolean;
  message: string;
  temporaryPassword?: string;
};

function unauthorized(): FinanceTeacherActionResult {
  return { ok: false, message: "Unauthorized." };
}

function fail(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): FinanceTeacherActionResult {
  console.error("[admin/finance/teachers]", error);
  return { ok: false, message: publicActionMessage(error, fallback) };
}

/** Active teachers for class assignment pickers (any admin who can manage classes). */
export async function listActiveTeachersForAssign(): Promise<
  Pick<TeacherProfile, "id" | "email" | "full_name">[]
> {
  await requireSessionAdmin();
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("teacher_profiles")
    .select("id, email, full_name")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[listActiveTeachersForAssign]", error.message);
    return [];
  }
  return (data ?? []) as Pick<TeacherProfile, "id" | "email" | "full_name">[];
}

/** National Admin directory. */
export async function listTeachersForFinance(): Promise<TeacherProfile[]> {
  const actor = await requireSessionAdmin();
  if (!isNationalAdmin(actor)) {
    throw new Error("Unauthorized");
  }
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("teacher_profiles")
    .select(
      "id, email, full_name, is_active, created_at, updated_at, avatar_path",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listTeachersForFinance]", error.message);
    throw new Error("Teachers are temporarily unavailable.");
  }
  return (data ?? []) as TeacherProfile[];
}

export async function inviteTeacher(
  formData: FormData,
): Promise<FinanceTeacherActionResult> {
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

    const { data: existingTeacher } = await service
      .from("teacher_profiles")
      .select("id, is_active")
      .eq("email", email)
      .maybeSingle();
    if (existingTeacher) {
      return {
        ok: false,
        message: existingTeacher.is_active
          ? "A teacher with this email already exists."
          : "An inactive teacher with this email already exists. Reactivate them instead.",
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
          "This email belongs to an admin account. Use a different email for teacher access.",
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
          "This email belongs to a student account. Use a different email for teacher access.",
      };
    }

    let userId: string | null = null;
    const existingAuthId = await findAuthUserIdByEmail(service, email);

    if (existingAuthId) {
      const { data: teacherById } = await service
        .from("teacher_profiles")
        .select("id")
        .eq("id", existingAuthId)
        .maybeSingle();
      if (teacherById) {
        return {
          ok: false,
          message: "A teacher with this email already exists.",
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
            "This email belongs to an admin account. Use a different email for teacher access.",
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
            "This email belongs to a student account. Use a different email for teacher access.",
        };
      }

      const { error: updateError } = await service.auth.admin.updateUserById(
        existingAuthId,
        {
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || null, role: "teacher" },
        },
      );
      if (updateError) {
        return fail(
          updateError,
          "Could not restore this email for teacher access. Please try again.",
        );
      }
      userId = existingAuthId;
    } else {
      const { data: created, error: createError } =
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || null, role: "teacher" },
        });

      if (createError || !created.user) {
        return fail(
          createError,
          "Could not create the teacher account. Please try again.",
        );
      }
      userId = created.user.id;
    }

    const now = new Date().toISOString();
    const { error: profileError } = await service
      .from("teacher_profiles")
      .insert({
        id: userId,
        email,
        full_name: fullName || null,
        is_active: true,
        created_at: now,
        updated_at: now,
      });

    if (profileError) {
      if (!existingAuthId) {
        await service.auth.admin.deleteUser(userId).catch(() => undefined);
      }
      return fail(
        profileError,
        "Could not save the teacher profile. Please try again.",
      );
    }

    const { sendTeacherWelcomeEmail } = await import("@/lib/email/backend");
    const base = portalBaseUrl();
    const mail = await sendTeacherWelcomeEmail({
      to: email,
      fullName: fullName || undefined,
      temporaryPassword: password,
      inviterName: actor.full_name?.trim() || actor.email,
      teacherLoginUrl: `${base}/login/teacher`,
      portalSupportUrl: `${base}/support`,
      siteUrl: SOD_SITE,
    });

    revalidatePath("/admin/finance");
    revalidatePath("/admin/access");
    revalidatePath("/admin/classes");

    if (!mail.ok) {
      console.error("[inviteTeacher] email", mail.message);
      return {
        ok: true,
        message:
          "Teacher created, but the welcome email could not be sent. Share the temporary password securely.",
        temporaryPassword: password,
      };
    }

    return {
      ok: true,
      message: "Teacher invited. Welcome email sent.",
      temporaryPassword: password,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function setTeacherActive(input: {
  teacherId: string;
  isActive: boolean;
}): Promise<FinanceTeacherActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return unauthorized();

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("teacher_profiles")
      .update({
        is_active: input.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.teacherId);

    if (error) return fail(error);

    revalidatePath("/admin/access");
    revalidatePath("/admin/classes");
    return {
      ok: true,
      message: input.isActive ? "Teacher reactivated." : "Teacher deactivated.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function updateTeacherProfile(input: {
  teacherId: string;
  fullName: string;
  email: string;
}): Promise<FinanceTeacherActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return unauthorized();

    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    if (!email) return { ok: false, message: "Email is required." };

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("teacher_profiles")
      .update({
        full_name: fullName || null,
        email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.teacherId);

    if (error) return fail(error);

    await service.auth.admin
      .updateUserById(input.teacherId, {
        email,
        user_metadata: { full_name: fullName || null },
      })
      .catch((err) => {
        console.error("[updateTeacherProfile] auth email", err);
      });

    revalidatePath("/admin/access");
    return { ok: true, message: "Teacher updated." };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Hard-delete a teacher. No email.
 * Blocks if they have confirmed teaching history (Finance record).
 * Clears scheduled delivery rows and unassigns classes (FK set null).
 */
export async function deleteTeacher(input: {
  teacherId: string;
}): Promise<FinanceTeacherActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) return unauthorized();

    const teacherId = input.teacherId.trim();
    if (!teacherId) return { ok: false, message: "Teacher is required." };

    const service = createServiceSupabaseClient();

    const { data: profile } = await service
      .from("teacher_profiles")
      .select("id, email")
      .eq("id", teacherId)
      .maybeSingle();
    if (!profile) {
      return { ok: false, message: "Teacher not found." };
    }

    const { data: historyRows, error: historyError } = await service
      .from("class_teaching_deliveries")
      .select("id, status")
      .eq("teacher_id", teacherId)
      .neq("status", "scheduled");

    if (historyError) return fail(historyError);

    if ((historyRows ?? []).length > 0) {
      return {
        ok: false,
        message:
          "This teacher has confirmed teaching history and cannot be deleted. Deactivate them instead.",
      };
    }

    // Drop unconfirmed scheduled rows so FK allow profile delete.
    const { error: clearScheduledError } = await service
      .from("class_teaching_deliveries")
      .delete()
      .eq("teacher_id", teacherId)
      .eq("status", "scheduled");
    if (clearScheduledError) return fail(clearScheduledError);

    // Unassign from classes (also handled by ON DELETE SET NULL).
    await service
      .from("zoom_classes")
      .update({
        primary_teacher_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("primary_teacher_id", teacherId);

    const { error: profileError } = await service
      .from("teacher_profiles")
      .delete()
      .eq("id", teacherId);
    if (profileError) return fail(profileError);

    const { error: authError } = await service.auth.admin.deleteUser(teacherId);
    if (authError) {
      console.error("[deleteTeacher] auth", authError.message);
      // Profile is already gone — report soft failure for auth cleanup.
      revalidatePath("/admin/access");
      revalidatePath("/admin/classes");
      return {
        ok: true,
        message:
          "Teacher removed from the directory. Sign-in cleanup may need a retry later.",
      };
    }

    revalidatePath("/admin/finance");
    revalidatePath("/admin/access");
    revalidatePath("/admin/classes");
    return { ok: true, message: "Teacher deleted." };
  } catch (error) {
    return fail(error);
  }
}
