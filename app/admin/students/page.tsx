import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listBatchesForAdmin, listParishesForAdmin } from "@/app/admin/parishes/actions";
import { listAdminStudents } from "@/app/admin/students/actions";
import { StudentsManager } from "@/components/admin/students-manager";
import type { AdminStudentRecord } from "@/lib/admin/students";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Students | School of Disciples Portal",
};

export default async function AdminStudentsPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  let students: AdminStudentRecord[] = [];
  let loadError: string | null = null;

  const [studentsResult, parishes, batches] = await Promise.all([
    listAdminStudents()
      .then((rows) => ({ ok: true as const, rows }))
      .catch((error: unknown) => {
        console.error("admin students:", error);
        return {
          ok: false as const,
          message: publicActionMessage(
            error,
            publicUnavailableMessage("Students"),
          ),
        };
      }),
    listParishesForAdmin().catch(() => []),
    listBatchesForAdmin(
      isNationalAdmin(profile) ? null : profile.parish_id,
    ).catch(() => []),
  ]);

  if (studentsResult.ok) {
    students = studentsResult.rows;
  } else {
    loadError = studentsResult.message;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Cohort desk
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Students
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {isNationalAdmin(profile)
            ? "Filter by November, January, or February intake. Select several students for bulk updates, or open a file for full placement and account controls."
            : "Filter by programme intake within your parish. Select several for bulk updates, or open a file for full placement and account controls."}{" "}
          Bank proof review lives on{" "}
          <Link href="/admin/payments" className="font-medium text-pine underline">
            Payments
          </Link>
          .
        </p>
      </section>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="border border-stone bg-mist/40 px-4 py-12 text-center text-sm text-ink/50">
              Loading students…
            </div>
          }
        >
          <StudentsManager
            students={students}
            profile={profile}
            parishes={parishes}
            batches={batches}
          />
        </Suspense>
      )}
    </div>
  );
}
