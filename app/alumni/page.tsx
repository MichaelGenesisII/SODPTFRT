import Link from "next/link";
import { feeRemaining } from "@/lib/payments/fees";
import { listStudentFeePayments } from "@/lib/payments/service";
import {
  getSessionAlumni,
  getStudentEnrolment,
  studentDisplayName,
} from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AlumniOverviewPage() {
  const profile = await getSessionAlumni();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const [enrolment, fees] = await Promise.all([
    getStudentEnrolment(profile.id),
    listStudentFeePayments(supabase, profile.id).catch(() => []),
  ]);
  const tuition = fees.find((f) => f.fee_type === "tuition");
  const remaining = tuition ? feeRemaining(tuition) : 0;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-display text-3xl text-pine">
          Welcome back, {studentDisplayName(profile).split(" ")[0]}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70">
          Complete any outstanding tuition, review your historical scorecard,
          then contact the desk when you are ready to re-join a cohort.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="border border-stone/80 bg-white/50 p-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Cohort
          </p>
          <p className="mt-2 font-display text-xl text-pine">
            {enrolment?.cohort_label ?? "Not assigned yet"}
          </p>
          {enrolment?.batch_label ? (
            <p className="mt-1 text-sm text-ink/60">
              Batch: {enrolment.batch_label}
            </p>
          ) : null}
        </div>
        <div className="border border-stone/80 bg-white/50 p-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Tuition balance
          </p>
          <p className="mt-2 font-display text-xl text-pine">
            £{remaining.toFixed(2)} remaining
          </p>
          <Link
            href="/alumni/payments"
            prefetch={false}
            className="mt-3 inline-block text-sm font-medium text-pine underline"
          >
            Pay tuition
          </Link>
        </div>
      </section>

      <section className="border border-stone/80 bg-white/50 p-5 text-sm leading-relaxed text-ink/70">
        <p>
          Need to set or reset your password? Use{" "}
          <Link href="/login/alumni" className="font-medium text-pine underline">
            forgot password
          </Link>{" "}
          on the sign-in page with the email from your legacy record.
        </p>
      </section>
    </div>
  );
}
