import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminExam } from "@/app/admin/exams/actions";
import {
  listBatchesForAdmin,
  listParishesForAdmin,
} from "@/app/admin/parishes/actions";
import { ExamDetailWorkspace } from "@/components/admin/exam-detail-workspace";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const loaded = await getAdminExam(id).catch(() => null);
  const title = loaded
    ? `${loaded.exam.title} | Exams | School of Disciples Portal`
    : "Exams | School of Disciples Portal";
  return { title };
}

export default async function AdminExamDetailPage({
  params,
  searchParams,
}: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const backHref = sp.from
    ? `/admin/exams?${sp.from}`
    : "/admin/exams";

  let detail: Awaited<ReturnType<typeof getAdminExam>> = null;
  let parishes: Awaited<ReturnType<typeof listParishesForAdmin>> = [];
  let batches: Awaited<ReturnType<typeof listBatchesForAdmin>> = [];
  let loadError: string | null = null;

  try {
    const [examDetail, parishRows, batchRows] = await Promise.all([
      getAdminExam(id),
      listParishesForAdmin(),
      listBatchesForAdmin(
        isNationalAdmin(profile) ? null : profile.parish_id,
      ),
    ]);
    detail = examDetail;
    parishes = parishRows;
    batches = batchRows;
  } catch (error) {
    console.error("[admin/exams/detail]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Exams"),
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl">
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  const { exam } = detail;

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Assessment · Exam file
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.5rem,4vw,2.2rem)] tracking-[-0.02em] text-pine">
          {exam.title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {exam.status} · {exam.audience} · {exam.duration_minutes} min · pass{" "}
          {exam.pass_percent}% · {detail.questions.length} questions
          {exam.batch_name ? ` · ${exam.batch_name}` : ""}
          {" · "}
          <Link
            href={backHref}
            className="font-medium text-pine underline decoration-pine/25"
          >
            All exams
          </Link>
        </p>
      </section>

      <ExamDetailWorkspace
        initialDetail={detail}
        profile={profile}
        parishes={parishes}
        batches={batches}
        backHref={backHref}
      />
    </div>
  );
}
