import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentNoticesBoard } from "@/components/student/student-notices";
import { fetchStudentAnnouncements } from "@/lib/announcements-server";
import { getSessionStudent } from "@/lib/student/auth";

export const metadata: Metadata = {
  title: "Notices | Student Portal",
  description:
    "Students-only School of Disciples announcements — private to the signed-in portal.",
};

export default async function StudentNoticesPage() {
  const profile = await getSessionStudent();
  if (!profile) redirect("/login/student");

  const notices = await fetchStudentAnnouncements();

  return <StudentNoticesBoard notices={notices} />;
}
