import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listParishesForAdmin } from "@/app/admin/parishes/actions";
import { getOverviewStats } from "@/app/admin/overview/actions";
import { OverviewDashboard } from "@/components/admin/overview-dashboard";
import { getSessionAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Admin Overview | School of Disciples Portal",
};

export default async function AdminOverviewPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const [stats, parishes] = await Promise.all([
    getOverviewStats(),
    listParishesForAdmin().catch(() => []),
  ]);

  const firstName =
    profile.full_name?.trim().split(/\s+/)[0] ||
    profile.email.split("@")[0] ||
    "";

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <OverviewDashboard
      profile={profile}
      stats={stats}
      parishes={parishes}
      firstName={firstName}
      greeting={greeting}
    />
  );
}
