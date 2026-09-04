import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStaleRefreshAuthError } from "@/lib/supabase/auth-errors";
import {
  isNationalAdmin,
  type AdminProfile,
} from "@/lib/admin/profile";

export type { AdminRole, AdminProfile } from "@/lib/admin/profile";
export { isNationalAdmin, isParishAdmin } from "@/lib/admin/profile";

const ADMIN_SELECT_WITH_AVATAR =
  "id, email, full_name, role, is_active, created_at, parish_id, avatar_path";
const ADMIN_SELECT_BASE =
  "id, email, full_name, role, is_active, created_at, parish_id";

function isMissingAvatarColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return /avatar_path|schema cache|column .* does not exist/i.test(message);
}

/** Deduped per request — admin layout + pulses + pages all used this. */
export const getSessionAdmin = cache(async (): Promise<AdminProfile | null> => {
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
    .from("admin_profiles")
    .select(ADMIN_SELECT_WITH_AVATAR)
    .eq("id", user.id)
    .maybeSingle();

  // Staff-photo SQL not applied yet (or schema cache lag) — still allow login.
  if (error && isMissingAvatarColumnError(error.message)) {
    console.warn(
      "[admin/auth] avatar_path unavailable; loading profile without it",
    );
    ({ data, error } = await supabase
      .from("admin_profiles")
      .select(ADMIN_SELECT_BASE)
      .eq("id", user.id)
      .maybeSingle());
  }

  if (error) {
    console.error("[admin/auth]", error.message);
    return null;
  }
  if (!data || !data.is_active) return null;

  return {
    ...(data as Omit<AdminProfile, "parish_id" | "avatarUrl">),
    parish_id: (data as { parish_id?: string | null }).parish_id ?? null,
    avatar_path: (data as { avatar_path?: string | null }).avatar_path ?? null,
    avatarUrl: null,
  };
});

export async function requireSessionAdmin(): Promise<AdminProfile> {
  const profile = await getSessionAdmin();
  if (!profile) {
    throw new Error("Unauthorized");
  }
  return profile;
}

export async function requireNationalAdmin(): Promise<AdminProfile> {
  const profile = await requireSessionAdmin();
  if (!isNationalAdmin(profile)) {
    throw new Error("Unauthorized");
  }
  return profile;
}
