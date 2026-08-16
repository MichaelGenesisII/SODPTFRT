import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listEvaluationAttempts } from "@/app/admin/evaluation/actions";
import { listAdminExams } from "@/app/admin/exams/actions";
import {
  listBatchesForAdmin,
  listParishesForAdmin,
} from "@/app/admin/parishes/actions";
import { ExamsManager } from "@/components/admin/exams-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import { publicActionMessage } from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Exams | School of Disciples Portal",
};

type Props = {
  searchParams?: Promise<{ tab?: string }>;
};

export default async function AdminExamsPage({ searchParams }: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const params = (await searchParams) ?? {};
  const initialTab =
    params.tab === "queue" || params.tab === "evaluation"
      ? "queue"
      : params.tab === "insight"
        ? "insight"
        : params.tab === "samples"
          ? "samples"
          : params.tab === "upload"
            ? "upload"
            : "compose";

  let exams: Awaited<ReturnType<typeof listAdminExams>> = [];
  let attempts: Awaited<ReturnType<typeof listEvaluationAttempts>> = [];
  let parishes: Awaited<ReturnType<typeof listParishesForAdmin>> = [];
  let batches: Awaited<ReturnType<typeof listBatchesForAdmin>> = [];
  let loadError: string | null = null;

  try {
    [exams, attempts, parishes, batches] = await Promise.all([
      listAdminExams(),
      listEvaluationAttempts(),
      listParishesForAdmin(),
      listBatchesForAdmin(
        isNationalAdmin(profile) ? null : profile.parish_id,
      ),
    ]);
  } catch (error) {
    console.error("[admin/exams page]", error);
    loadError = publicActionMessage(
      error,
      "Exams are temporarily unavailable. Please try again later.",
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Assessment
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Exams
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Build papers in Compose, import finished files on Upload, or download
          ready-made tests from Samples. Grade and release in Queue. Parish desks
          only manage exams for their parish; national desks can publish UK-wide.
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
        <ExamsManager
          profile={profile}
          exams={exams}
          attempts={attempts}
          parishes={parishes}
          batches={batches}
          initialTab={initialTab}
        />
      )}
    </div>
  );
}
