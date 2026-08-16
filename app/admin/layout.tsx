import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getPaymentsPulse } from "@/app/admin/payments/pulse";
import { getDeskPulse } from "@/app/admin/tickets/pulse";
import { getSessionAdmin } from "@/lib/admin/auth";
import { adminDeskScopeLabel } from "@/lib/admin/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Auth + desk data — never statically prerender (needs Supabase at request time). */
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

  const [deskPulse, paymentsPulse] = await Promise.all([
    getDeskPulse(),
    getPaymentsPulse(),
  ]);

  return (
    <AdminShell
      profile={profile}
      deskLabel={deskLabel}
      deskPulse={deskPulse}
      paymentsPulse={paymentsPulse}
    >
      {children}
    </AdminShell>
  );
}
