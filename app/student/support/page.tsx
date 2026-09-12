import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listStudentConversations } from "@/app/student/support/actions";
import { StudentSupportDesk } from "@/components/student/student-support";
import { getSessionStudent } from "@/lib/student/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import type { TicketWithMeta } from "@/lib/tickets";

export const metadata: Metadata = {
  title: "Support | Student Portal",
  description:
    "Chat with the School of Disciples Listening Desk from your student portal.",
};

export default async function StudentSupportPage() {
  const profile = await getSessionStudent();
  if (!profile) redirect("/login/student");

  let conversations: TicketWithMeta[] = [];
  let loadError: string | null = null;

  try {
    conversations = await listStudentConversations();
  } catch (error) {
    console.error("student/support load:", error);
    loadError = publicActionMessage(
      error,
      "Support is temporarily unavailable. Please try again later.",
    );
  }

  return loadError ? (
    <div className="mx-auto max-w-2xl">
      <section className="mb-6">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Listening Desk
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.85rem,4vw,2.4rem)] tracking-[-0.02em] text-pine">
          Support
        </h1>
      </section>
      <div
        className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
        role="alert"
      >
        {loadError}
      </div>
    </div>
  ) : (
    <StudentSupportDesk profile={profile} conversations={conversations} />
  );
}
