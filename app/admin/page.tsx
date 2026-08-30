import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listCohortsForAdmin } from "@/app/admin/cohorts/actions";
import { getOverviewStats } from "@/app/admin/overview/actions";
import {
  listBatchesForAdmin,
  listParishesForAdmin,
} from "@/app/admin/parishes/actions";
import { OverviewDashboard } from "@/components/admin/overview-dashboard";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Admin Overview | School of Disciples Portal",
};

export default async function AdminOverviewPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const national = isNationalAdmin(profile);
  const [stats, parishes, cohorts, batches] = await Promise.all([
    getOverviewStats(),
    listParishesForAdmin().catch(() => []),
    listCohortsForAdmin().catch(() => []),
    listBatchesForAdmin(national ? null : profile.parish_id).catch(() => []),
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
      cohorts={cohorts}
      batches={batches}
      firstName={firstName}
      greeting={greeting}
    />
  );
}
