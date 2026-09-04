import { cache } from "react";
import { isStaleRefreshAuthError } from "@/lib/supabase/auth-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TeacherProfile } from "@/lib/teacher/types";

export type { TeacherProfile } from "@/lib/teacher/types";
export { teacherDisplayName } from "@/lib/teacher/types";

const TEACHER_SELECT_WITH_AVATAR =
  "id, email, full_name, is_active, created_at, updated_at, avatar_path";
const TEACHER_SELECT_BASE =
  "id, email, full_name, is_active, created_at, updated_at";

function isMissingAvatarColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return /avatar_path|schema cache|column .* does not exist/i.test(message);
}

/** Deduped per request — teacher layout + pages. */
export const getSessionTeacher = cache(
  async (): Promise<TeacherProfile | null> => {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError && isStaleRefreshAuthError(authError)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return null;
    }
    if (!user) return null;

    let { data, error } = await supabase
      .from("teacher_profiles")
      .select(TEACHER_SELECT_WITH_AVATAR)
      .eq("id", user.id)
      .maybeSingle();

    // Staff-photo SQL not applied yet (or schema cache lag) — still allow login.
    if (error && isMissingAvatarColumnError(error.message)) {
      console.warn(
        "[teacher/auth] avatar_path unavailable; loading profile without it",
      );
      ({ data, error } = await supabase
        .from("teacher_profiles")
        .select(TEACHER_SELECT_BASE)
        .eq("id", user.id)
        .maybeSingle());
    }

    if (error) {
      console.error("[teacher/auth]", error.message);
      return null;
    }
    if (!data || !data.is_active) return null;

    return {
      ...(data as TeacherProfile),
      avatar_path: (data as { avatar_path?: string | null }).avatar_path ?? null,
      avatarUrl: null,
    };
  },
);

export async function requireSessionTeacher(): Promise<TeacherProfile> {
  const profile = await getSessionTeacher();
  if (!profile) {
    throw new Error("Unauthorized");
  }
  return profile;
}
