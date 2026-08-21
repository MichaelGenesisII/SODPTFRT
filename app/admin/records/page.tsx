import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  listBatchesForAdmin,
  listParishesForAdmin,
} from "@/app/admin/parishes/actions";
import { listRecordStudents } from "@/app/admin/records/actions";
import { RecordsManager } from "@/components/admin/records-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Records | School of Disciples Portal",
};

export default async function AdminRecordsPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  let students: Awaited<ReturnType<typeof listRecordStudents>>["items"] = [];
  let parishes: Awaited<ReturnType<typeof listParishesForAdmin>> = [];
  let batches: Awaited<ReturnType<typeof listBatchesForAdmin>> = [];
  let loadError: string | null = null;
  let studentsTotal = 0;

  try {
    const [listed, parishRows, batchRows] = await Promise.all([
      listRecordStudents(
        isNationalAdmin(profile)
          ? { page: 1, pageSize: 50 }
          : { parishId: profile.parish_id ?? undefined, page: 1, pageSize: 50 },
      ),
      listParishesForAdmin(),
      listBatchesForAdmin(
        isNationalAdmin(profile) ? null : profile.parish_id,
      ),
    ]);
    students = listed.items;
    studentsTotal = listed.total;
    parishes = parishRows;
    batches = batchRows;
  } catch (error) {
    console.error("admin records:", error);
    loadError = publicActionMessage(error, publicUnavailableMessage("Records"));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Assessment
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Records
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Per-student scorecards — attendance sessions and exam percentages
          (including which scores count). Parish desks only open students in
          their parish; national desks can filter any parish. Online papers are
          authored and graded on Exams.
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
        <RecordsManager
          profile={profile}
          initialStudents={students}
          initialTotal={studentsTotal}
          parishes={parishes}
          batches={batches}
        />
      )}
    </div>
  );
}
