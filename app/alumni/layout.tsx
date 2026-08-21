import { redirect } from "next/navigation";
import { AlumniShell } from "@/components/alumni/alumni-shell";
import { getSessionAlumni } from "@/lib/student/auth";

export const dynamic = "force-dynamic";

export default async function AlumniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionAlumni();
  if (!profile) {
    redirect("/login/alumni");
  }

  return <AlumniShell profile={profile}>{children}</AlumniShell>;
}
