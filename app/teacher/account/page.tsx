import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TeacherAccountForm } from "@/components/teacher/teacher-account-form";
import { cachedSignStaffPhotoUrl } from "@/lib/staff/photos";
import { getSessionTeacher } from "@/lib/teacher/auth";

export const metadata: Metadata = {
  title: "Account | Teacher Portal",
};

export default async function TeacherAccountPage() {
  const profile = await getSessionTeacher();
  if (!profile) redirect("/login/teacher");

  const avatarUrl = await cachedSignStaffPhotoUrl(profile.avatar_path);

  return (
    <TeacherAccountForm profile={{ ...profile, avatarUrl }} />
  );
}
