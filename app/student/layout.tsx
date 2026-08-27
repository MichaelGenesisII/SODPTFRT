import { redirect } from "next/navigation";
import { getStudentSupportPulse } from "@/app/student/support/pulse";
import { StudentShell } from "@/components/student/student-shell";
import { StudentSupportLiveProvider } from "@/components/student/support-live";
import { getSessionStudent } from "@/lib/student/auth";

/** Auth + desk data — never statically prerender (needs Supabase at request time). */
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

  // Pulse uses cached session; claim work is non-blocking inside pulse.
  const supportPulse = await getStudentSupportPulse();

  return (
    <StudentSupportLiveProvider profile={profile} initialPulse={supportPulse}>
      <StudentShell profile={profile}>{children}</StudentShell>
    </StudentSupportLiveProvider>
  );
}
