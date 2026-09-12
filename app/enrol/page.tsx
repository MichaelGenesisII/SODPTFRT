import type { Metadata } from "next";
import { listActiveParishesForEnrol } from "@/app/admin/parishes/actions";
import { listSaturdayCohortsForEnrol } from "@/app/enrol/saturday-actions";
import { EnrolWizard } from "@/components/enrol/enrol-wizard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Enrol | School of Disciples Portal",
  description:
    "Apply for the School of Disciples course — Standard Program or SOD Ignite.",
};

export default async function EnrolPage() {
  const [parishes, saturdayPack] = await Promise.all([
    listActiveParishesForEnrol(),
    listSaturdayCohortsForEnrol(),
  ]);

  return (
    <div className="flex min-h-full flex-col bg-mist text-ink">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-stone px-6 py-12 sm:px-10 sm:py-16 lg:px-12">
          <div className="mx-auto max-w-3xl">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
              Enrolment
            </p>
            <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.25rem)] leading-[1.05] tracking-[-0.02em] text-pine">
              School of Disciples course application
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink/70 sm:text-lg">
              Please answer all questions truthfully. Any false information
              automatically disqualifies an applicant. We only store details
              you provide on this form.
            </p>
          </div>
        </section>

        <section className="px-6 py-10 sm:px-10 sm:py-14 lg:px-12">
          <div className="mx-auto max-w-3xl">
            <EnrolWizard
              parishes={parishes}
              saturdayCohorts={saturdayPack.options}
              intakeContext={saturdayPack.context}
            />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
