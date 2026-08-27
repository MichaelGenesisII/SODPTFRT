import { redirect } from "next/navigation";
import {
  listLegacyAlumni,
  searchLegacyAlumniAction,
} from "@/app/admin/alumni/actions";
import { listCohortsForAdmin } from "@/app/admin/cohorts/actions";
import { AlumniManager } from "@/components/admin/alumni-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

export default async function AdminAlumniPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");
  if (!isNationalAdmin(profile)) redirect("/admin");

  const [register, cohorts] = await Promise.all([
    listLegacyAlumni({ limit: 120 }).catch(() => ({
      rows: [],
      total: 0,
      batchYears: [] as number[],
      stats: { total: 0, awaitingEmail: 0, portalReady: 0 },
    })),
    listCohortsForAdmin().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          National desk
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Alumni register
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Browse graduating batches by name or centre, review marks and
          attendance from the import sheets, then assign an email when someone
          is ready for the alumni portal.
        </p>
      </section>

      <AlumniManager
        initialRows={register.rows}
        initialTotal={register.total}
        batchYears={register.batchYears}
        stats={register.stats}
        cohorts={cohorts}
        onSearch={searchLegacyAlumniAction}
      />
    </div>
  );
}
