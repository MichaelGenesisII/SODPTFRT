import { redirect } from "next/navigation";
import { getStudentSupportPulse } from "@/app/student/support/pulse";
import { StudentShell } from "@/components/student/student-shell";
import { StudentSupportLiveProvider } from "@/components/student/support-live";
import { getSessionStudent } from "@/lib/student/auth";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionStudent();
  if (!profile) {
    redirect("/login/student");
  }

  const supportPulse = await getStudentSupportPulse();

  return (
    <StudentSupportLiveProvider profile={profile} initialPulse={supportPulse}>
      <StudentShell profile={profile}>{children}</StudentShell>
    </StudentSupportLiveProvider>
  );
}
