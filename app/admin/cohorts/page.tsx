import { redirect } from "next/navigation";
import { listBatchesForAdmin, listParishesForAdmin } from "@/app/admin/parishes/actions";
import { listCohortsForAdmin } from "@/app/admin/cohorts/actions";
import { CohortsManager } from "@/components/admin/cohorts-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

export default async function AdminCohortsPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");
  if (!isNationalAdmin(profile)) redirect("/admin");

  const [cohorts, batches, parishes] = await Promise.all([
    listCohortsForAdmin(),
    listBatchesForAdmin(null).catch(() => []),
    listParishesForAdmin().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Programme structure
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Cohorts
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Year → cohort → batch on the Desk. Open Insight for the full placement
          flow and how this differs from the Students Saturday filter.
        </p>
      </section>

      <CohortsManager
        cohorts={cohorts}
        batches={batches}
        parishes={parishes}
      />
    </div>
  );
}
