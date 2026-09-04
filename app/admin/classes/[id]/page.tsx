import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getAdminClassById,
  getClassAttendanceRollup,
  meetingSdkIntegrationReady,
  zoomIntegrationReady,
} from "@/app/admin/classes/actions";
import { listActiveTeachersForAssign } from "@/app/admin/finance/teachers/actions";
import { ClassDetailWorkspace } from "@/components/admin/class-detail-workspace";
import {
  audienceLabel,
  formatClassScheduleRange,
} from "@/lib/classes/types";
import { getSessionAdmin } from "@/lib/admin/auth";
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
  const klass = await getAdminClassById(id).catch(() => null);
  const title = klass
    ? `${klass.title} | Classes | School of Disciples Portal`
    : "Classes | School of Disciples Portal";
  return { title };
}

export default async function AdminClassDetailPage({
  params,
  searchParams,
}: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const backHref = sp.from
    ? `/admin/classes?${sp.from}`
    : "/admin/classes";

  let klass: Awaited<ReturnType<typeof getAdminClassById>> = null;
  let rollup: Awaited<ReturnType<typeof getClassAttendanceRollup>> = null;
  let loadError: string | null = null;
  let zoomReady = false;
  let meetingSdkReady = false;
  let teachers: Awaited<ReturnType<typeof listActiveTeachersForAssign>> = [];

  try {
    const [classRow, roll, zoomOk, sdkOk, teacherRows] = await Promise.all([
      getAdminClassById(id),
      getClassAttendanceRollup(id),
      zoomIntegrationReady(),
      meetingSdkIntegrationReady(),
      listActiveTeachersForAssign().catch(() => []),
    ]);
    klass = classRow;
    rollup = roll;
    zoomReady = zoomOk;
    meetingSdkReady = sdkOk;
    teachers = teacherRows;
  } catch (error) {
    console.error("[admin/classes/detail]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Classes"),
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

  if (!klass || !rollup) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Live hall · Class file
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.5rem,4vw,2.2rem)] tracking-[-0.02em] text-pine">
          {klass.title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {formatClassScheduleRange(klass.scheduled_start, klass.scheduled_end)}
          {" · "}
          {audienceLabel(
            klass.audience,
            klass.parish_name,
            klass.batch_name,
            klass.cohort_name,
            klass.year,
          )}
          {klass.primary_teacher_name
            ? ` · Teacher · ${klass.primary_teacher_name}`
            : " · Needs teacher"}
          {" · "}
          <Link
            href={backHref}
            className="font-medium text-pine underline decoration-pine/25"
          >
            All classes
          </Link>
        </p>
      </section>

      <ClassDetailWorkspace
        initialClass={klass}
        initialRollup={rollup}
        teachers={teachers}
        backHref={backHref}
        zoomReady={zoomReady}
        meetingSdkReady={meetingSdkReady}
      />
    </div>
  );
}
