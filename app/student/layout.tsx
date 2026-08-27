import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student/student-shell";
import { StudentSupportLiveProvider } from "@/components/student/support-live";
import { getSessionStudent } from "@/lib/student/auth";

/** Auth — never statically prerender (needs Supabase at request time). */
export const dynamic = "force-dynamic";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionStudent();
  if (!profile) {
    redirect("/login/student");
  }
  if (profile.account_kind === "alumni") {
    redirect("/alumni");
  }

  // Avatar signing is page-local (home/payments). Layout stays auth-only so
  // every soft navigation does not wait on Storage.
  return (
    <StudentSupportLiveProvider profile={profile}>
      <StudentShell profile={profile}>{children}</StudentShell>
    </StudentSupportLiveProvider>
  );
}
