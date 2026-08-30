import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getAdminCampaignById,
  listCampaignRecipients,
} from "@/app/admin/campaigns/actions";
import { listCohortsForAdmin } from "@/app/admin/cohorts/actions";
import {
  listBatchesForAdmin,
  listParishesForAdmin,
} from "@/app/admin/parishes/actions";
import { CampaignDetailWorkspace } from "@/components/admin/campaign-detail-workspace";
import { campaignListLabel } from "@/lib/admin/campaign-records";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getAdminCampaignById(id).catch(() => null);
  const title = detail
    ? `${campaignListLabel(detail.campaign)} | Campaigns | School of Disciples Portal`
    : "Campaigns | School of Disciples Portal";
  return { title };
}

export default async function AdminCampaignDetailPage({
  params,
  searchParams,
}: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const backHref = sp.from
    ? `/admin/campaigns?${sp.from}`
    : "/admin/campaigns";

  let detail: Awaited<ReturnType<typeof getAdminCampaignById>> = null;
  let recipients: Awaited<ReturnType<typeof listCampaignRecipients>> = [];
  let parishes: Awaited<ReturnType<typeof listParishesForAdmin>> = [];
  let batches: Awaited<ReturnType<typeof listBatchesForAdmin>> = [];
  let cohorts: Awaited<ReturnType<typeof listCohortsForAdmin>> = [];
  let loadError: string | null = null;

  try {
    const [campaignDetail, recipientRows, parishRows, batchRows, cohortRows] =
      await Promise.all([
        getAdminCampaignById(id),
        listCampaignRecipients({ activeOnly: true }),
        listParishesForAdmin(),
        listBatchesForAdmin(
          isNationalAdmin(profile) ? null : profile.parish_id,
        ),
        listCohortsForAdmin(),
      ]);
    detail = campaignDetail;
    recipients = recipientRows;
    parishes = parishRows;
    batches = batchRows;
    cohorts = cohortRows;
  } catch (error) {
    console.error("[admin/campaigns/detail]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Campaigns"),
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl">
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Marketing desk · Campaign file
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.5rem,4vw,2.2rem)] tracking-[-0.02em] text-pine">
          {campaignListLabel(detail.campaign)}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Edit audience and message, preview with sample data, save your draft,
          then send when ready.
        </p>
      </section>

      <CampaignDetailWorkspace
        initialDetail={detail}
        recipients={recipients}
        profile={profile}
        parishes={parishes}
        batches={batches}
        cohorts={cohorts}
        backHref={backHref}
      />
    </div>
  );
}
