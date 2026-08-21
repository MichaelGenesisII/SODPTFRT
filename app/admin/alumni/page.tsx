import { redirect } from "next/navigation";
import { listAlumniStudents } from "@/app/admin/alumni/actions";
import { listCohortsForAdmin } from "@/app/admin/cohorts/actions";
import { AlumniManager } from "@/components/admin/alumni-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

export default async function AdminAlumniPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");
  if (!isNationalAdmin(profile)) redirect("/admin");

  const [alumni, cohorts] = await Promise.all([
    listAlumniStudents().catch(() => []),
    listCohortsForAdmin().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Legacy cohort
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Alumni
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Import the legacy Excel workbook, then help alumni complete tuition and
          re-join a batch. They sign in at the alumni portal and use forgot
          password to set a new password.
        </p>
      </section>

      <AlumniManager alumni={alumni} cohorts={cohorts} />
    </div>
  );
}
