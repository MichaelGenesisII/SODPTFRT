import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminAccountManager } from "@/components/admin/admin-account-manager";
import { getSessionAdmin } from "@/lib/admin/auth";
import { cachedSignStaffPhotoUrl } from "@/lib/staff/photos";

export const metadata: Metadata = {
  title: "My account | School of Disciples Portal",
};

export default async function AdminAccountPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const avatarUrl = await cachedSignStaffPhotoUrl(profile.avatar_path);

  return (
    <div className="mx-auto max-w-3xl">
      <AdminAccountManager
        profile={{
          ...profile,
          avatarUrl,
        }}
      />
    </div>
  );
}
