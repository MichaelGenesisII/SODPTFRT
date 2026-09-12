import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listStudentExams } from "@/app/exam/actions";
import { StudentExamsClient } from "@/components/student/student-exams";
import { publicActionMessage } from "@/lib/safe-action-message";
import { getSessionStudent } from "@/lib/student/auth";

export const metadata: Metadata = {
  title: "Exams | Student Portal",
};

export default async function StudentExamsPage() {
  const session = await getSessionStudent();
  if (!session) redirect("/login/student");

  let exams: Awaited<ReturnType<typeof listStudentExams>> = [];
  let loadError: string | null = null;
  try {
    exams = await listStudentExams();
  } catch (error) {
    console.error("[student/exams]", error);
    loadError = publicActionMessage(
      error,
      "Exams are temporarily unavailable. Please try again later.",
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Assessment
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.75rem,5.5vw,2.5rem)] tracking-[-0.02em] text-pine">
          Your exams
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70 sm:mt-1.5">
          Available, in progress, and finished sittings — one section at a time.
        </p>
      </section>

      {loadError ? (
        <p className="border border-red-800/30 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      ) : exams.length === 0 ? (
        <p className="border border-dashed border-stone px-4 py-10 text-center text-sm leading-relaxed text-ink/55">
          No exams available for you right now.
        </p>
      ) : (
        <StudentExamsClient exams={exams} />
      )}
    </div>
  );
}
