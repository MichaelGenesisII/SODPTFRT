"use server";

import {
  CAMPAIGN_BATCH_SIZE,
  type CampaignRecipient,
} from "@/lib/email/campaigns";
import {
  portalBaseUrl,
  sendCampaignViaBackend,
} from "@/lib/email/backend";
import { isNationalAdmin, requireSessionAdmin } from "@/lib/admin/auth";
import { SOD_SITE } from "@/lib/site-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publicActionMessage } from "@/lib/safe-action-message";

export type CampaignActionResult = {
  ok: boolean;
  message: string;
  sent?: number;
  failed?: number;
  remaining?: number;
};

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
      "user_id, first_name, last_name, email, parish_id, batch_id, payment_status, created_at, parishes(name), batches(name)",
    )
    .order("created_at", { ascending: false })
    .limit(800);

  if (parishFilter) enrolQ = enrolQ.eq("parish_id", parishFilter);
  if (filters?.batchId) enrolQ = enrolQ.eq("batch_id", filters.batchId);
  if (filters?.unpaidOnly) {
    enrolQ = enrolQ.in("payment_status", ["unpaid", "pending_review"]);
  }

  const { data: enrolments, error } = await enrolQ;
  if (error) throw new Error(error.message);

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

  if (profileError) throw new Error(profileError.message);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const rows: CampaignRecipient[] = [];
  for (const [userId, enrol] of latest) {
    const profile = profileMap.get(userId);
    if (!profile) continue;
    if (filters?.activeOnly !== false && !profile.is_active) continue;

    const parish = enrol.parishes as { name?: string } | null;
    const batch = enrol.batches as { name?: string } | null;
    const email = (profile.email as string)?.trim();
    if (!email) continue;

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
      batch_id: (enrol.batch_id as string | null) ?? null,
      batch_name: batch?.name ?? null,
      payment_status: (enrol.payment_status as string | null) ?? null,
    });
  }

  return rows.sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(
      `${b.last_name} ${b.first_name}`,
    ),
  );
}

export async function sendStudentCampaign(input: {
  studentIds: string[];
  personalNote?: string;
  customSubject?: string;
  customHeadline?: string;
  customBody?: string;
  parishId?: string;
  batchId?: string;
  unpaidOnly?: boolean;
}): Promise<CampaignActionResult> {
  try {
    const actor = await requireSessionAdmin();

    if (!input.customSubject?.trim() || !input.customBody?.trim()) {
      return {
        ok: false,
        message: "Campaigns need a subject and body.",
      };
    }

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
      unpaidOnly: input.unpaidOnly,
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

    // Defense: parish desks cannot address outside their parish.
    if (!isNationalAdmin(actor) && actor.parish_id) {
      const leaked = recipients.some((r) => r.parish_id !== actor.parish_id);
      if (leaked) {
        return { ok: false, message: "Outside your parish scope." };
      }
    }

    const portalUrl = `${portalBaseUrl()}/student`;
    let sent = 0;
    let failed = 0;
    let remaining: number | undefined;
    const failureNotes: string[] = [];

    for (let i = 0; i < recipients.length; i += CAMPAIGN_BATCH_SIZE) {
      const chunk = recipients.slice(i, i + CAMPAIGN_BATCH_SIZE);
      const result = await sendCampaignViaBackend({
        templateId: "custom",
        portalUrl,
        portalSupportUrl: `${portalBaseUrl()}/student/support`,
        siteUrl: SOD_SITE,
        personalNote: input.personalNote?.trim() || undefined,
        customSubject: input.customSubject?.trim() || undefined,
        customHeadline: input.customHeadline?.trim() || undefined,
        customBody: input.customBody?.trim() || undefined,
        recipients: chunk.map((r) => ({
          to: r.email,
          firstName: r.first_name,
          parishName: r.parish_name ?? undefined,
        })),
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
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Unauthorized." };
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}
