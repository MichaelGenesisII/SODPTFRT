import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FinanceAccountForm } from "@/components/finance/finance-account-form";
import { getSessionFinance } from "@/lib/finance/auth";
import { cachedSignStaffPhotoUrl } from "@/lib/staff/photos";

export const metadata: Metadata = {
  title: "Account | Finance Portal",
};

export default async function FinanceAccountPage() {
  const profile = await getSessionFinance();
  if (!profile) redirect("/login/finance");

  const avatarUrl = await cachedSignStaffPhotoUrl(profile.avatar_path);

  return <FinanceAccountForm profile={{ ...profile, avatarUrl }} />;
}
