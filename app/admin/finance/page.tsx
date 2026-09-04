import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Finance | School of Disciples Portal",
};

export default async function AdminFinancePage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");
  if (!isNationalAdmin(profile)) redirect("/admin");

  return (
    <div className="mx-auto max-w-4xl">
      <section className="mb-8">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          National desk
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Finance
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Session pay for teachers — based on confirmed teaching, not Zoom hosts.
          Student programme fees stay on Payments. Teacher accounts live under
          Access.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/access?staff=teachers"
          className="border border-stone bg-mist/40 px-5 py-5 transition-colors hover:border-pine/40"
        >
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Access
          </p>
          <h2 className="mt-2 font-display text-xl text-pine">Teachers</h2>
          <p className="mt-2 text-sm text-ink/60">
            Invite and manage teacher portal accounts on the Access desk.
          </p>
        </Link>
        <div className="border border-dashed border-stone px-5 py-5 opacity-70">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/40">
            Coming next
          </p>
          <h2 className="mt-2 font-display text-xl text-pine/70">Rates & periods</h2>
          <p className="mt-2 text-sm text-ink/50">
            Pay rates, period totals, and CSV export land in Phase 2.
          </p>
        </div>
      </div>
    </div>
  );
}
