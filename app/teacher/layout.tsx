import { redirect } from "next/navigation";
import { TeacherShell } from "@/components/teacher/teacher-shell";
import { cachedSignStaffPhotoUrl } from "@/lib/staff/photos";
import { getSessionTeacher } from "@/lib/teacher/auth";

/** Auth — never statically prerender. */
export const dynamic = "force-dynamic";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionTeacher();
  if (!profile) {
    redirect("/login/teacher");
  }

  const avatarUrl = await cachedSignStaffPhotoUrl(profile.avatar_path);

  return (
    <TeacherShell profile={{ ...profile, avatarUrl }}>{children}</TeacherShell>
  );
}
