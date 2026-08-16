import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessManager } from "@/components/admin/access-manager";
import { getSessionAdmin, type AdminProfile } from "@/lib/admin/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Access | School of Disciples Portal",
};

export default async function AdminAccessPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const supabase = await createServerSupabaseClient();
  const [{ data }, { data: parishRows }] = await Promise.all([
    supabase
      .from("admin_profiles")
      .select("id, email, full_name, role, is_active, created_at, parish_id")
      .order("created_at", { ascending: true }),
    supabase
      .from("parishes")
      .select("id, name, region")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const admins = (data ?? []).map((row) => ({
    ...(row as Omit<AdminProfile, "parish_id">),
    parish_id: (row as { parish_id?: string | null }).parish_id ?? null,
  })) as AdminProfile[];

  return (
    <div className="mx-auto max-w-3xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Access
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Credentials
        </h1>
        <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink/70">
          Your password and team. Open Insight for a short guide to desks.
        </p>
      </section>
      <AccessManager
        profile={profile}
        admins={admins}
        parishes={parishRows ?? []}
      />
    </div>
  );
}
