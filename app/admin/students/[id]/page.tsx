import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listBatchesForAdmin, listParishesForAdmin } from "@/app/admin/parishes/actions";
import { getAdminStudentById, listSaturdayCohortsForPlacement } from "@/app/admin/students/actions";
import { StudentDetailWorkspace } from "@/components/admin/student-detail-workspace";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import { studentFullName } from "@/lib/admin/students";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getAdminStudentById(id).catch(() => null);
  const title =
    result?.ok === true
      ? `${studentFullName(result.student)} | Students | School of Disciples Portal`
      : "Student | School of Disciples Portal";
  return { title };
}

export default async function AdminStudentDetailPage({
  params,
  searchParams,
}: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const backHref = sp.from
    ? `/admin/students?${sp.from}`
    : "/admin/students";
  const [result, parishes, batches] = await Promise.all([
    getAdminStudentById(id),
    listParishesForAdmin().catch(() => []),
    listBatchesForAdmin(
      isNationalAdmin(profile) ? null : profile.parish_id,
    ).catch(() => []),
  ]);

  if (!result.ok) {
    notFound();
  }

  const student = result.student;
  const saturdayOptions = student.enrolment?.cohort_id
    ? await listSaturdayCohortsForPlacement(student.enrolment.cohort_id)
    : [];

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Cohort desk · Student file
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.5rem,4vw,2.2rem)] tracking-[-0.02em] text-pine">
          {studentFullName(student)}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Full application, path, placement, and account controls. Use Scorecard
          or Payments above for this student&apos;s record or bank proof.{" "}
          <Link href={backHref} className="font-medium text-pine underline">
            Back to the student list
          </Link>
          .
        </p>
      </section>

      <StudentDetailWorkspace
        student={student}
        profile={profile}
        parishes={parishes}
        batches={batches}
        saturdayOptions={saturdayOptions}
        backHref={backHref}
      />
    </div>
  );
}
