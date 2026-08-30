import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStaleRefreshAuthError } from "@/lib/supabase/auth-errors";
import {
  isNationalAdmin,
  type AdminProfile,
} from "@/lib/admin/profile";

export type { AdminRole, AdminProfile } from "@/lib/admin/profile";
export { isNationalAdmin, isParishAdmin } from "@/lib/admin/profile";

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

  const { data, error } = await supabase
    .from("admin_profiles")
    .select("id, email, full_name, role, is_active, created_at, parish_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;
  return {
    ...(data as Omit<AdminProfile, "parish_id">),
    parish_id: (data as { parish_id?: string | null }).parish_id ?? null,
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
