"use server";

import { revalidatePath } from "next/cache";
import type { AdminCampaignRecord } from "@/lib/admin/campaign-records";
import {
  CAMPAIGN_BATCH_SIZE,
  CAMPAIGN_MAX_ATTACHMENTS,
  type CampaignPaymentLane,
  type CampaignRecipient,
} from "@/lib/email/campaigns";
import {
  portalBaseUrl,
  sendCampaignEmail,
} from "@/lib/email/backend";
import {
  campaignUnsubscribeOneClickUrl,
  campaignUnsubscribeUrl,
} from "@/lib/email/unsubscribe";
import {
  loadCampaignAttachmentPayload,
  purgeDeskAttachments,
} from "@/app/admin/desk-attachments/actions";
import { isNationalAdmin, requireSessionAdmin } from "@/lib/admin/auth";
import { SOD_SITE } from "@/lib/site-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { publicActionMessage } from "@/lib/safe-action-message";

export type CampaignActionResult = {
  ok: boolean;
  message: string;
  sent?: number;
  failed?: number;
  remaining?: number;
  campaignId?: string;
};

export type AdminCampaignListItem = Pick<
  AdminCampaignRecord,
  | "id"
  | "title"
  | "status"
  | "subject"
  | "recipient_ids"
  | "sent_count"
  | "failed_count"
  | "sent_at"
  | "updated_at"
  | "created_at"
>;

export type AdminCampaignDetail = {
  campaign: AdminCampaignRecord;
  attachments: {
    id: string;
    original_name: string;
    byte_size: number;
    mime: string;
  }[];
};

function revalidateCampaigns(campaignId?: string) {
  revalidatePath("/admin/campaigns");
  if (campaignId) {
    revalidatePath(`/admin/campaigns/${campaignId}`);
  }
}

function mapCampaignRow(row: Record<string, unknown>): AdminCampaignRecord {
  const slot = row.filter_saturday;
  const payment = row.filter_payment;
  return {
    id: row.id as string,
    title: (row.title as string) ?? "Untitled campaign",
    status: row.status === "sent" ? "sent" : "draft",
    subject: (row.subject as string) ?? "",
    headline: (row.headline as string) ?? "",
    body: (row.body as string) ?? "",
    personal_note: (row.personal_note as string | null) ?? null,
    filter_parish_id: (row.filter_parish_id as string | null) ?? null,
    filter_cohort_id: (row.filter_cohort_id as string | null) ?? null,
    filter_batch_id: (row.filter_batch_id as string | null) ?? null,
    filter_saturday:
      slot === 1 || slot === 2 || slot === 3 || slot === 4 ? slot : null,
    filter_payment:
      payment === "unpaid" ||
      payment === "pending_review" ||
      payment === "paid"
        ? payment
        : "all",
    recipient_ids: (row.recipient_ids as string[]) ?? [],
    attachment_ids: (row.attachment_ids as string[]) ?? [],
    parish_id: (row.parish_id as string | null) ?? null,
    sent_at: (row.sent_at as string | null) ?? null,
    sent_count: Number(row.sent_count ?? 0),
    failed_count: Number(row.failed_count ?? 0),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function isPaymentLane(value: string): value is CampaignPaymentLane {
  return (
    value === "all" ||
    value === "unpaid" ||
    value === "pending_review" ||
    value === "paid"
  );
}

async function requireAccessibleCampaign(campaignId: string): Promise<
  | { ok: true; campaign: AdminCampaignRecord }
  | { ok: false; message: string }
> {
  const actor = await requireSessionAdmin();
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    console.error("[campaigns/load]", error.message);
    return {
      ok: false,
      message: publicActionMessage(error.message, "Campaign not found."),
    };
  }
  if (!data) {
    return { ok: false, message: "Campaign not found." };
  }

  const campaign = mapCampaignRow(data as Record<string, unknown>);
  if (!isNationalAdmin(actor) && actor.parish_id) {
    if (campaign.parish_id !== actor.parish_id) {
      return { ok: false, message: "Outside your parish scope." };
    }
  }

  return { ok: true, campaign };
}

async function loadCampaignAttachments(ids: string[]) {
  if (!ids.length) return [];
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("desk_attachments")
    .select("id, original_name, byte_size, mime")
    .in("id", ids);

  if (error) {
    console.error("[campaigns/attachments]", error.message);
    return [];
  }
  return (data ?? []) as AdminCampaignDetail["attachments"];
}

export async function listAdminCampaigns(): Promise<AdminCampaignListItem[]> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("email_campaigns")
    .select(
      "id, title, status, subject, recipient_ids, sent_count, failed_count, sent_at, updated_at, created_at",
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (!isNationalAdmin(actor) && actor.parish_id) {
    query = query.eq("parish_id", actor.parish_id);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[campaigns/list]", error.message);
    throw new Error(
      publicActionMessage(error, "Could not load campaigns."),
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? "Untitled campaign",
    status: row.status === "sent" ? "sent" : "draft",
    subject: (row.subject as string) ?? "",
    recipient_ids: (row.recipient_ids as string[]) ?? [],
    sent_count: Number(row.sent_count ?? 0),
    failed_count: Number(row.failed_count ?? 0),
    sent_at: (row.sent_at as string | null) ?? null,
    updated_at: row.updated_at as string,
    created_at: row.created_at as string,
  }));
}

