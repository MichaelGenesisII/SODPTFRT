import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  listLegacyAlumni,
  listAlumniLegacyBatchYears,
  listAlumniLegacyRegisterStats,
  searchLegacyAlumniAction,
} from "@/app/admin/alumni/actions";
import { listCohortsForAdmin } from "@/app/admin/cohorts/actions";
import { AlumniManager } from "@/components/admin/alumni-manager";
import { parseAlumniListQuery } from "@/lib/admin/alumni-desk";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Alumni | School of Disciples Portal",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function searchParamsToQuery(
  sp: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function AdminAlumniPage({ searchParams }: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");
  if (!isNationalAdmin(profile)) redirect("/admin");

  const sp = await searchParams;
  const listState = parseAlumniListQuery(searchParamsToQuery(sp));

  const [register, cohorts, batchYears, stats] = await Promise.all([
    listLegacyAlumni({
      query: listState.query,
      batchYear: listState.batchYear,
      portal: listState.portal,
      page: listState.page,
      includeMeta: false,
    }).catch(() => ({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 12,
      batchYears: [] as number[],
      stats: { total: 0, awaitingEmail: 0, portalReady: 0 },
    })),
    listCohortsForAdmin().catch(() => []),
    listAlumniLegacyBatchYears().catch(() => [] as number[]),
    listAlumniLegacyRegisterStats().catch(() => ({
      total: 0,
      awaitingEmail: 0,
      portalReady: 0,
    })),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          National desk
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Alumni register
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Browse graduating batches by name or centre, then open an alumni file
          to review marks, attendance, and portal access. The list is view-only
          — assign email and manage accounts on the alumni file page.
        </p>
      </section>

      <Suspense fallback={null}>
        <AlumniManager
          initialRows={register.rows}
          initialTotal={register.total}
          batchYears={batchYears}
          stats={stats}
          cohorts={cohorts}
          onSearch={searchLegacyAlumniAction}
        />
      </Suspense>
    </div>
  );
}
