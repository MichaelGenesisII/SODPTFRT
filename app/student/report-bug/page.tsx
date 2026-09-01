import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SupportForm } from "@/components/support/support-form";
import { WhatsAppChatLink } from "@/components/support/whatsapp-chat-link";
import { getSessionStudent, studentDisplayName } from "@/lib/student/auth";

export const metadata: Metadata = {
  title: "Report a bug | Student Portal",
  description:
    "Tell the Listening Desk when something in the student portal is not working as expected.",
};

export default async function StudentReportBugPage() {
  const student = await getSessionStudent();
  if (!student) redirect("/login/student");

  return (
    <div className="mx-auto max-w-2xl">
      <section className="mb-6">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Listening Desk
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.85rem,4vw,2.4rem)] tracking-[-0.02em] text-pine">
          Report a bug
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink/65">
          Something broken or confusing in the portal? Send a short note with
          what you were trying to do and what happened instead. For general
          questions, use{" "}
          <Link href="/student/support" className="font-medium text-pine underline">
            Support
          </Link>
          .
        </p>
        <p className="mt-3 text-sm text-ink/60">
          Prefer a quick chat?{" "}
          <WhatsAppChatLink className="inline-flex items-center gap-1.5 font-medium text-pine underline decoration-pine/30 underline-offset-4" />
        </p>
      </section>

      <div className="border border-stone bg-mist/50 px-5 py-7 sm:px-8">
        <SupportForm
          prefill={{
            name: studentDisplayName(student),
            email: student.email,
            signedInStudent: true,
          }}
          defaultTopic="Report a bug"
          intakeSource="portal"
        />
      </div>
    </div>
  );
}
