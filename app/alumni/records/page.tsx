import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOwnStudentRecord } from "@/app/student/records/actions";
import { StudentRecordsClient } from "@/components/student/student-records";
import { computeGraduationEligibility } from "@/lib/graduation/eligibility";
import { publicActionMessage } from "@/lib/safe-action-message";
import { getSessionAlumni } from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Records | Alumni Portal",
};

export default async function AlumniRecordsPage() {
  const session = await getSessionAlumni();
  if (!session) redirect("/login/alumni");

  let bundle: Awaited<ReturnType<typeof getOwnStudentRecord>> = null;
  let loadError: string | null = null;
  let graduationEligibility: Awaited<
    ReturnType<typeof computeGraduationEligibility>
  > | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const [recordBundle, eligibility] = await Promise.all([
      getOwnStudentRecord(),
      computeGraduationEligibility(supabase, session.id),
    ]);
    bundle = recordBundle;
    graduationEligibility = eligibility;
  } catch (error) {
    console.error("[alumni/records]", error);
    loadError = publicActionMessage(
      error,
      "Could not load your record. Please try again.",
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <section className="mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Historical scorecard
        </p>
        <h1 className="mt-1.5 font-display text-3xl text-pine">Records</h1>
      </section>

      {loadError ? (
        <p className="border border-red-800/30 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      ) : !bundle ? (
        <p className="border border-dashed border-stone px-4 py-10 text-center text-sm text-ink/55">
          No scorecard on file yet.
        </p>
      ) : (
        <StudentRecordsClient
          bundle={bundle}
          graduationEligibility={graduationEligibility}
        />
      )}
    </div>
  );
}
