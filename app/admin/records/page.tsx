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

type Props = {
  searchParams?: Promise<{
    parish?: string;
    batch?: string;
    page?: string;
    q?: string;
  }>;
};

export default async function AdminRecordsPage({ searchParams }: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const params = (await searchParams) ?? {};
  const initialPage = Math.max(1, Number(params.page) || 1);
  const initialParishId =
    params.parish ??
    (isNationalAdmin(profile) ? "" : profile.parish_id ?? "");
  const initialBatchId = params.batch ?? "";

  let students: Awaited<ReturnType<typeof listRecordStudents>>["items"] = [];
  let parishes: Awaited<ReturnType<typeof listParishesForAdmin>> = [];
  let batches: Awaited<ReturnType<typeof listBatchesForAdmin>> = [];
  let loadError: string | null = null;
  let studentsTotal = 0;

  try {
    const [listed, parishRows, batchRows] = await Promise.all([
      listRecordStudents(
        isNationalAdmin(profile)
          ? { page: initialPage, pageSize: 50, parishId: initialParishId || undefined, batchId: initialBatchId || undefined }
          : {
              parishId: profile.parish_id ?? undefined,
              batchId: initialBatchId || undefined,
              page: initialPage,
              pageSize: 50,
            },
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
          Per-student scorecards — attendance from Classes and exam scores from
          released Exams. Open any row for the full card. Online papers are
          authored and graded on Exams; live sessions on Classes.
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
          initialPage={initialPage}
          initialParishId={initialParishId}
          initialBatchId={initialBatchId}
          parishes={parishes}
          batches={batches}
        />
      )}
    </div>
  );
}