export async function getAdminCampaignById(
  campaignId: string,
): Promise<AdminCampaignDetail | null> {
  const access = await requireAccessibleCampaign(campaignId);
  if (!access.ok) return null;
  const attachments = await loadCampaignAttachments(access.campaign.attachment_ids);
  return { campaign: access.campaign, attachments };
}

export async function createCampaign(): Promise<CampaignActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const service = createServiceSupabaseClient();
    const now = new Date().toISOString();

    const { data, error } = await service
      .from("email_campaigns")
      .insert({
        title: "Untitled campaign",
        parish_id: isNationalAdmin(actor) ? null : actor.parish_id,
        created_by: actor.id,
        updated_by: actor.id,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[campaigns/create]", error.message);
      return {
        ok: false,
        message: publicActionMessage(error.message, "Could not create campaign."),
      };
    }

    revalidateCampaigns(data.id as string);
    return {
      ok: true,
      message: "Draft campaign created.",
      campaignId: data.id as string,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Unauthorized." };
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}

export async function saveCampaignDraft(input: {
  campaignId: string;
  title?: string;
  subject: string;
  headline?: string;
  body: string;
  personalNote?: string;
  filterParishId?: string;
  filterCohortId?: string;
  filterBatchId?: string;
  filterSaturday?: 1 | 2 | 3 | 4 | null;
  filterPayment?: CampaignPaymentLane;
  recipientIds: string[];
  attachmentIds: string[];
}): Promise<CampaignActionResult> {
  try {
    const access = await requireAccessibleCampaign(input.campaignId);
    if (!access.ok) return { ok: false, message: access.message };
    if (access.campaign.status === "sent") {
      return { ok: false, message: "Sent campaigns cannot be edited." };
    }

    const subject = input.subject.trim();
    const body = input.body.trim();
    if (!subject || !body) {
      return { ok: false, message: "Campaigns need a subject and body." };
    }

    const payment = input.filterPayment ?? "all";
    if (!isPaymentLane(payment)) {
      return { ok: false, message: "Invalid payment filter." };
    }

    const attachmentIds = [
      ...new Set(
        (input.attachmentIds ?? []).map((id) => id.trim()).filter(Boolean),
      ),
    ];
    if (attachmentIds.length > CAMPAIGN_MAX_ATTACHMENTS) {
      return {
        ok: false,
        message: `Attach at most ${CAMPAIGN_MAX_ATTACHMENTS} files per campaign.`,
      };
    }

    const recipientIds = [...new Set(input.recipientIds.filter(Boolean))];
    const actor = await requireSessionAdmin();
    const titleInput = input.title?.trim();
    const title =
      titleInput ||
      (subject.slice(0, 120) || access.campaign.title || "Untitled campaign");

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("email_campaigns")
      .update({
        title,
        subject,
        headline: input.headline?.trim() ?? "",
        body,
        personal_note: input.personalNote?.trim() || null,
        filter_parish_id: input.filterParishId || null,
        filter_cohort_id: input.filterCohortId || null,
        filter_batch_id: input.filterBatchId || null,
        filter_saturday: input.filterSaturday ?? null,
        filter_payment: payment,
        recipient_ids: recipientIds,
        attachment_ids: attachmentIds,
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.campaignId);

    if (error) {
      console.error("[campaigns/save]", error.message);
      return {
        ok: false,
        message: publicActionMessage(error.message, "Could not save campaign."),
      };
    }

    revalidateCampaigns(input.campaignId);
    return { ok: true, message: "Campaign saved.", campaignId: input.campaignId };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Unauthorized." };
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}

export async function listCampaignRecipients(filters?: {
  parishId?: string;
  batchId?: string;
  activeOnly?: boolean;
  unpaidOnly?: boolean;
}): Promise<CampaignRecipient[]> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();

  let parishFilter = filters?.parishId ?? "";
  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) return [];
    parishFilter = actor.parish_id;
  }

  let enrolQ = supabase
    .from("enrolments")
    .select(
      "user_id, first_name, last_name, email, parish_id, batch_id, cohort_id, payment_status, created_at, parishes(name), batches(name), cohorts(name, year_start, year_end), saturday_cohorts(saturday_slot)",
    )
    .order("created_at", { ascending: false })
    .limit(800);

  if (parishFilter) enrolQ = enrolQ.eq("parish_id", parishFilter);
  if (filters?.batchId) enrolQ = enrolQ.eq("batch_id", filters.batchId);
  if (filters?.unpaidOnly) {
    enrolQ = enrolQ.in("payment_status", ["unpaid", "pending_review"]);
  }

  const { data: enrolments, error } = await enrolQ;
  if (error) {
    console.error("[campaigns] enrolments", error.message);
    throw new Error(publicActionMessage(error, "Could not load recipients."));
  }

  const latest = new Map<string, (typeof enrolments)[number]>();
  for (const row of enrolments ?? []) {
    if (!latest.has(row.user_id)) latest.set(row.user_id, row);
  }

  const userIds = [...latest.keys()];
  if (!userIds.length) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("student_profiles")
    .select("id, email, first_name, last_name, is_active")
    .in("id", userIds);

  if (profileError) {
    console.error("[campaigns] profiles", profileError.message);
    throw new Error(
      publicActionMessage(profileError, "Could not load recipients."),
    );
  }

  const profileMap = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const emails = (profiles ?? [])
    .map((p) => String(p.email || "").trim().toLowerCase())
    .filter(Boolean);
  const unsubscribed = new Set<string>();
  if (emails.length) {
    try {
      const service = createServiceSupabaseClient();
      const { data: optedOut, error: unsubError } = await service
        .from("email_campaign_unsubscribes")
        .select("email")
        .in("email", emails);
      if (unsubError) {
        console.error("[campaigns] unsubscribes", unsubError.message);
      } else {
        for (const row of optedOut ?? []) {
          unsubscribed.add(String(row.email).trim().toLowerCase());
        }
      }
    } catch (error) {
      console.error("[campaigns] unsubscribes lookup", error);
    }
  }

  const rows: CampaignRecipient[] = [];
  for (const [userId, enrol] of latest) {
    const profile = profileMap.get(userId);
    if (!profile) continue;
    if (filters?.activeOnly !== false && !profile.is_active) continue;

    const parish = enrol.parishes as { name?: string } | null;
    const batch = enrol.batches as { name?: string } | null;
    const cohortRow = enrol.cohorts as
      | { name?: string; year_start?: number; year_end?: number }
      | { name?: string; year_start?: number; year_end?: number }[]
      | null;
    const cohort = Array.isArray(cohortRow) ? cohortRow[0] : cohortRow;
    const saturdayRow = enrol.saturday_cohorts as
      | { saturday_slot?: number }
      | { saturday_slot?: number }[]
      | null;
    const saturday = Array.isArray(saturdayRow) ? saturdayRow[0] : saturdayRow;
    const cohortName =
      cohort?.name &&
      cohort.year_start != null &&
      cohort.year_end != null
        ? `${cohort.name} (${cohort.year_start}/${String(cohort.year_end).slice(-2)})`
        : cohort?.name ?? null;
    const slotRaw = saturday?.saturday_slot;
    const saturdaySlot =
      slotRaw === 1 || slotRaw === 2 || slotRaw === 3 || slotRaw === 4
        ? slotRaw
        : null;
    const email = (profile.email as string)?.trim();
    if (!email) continue;
    if (unsubscribed.has(email.toLowerCase())) continue;

    rows.push({
      id: userId,
      email,
      first_name:
        (profile.first_name as string) ||
        (enrol.first_name as string) ||
        "Student",
      last_name:
        (profile.last_name as string) || (enrol.last_name as string) || "",
      is_active: Boolean(profile.is_active),
      parish_id: (enrol.parish_id as string | null) ?? null,
      parish_name: parish?.name ?? null,
      cohort_id: (enrol.cohort_id as string | null) ?? null,
      cohort_name: cohortName,
      batch_id: (enrol.batch_id as string | null) ?? null,
      batch_name: batch?.name ?? null,
      saturday_slot: saturdaySlot,
      payment_status: (enrol.payment_status as string | null) ?? null,
    });
  }

  return rows.sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(
      `${b.last_name} ${b.first_name}`,
    ),
  );
}

