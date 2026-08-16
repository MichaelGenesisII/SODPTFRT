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
import { ClassesManager } from "@/components/admin/classes-manager";
import type { ZoomClass } from "@/lib/classes/types";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
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

  try {
    [classes, zoomReady, meetingSdkReady] = await Promise.all([
      listAdminClasses(),
      zoomIntegrationReady(),
      meetingSdkIntegrationReady(),
    ]);
  } catch (error) {
    console.error("admin classes:", error);
    loadError = publicActionMessage(error, publicUnavailableMessage("Classes"));
  }

  const [parishes, batches] = await Promise.all([
    listParishesForAdmin().catch(() => []),
    listBatchesForAdmin(
      isNationalAdmin(profile) ? null : profile.parish_id,
    ).catch(() => []),
  ]);

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
          Schedule sessions, email the cohort, host Zoom in the portal or the
          Zoom app, then mark attendance onto Records. Parish desks only manage
          classes for their parish; national desks can schedule everyone.
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
          zoomReady={zoomReady}
          meetingSdkReady={meetingSdkReady}
        />
      )}
    </div>
  );
}
