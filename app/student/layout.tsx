import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StudentShell } from "@/components/student/student-shell";
import { StudentSupportLiveProvider } from "@/components/student/support-live";
import { StudentTourProvider } from "@/components/student/student-tour-provider";
import { getSessionStudent } from "@/lib/student/auth";
import { cachedSignStudentPhotoUrl } from "@/lib/student/photos";

/** Auth — never statically prerender (needs Supabase at request time). */
export const dynamic = "force-dynamic";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionStudent();
  if (!session) {
    redirect("/login/student");
  }
  if (session.account_kind === "alumni") {
    redirect("/alumni");
  }

  const passportUrl = await cachedSignStudentPhotoUrl(session.passport_path);
  const profile = passportUrl ? { ...session, passportUrl } : session;

  return (
    <StudentSupportLiveProvider profile={profile}>
      <Suspense fallback={null}>
        <StudentTourProvider firstName={profile.first_name}>
          <StudentShell profile={profile}>{children}</StudentShell>
        </StudentTourProvider>
      </Suspense>
    </StudentSupportLiveProvider>
  );
}
