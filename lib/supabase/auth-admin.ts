import type { createServiceSupabaseClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Find an Auth user by email (paginated).
 * Auth users can outlive deleted admin/student profiles.
 */
export async function findAuthUserIdByEmail(
  service: ServiceClient,
  email: string,
): Promise<string | null> {
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === needle);
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}
