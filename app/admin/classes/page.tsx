import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  listAdminClasses,
  meetingSdkIntegrationReady,
  zoomIntegrationReady,
} from "@/app/admin/classes/actions";
import {
  listBatchesForAdmin,
  listParishesForAdmin,
} from "@/app/admin/parishes/actions";
import { listCohortsForAdmin } from "@/app/admin/cohorts/actions";
import { ClassesManager } from "@/components/admin/classes-manager";
import type { ZoomClass } from "@/lib/classes/types";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import { listActiveTeachersForAssign } from "@/app/admin/finance/teachers/actions";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Classes | School of Disciples Portal",
};

export default async function AdminClassesPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  let classes: ZoomClass[] = [];
  let loadError: string | null = null;
  let zoomReady = false;
  let meetingSdkReady = false;
  let parishes: Awaited<ReturnType<typeof listParishesForAdmin>> = [];
  let batches: Awaited<ReturnType<typeof listBatchesForAdmin>> = [];
  let cohorts: Awaited<ReturnType<typeof listCohortsForAdmin>> = [];
  let teachers: Awaited<ReturnType<typeof listActiveTeachersForAssign>> = [];

  try {
    const [
      classRows,
      zoomOk,
      sdkOk,
      parishRows,
      batchRows,
      cohortRows,
      teacherRows,
    ] = await Promise.all([
      listAdminClasses(),
      zoomIntegrationReady(),
      meetingSdkIntegrationReady(),
      listParishesForAdmin().catch(() => []),
      listBatchesForAdmin(
        isNationalAdmin(profile) ? null : profile.parish_id,
      ).catch(() => []),
      isNationalAdmin(profile)
        ? listCohortsForAdmin().catch(() => [])
        : Promise.resolve([]),
      listActiveTeachersForAssign().catch(() => []),
    ]);
    classes = classRows;
    zoomReady = zoomOk;
    meetingSdkReady = sdkOk;
    parishes = parishRows;
    batches = batchRows;
    cohorts = cohortRows;
    teachers = teacherRows;
  } catch (error) {
    console.error("admin classes:", error);
    loadError = publicActionMessage(error, publicUnavailableMessage("Classes"));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Live hall
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Classes
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Browse scheduled sessions on the Desk. Open any row for the class file
          — attendance, Zoom host, exports, and student links live there.
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
        <ClassesManager
          profile={profile}
          classes={classes}
          parishes={parishes}
          batches={batches}
          cohorts={cohorts}
          teachers={teachers}
          zoomReady={zoomReady}
        />
      )}
    </div>
  );
}
