import { redirect } from "next/navigation";
import {
  listBatchesForAdmin,
  listParishesForAdmin,
} from "@/app/admin/parishes/actions";
import { ParishesManager } from "@/components/admin/parishes-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import { parishAdminEnabled } from "@/lib/admin/features";

export default async function AdminParishesPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  // National desk always manages the UK church list (enrol master data).
  // Parish desks only when PARISH_ADMIN_ENABLED is on.
  if (!isNationalAdmin(profile) && !parishAdminEnabled()) {
    redirect("/admin");
  }

  const [parishes, batches] = await Promise.all([
    listParishesForAdmin(),
    listBatchesForAdmin(isNationalAdmin(profile) ? null : profile.parish_id),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          {isNationalAdmin(profile) ? "UK network" : "Your parish"}
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Parishes & batches
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {isNationalAdmin(profile)
            ? "Add churches, open course runs, and control what appears on the enrol form."
            : "Manage batches for your parish — open or close enrolment on the form."}
        </p>
      </section>

      <ParishesManager
        profile={profile}
        parishes={parishes}
        batches={batches}
      />
    </div>
  );
}
