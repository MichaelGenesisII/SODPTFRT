import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  listBatchesForAdmin,
  listParishesForAdmin,
} from "@/app/admin/parishes/actions";
import { listCampaignRecipients } from "@/app/admin/campaigns/actions";
import { CampaignsManager } from "@/components/admin/campaigns-manager";
import type { CampaignRecipient } from "@/lib/email/campaigns";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Email campaigns | School of Disciples Portal",
};

export default async function AdminCampaignsPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  let recipients: CampaignRecipient[] = [];
  let loadError: string | null = null;

  try {
    recipients = await listCampaignRecipients({ activeOnly: true });
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Could not load recipients.";
  }

  const [parishes, batches] = await Promise.all([
    listParishesForAdmin().catch(() => []),
    listBatchesForAdmin(
      isNationalAdmin(profile) ? null : profile.parish_id,
    ).catch(() => []),
  ]);

  const national = isNationalAdmin(profile);

  return (
    <div className="mx-auto max-w-5xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Marketing desk
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Email campaigns
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {national
            ? "Compose and send student emails across the UK network. Batches are rate-limited (40 per request, ~120 / 15 min) so SMTP stays healthy."
            : "Compose and send emails to students enrolled in your parish only. Batches are rate-limited so SMTP stays healthy."}
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
        <CampaignsManager
          recipients={recipients}
          profile={profile}
          parishes={parishes}
          batches={batches}
        />
      )}
    </div>
  );
}
