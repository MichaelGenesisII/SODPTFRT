import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getSessionAdmin } from "@/lib/admin/auth";
import { parishAdminEnabled } from "@/lib/admin/features";
import { adminDeskScopeLabel } from "@/lib/admin/profile";
import { cachedSignStaffPhotoUrl } from "@/lib/staff/photos";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Auth — never statically prerender (needs Supabase at request time). */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionAdmin();
  if (!profile) {
    redirect("/login/admin");
  }

  let parishName: string | null = null;
  if (profile.parish_id) {
    const supabase = await createServerSupabaseClient();
    const { data: parish } = await supabase
      .from("parishes")
      .select("name")
      .eq("id", profile.parish_id)
      .maybeSingle();
    parishName = parish?.name ?? null;
  }

  const deskLabel = adminDeskScopeLabel(profile, parishName);
  const avatarUrl = await cachedSignStaffPhotoUrl(profile.avatar_path);

  // Desk / payments badges load on the client — awaiting them here made every
  // /admin/* soft navigation pay for pulse queries before the page could paint.
  return (
    <AdminShell
      profile={{ ...profile, avatarUrl }}
      deskLabel={deskLabel}
      parishAdminEnabled={parishAdminEnabled()}
    >
      {children}
    </AdminShell>
  );
}
