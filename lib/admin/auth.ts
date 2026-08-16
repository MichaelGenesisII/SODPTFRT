import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  isNationalAdmin,
  type AdminProfile,
} from "@/lib/admin/profile";

export type { AdminRole, AdminProfile } from "@/lib/admin/profile";
export { isNationalAdmin, isParishAdmin } from "@/lib/admin/profile";

export async function getSessionAdmin(): Promise<AdminProfile | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
}

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
