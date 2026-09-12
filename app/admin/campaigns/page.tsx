import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  listAdminCampaigns,
} from "@/app/admin/campaigns/actions";
import { CampaignsManager } from "@/components/admin/campaigns-manager";
import { getSessionAdmin } from "@/lib/admin/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Email campaigns | School of Disciples Portal",
};

export default async function AdminCampaignsPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  let campaigns: Awaited<ReturnType<typeof listAdminCampaigns>> = [];
  let loadError: string | null = null;

  try {
    campaigns = await listAdminCampaigns();
  } catch (error) {
    console.error("admin campaigns:", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Campaigns"),
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Marketing desk
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Email campaigns
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Create a campaign draft, open it to choose recipients and compose your
          message, then preview and send. Batches are rate-limited so SMTP stays
          healthy.
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
        <CampaignsManager campaigns={campaigns} />
      )}
    </div>
  );
}