async function dispatchCampaignSend(input: {
  studentIds: string[];
  personalNote?: string;
  customSubject: string;
  customHeadline?: string;
  customBody: string;
  parishId?: string;
  batchId?: string;
  attachmentIds?: string[];
}): Promise<CampaignActionResult> {
  const actor = await requireSessionAdmin();

  if (!input.studentIds.length) {
    return { ok: false, message: "Select at least one student." };
  }
  if (input.studentIds.length > 200) {
    return {
      ok: false,
      message: "Select at most 200 students per campaign run.",
    };
  }

  const scoped = await listCampaignRecipients({
    parishId: input.parishId,
    batchId: input.batchId,
    activeOnly: true,
  });
  const allowed = new Map(scoped.map((r) => [r.id, r]));

  const recipients = input.studentIds
    .map((id) => allowed.get(id))
    .filter((r): r is CampaignRecipient => Boolean(r));

  if (!recipients.length) {
    return {
      ok: false,
      message: "No selected students are in your parish scope.",
    };
  }

  if (!isNationalAdmin(actor) && actor.parish_id) {
    const leaked = recipients.some((r) => r.parish_id !== actor.parish_id);
    if (leaked) {
      return { ok: false, message: "Outside your parish scope." };
    }
  }

  const portalUrl = `${portalBaseUrl()}/student`;
  const attachmentIds = [
    ...new Set(
      (input.attachmentIds ?? []).map((id) => id.trim()).filter(Boolean),
    ),
  ];
  if (attachmentIds.length > CAMPAIGN_MAX_ATTACHMENTS) {
    return {
      ok: false,
      message: `Attach at most ${CAMPAIGN_MAX_ATTACHMENTS} files per campaign.`,
    };
  }

  const attachments = await loadCampaignAttachmentPayload(attachmentIds);
  let sent = 0;
  let failed = 0;
  let remaining: number | undefined;
  const failureNotes: string[] = [];

  for (let i = 0; i < recipients.length; i += CAMPAIGN_BATCH_SIZE) {
    const chunk = recipients.slice(i, i + CAMPAIGN_BATCH_SIZE);
    const result = await sendCampaignEmail({
      templateId: "custom",
      portalUrl,
      portalSupportUrl: `${portalBaseUrl()}/student/support`,
      siteUrl: SOD_SITE,
      personalNote: input.personalNote?.trim() || undefined,
      customSubject: input.customSubject.trim(),
      customHeadline: input.customHeadline?.trim() || undefined,
      customBody: input.customBody.trim(),
      recipients: chunk.map((r) => ({
        to: r.email,
        firstName: r.first_name,
        parishName: r.parish_name ?? undefined,
        unsubscribeUrl: campaignUnsubscribeUrl(r.email),
        listUnsubscribeUrl: campaignUnsubscribeOneClickUrl(r.email),
      })),
      attachments: attachments.length ? attachments : undefined,
    });

    if (typeof result.remaining === "number") remaining = result.remaining;

    if (result.sent != null || result.failed != null) {
      sent += result.sent ?? 0;
      failed += result.failed ?? 0;
    } else if (result.ok) {
      sent += chunk.length;
    } else {
      failed += chunk.length;
      failureNotes.push(result.message);
      break;
    }

    if (!result.ok && (result.failed ?? 0) === chunk.length) {
      failureNotes.push(result.message);
      break;
    }
  }

  if (sent > 0 && attachmentIds.length) {
    try {
      await purgeDeskAttachments(attachmentIds);
    } catch (purgeError) {
      console.error("[campaigns attachment purge]", purgeError);
    }
  }

  if (sent === 0 && failed > 0) {
    return {
      ok: false,
      message: publicActionMessage(
        failureNotes[0],
        "Campaign could not be sent. Check the email service and try again.",
      ),
      sent,
      failed,
      remaining,
    };
  }

  return {
    ok: failed === 0,
    message:
      failed === 0
        ? `Campaign emailed to ${sent} student${sent === 1 ? "" : "s"}.`
        : publicActionMessage(
            `Sent ${sent}, failed ${failed}.`,
            `Sent ${sent}, but some emails could not be delivered.`,
          ),
    sent,
    failed,
    remaining,
  };
}

