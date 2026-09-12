import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRecordBundleForUser } from "@/app/admin/records/actions";
import { RecordDetailWorkspace } from "@/components/admin/record-detail-workspace";
import { getSessionAdmin } from "@/lib/admin/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

type Props = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const loaded = await getRecordBundleForUser(userId).catch(() => null);
  const title = loaded
    ? `${loaded.bundle.record.student_name} | Records | School of Disciples Portal`
    : "Records | School of Disciples Portal";
  return { title };
}

export default async function AdminRecordDetailPage({
  params,
  searchParams,
}: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const [{ userId }, sp] = await Promise.all([params, searchParams]);
  const backHref = sp.from?.startsWith("student:")
    ? `/admin/students/${sp.from.slice("student:".length)}`
    : sp.from
      ? `/admin/records?${sp.from}`
      : "/admin/records";

  let loaded: Awaited<ReturnType<typeof getRecordBundleForUser>> = null;
  let loadError: string | null = null;

  try {
    loaded = await getRecordBundleForUser(userId);
  } catch (error) {
    console.error("[admin/records/detail]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Records"),
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

  if (!loaded) {
    notFound();
  }

  const { bundle, recordId } = loaded;

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Assessment · Scorecard
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.5rem,4vw,2.2rem)] tracking-[-0.02em] text-pine">
          {bundle.record.student_name}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Exam avg{" "}
          {bundle.average != null ? `${bundle.average}%` : "—"}
          {" · "}
          Attendance{" "}
          {bundle.attendance != null ? `${bundle.attendance}%` : "—"}
          {bundle.record.batch_name ? ` · ${bundle.record.batch_name}` : ""}
          {" · "}
          <Link
            href={backHref}
            className="font-medium text-pine underline decoration-pine/25"
          >
            All records
          </Link>
        </p>
      </section>

      <RecordDetailWorkspace
        initialBundle={bundle}
        recordId={recordId}
        backHref={backHref}
      />
    </div>
  );
}
