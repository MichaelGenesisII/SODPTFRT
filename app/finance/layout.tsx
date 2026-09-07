import { redirect } from "next/navigation";
import { FinanceShell } from "@/components/finance/finance-shell";
import { getSessionFinance } from "@/lib/finance/auth";
import { cachedSignStaffPhotoUrl } from "@/lib/staff/photos";

/** Auth — never statically prerender. */
export const dynamic = "force-dynamic";

export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionFinance();
  if (!profile) {
    redirect("/login/finance");
  }

  const avatarUrl = await cachedSignStaffPhotoUrl(profile.avatar_path);

  return (
    <FinanceShell profile={{ ...profile, avatarUrl }}>{children}</FinanceShell>
  );
}
