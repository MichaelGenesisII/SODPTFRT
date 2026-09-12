import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listStudentCommunityMessages } from "@/app/student/community/actions";
import { StudentCommunityDesk } from "@/components/student/student-community";
import { getSessionStudent } from "@/lib/student/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import type { CommunityMessage } from "@/lib/community/types";

export const metadata: Metadata = {
  title: "Community | Student Portal",
  description: "National community chat for School of Disciples students.",
};

export default async function StudentCommunityPage() {
  const profile = await getSessionStudent();
  if (!profile) redirect("/login/student");

  let messages: CommunityMessage[] = [];
  let loadError: string | null = null;

  try {
    messages = await listStudentCommunityMessages();
  } catch (error) {
    console.error("student/community load:", error);
    loadError = publicActionMessage(
      error,
      "Community is temporarily unavailable. Please try again later.",
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="font-display text-3xl text-pine">Community</h1>
        </section>
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <StudentCommunityDesk profile={profile} initialMessages={messages} />
  );
}
