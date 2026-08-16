import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOwnStudentRecord } from "@/app/student/records/actions";
import { StudentRecordsClient } from "@/components/student/student-records";
import { publicActionMessage } from "@/lib/safe-action-message";
import { getSessionStudent } from "@/lib/student/auth";

export const metadata: Metadata = {
  title: "Records | Student Portal",
};

export default async function StudentRecordsPage() {
  const session = await getSessionStudent();
  if (!session) redirect("/login/student");

  let bundle: Awaited<ReturnType<typeof getOwnStudentRecord>> = null;
  let loadError: string | null = null;
  try {
    bundle = await getOwnStudentRecord();
  } catch (error) {
    console.error("student records:", error);
    loadError = publicActionMessage(
      error,
      "Could not load your record. Please try again.",
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <section className="animate-fade-rise mb-4 px-0 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Your path
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.75rem,5.5vw,2.5rem)] tracking-[-0.02em] text-pine">
          Records
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70 sm:mt-1.5">
          Your scorecard — overview, attendance, and exams, one section at a
          time.
        </p>
      </section>

      {loadError ? (
        <p className="border border-red-800/30 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      ) : !bundle ? (
        <p className="border border-dashed border-stone px-4 py-10 text-center text-sm leading-relaxed text-ink/55">
          No scorecard yet. Scores appear here when exams are released or
          attendance is marked.
        </p>
      ) : (
        <StudentRecordsClient bundle={bundle} />
      )}
    </div>
  );
}