export async function sendSavedCampaign(
  campaignId: string,
): Promise<CampaignActionResult> {
  try {
    const access = await requireAccessibleCampaign(campaignId);
    if (!access.ok) return { ok: false, message: access.message };

    const campaign = access.campaign;
    if (campaign.status === "sent") {
      return { ok: false, message: "This campaign has already been sent." };
    }

    if (!campaign.subject.trim() || !campaign.body.trim()) {
      return { ok: false, message: "Campaigns need a subject and body." };
    }
    if (!campaign.recipient_ids.length) {
      return { ok: false, message: "Select at least one student." };
    }

    const result = await dispatchCampaignSend({
      studentIds: campaign.recipient_ids,
      personalNote: campaign.personal_note ?? undefined,
      customSubject: campaign.subject,
      customHeadline: campaign.headline || undefined,
      customBody: campaign.body,
      parishId: campaign.filter_parish_id ?? undefined,
      batchId: campaign.filter_batch_id ?? undefined,
      attachmentIds: campaign.attachment_ids,
    });

    if (result.sent && result.sent > 0) {
      const actor = await requireSessionAdmin();
      const service = createServiceSupabaseClient();
      const now = new Date().toISOString();
      await service
        .from("email_campaigns")
        .update({
          status: "sent",
          sent_at: now,
          sent_count: result.sent ?? 0,
          failed_count: result.failed ?? 0,
          updated_by: actor.id,
          updated_at: now,
        })
        .eq("id", campaignId);
    }

    revalidateCampaigns(campaignId);
    return { ...result, campaignId };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Unauthorized." };
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}

export async function deleteCampaign(
  campaignId: string,
): Promise<CampaignActionResult> {
  try {
    const access = await requireAccessibleCampaign(campaignId);
    if (!access.ok) return { ok: false, message: access.message };

    const campaign = access.campaign;
    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("email_campaigns")
      .delete()
      .eq("id", campaignId);

    if (error) {
      console.error("[campaigns/delete]", error.message);
      return {
        ok: false,
        message: publicActionMessage(error.message, "Could not delete campaign."),
      };
    }

    if (campaign.status === "draft" && campaign.attachment_ids.length) {
      try {
        await purgeDeskAttachments(campaign.attachment_ids);
      } catch (purgeError) {
        console.error("[campaigns/delete attachments]", purgeError);
      }
    }

    revalidateCampaigns();
    return { ok: true, message: "Campaign deleted." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Unauthorized." };
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}

/** @deprecated Use sendSavedCampaign after saving a draft. */
export async function sendStudentCampaign(input: {
  studentIds: string[];
  personalNote?: string;
  customSubject?: string;
  customHeadline?: string;
  customBody?: string;
  parishId?: string;
  batchId?: string;
  unpaidOnly?: boolean;
  attachmentIds?: string[];
}): Promise<CampaignActionResult> {
  try {
    if (!input.customSubject?.trim() || !input.customBody?.trim()) {
      return {
        ok: false,
        message: "Campaigns need a subject and body.",
      };
    }

    return dispatchCampaignSend({
      studentIds: input.studentIds,
      personalNote: input.personalNote,
      customSubject: input.customSubject,
      customHeadline: input.customHeadline,
      customBody: input.customBody,
      parishId: input.parishId,
      batchId: input.batchId,
      attachmentIds: input.attachmentIds,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Unauthorized." };
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}
