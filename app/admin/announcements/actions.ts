"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
  type AdminProfile,
} from "@/lib/admin/auth";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  AUDIENCE_META,
  isAnnouncementAudience,
  isSafeAnnouncementHref,
  maxPublishedForAudience,
  type AnnouncementAudience,
} from "@/lib/announcements";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  linkAnnouncementAttachments,
  parseAttachmentIds,
  replaceAnnouncementAttachments,
} from "@/app/admin/desk-attachments/actions";

export type AnnouncementActionResult = {
  ok: boolean;
  message: string;
};

function unauthorizedResult(): AnnouncementActionResult {
  return { ok: false, message: "Unauthorized." };
}

function failMessage(error: unknown, fallback: string): AnnouncementActionResult {
  console.error("[announcements]", error);
  return { ok: false, message: publicActionMessage(error, fallback) };
}

function revalidateAnnouncementPaths() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/announcements");
  revalidatePath("/student");
  revalidatePath("/student/notices");
}

type PublishCapacityOptions = {
  excludeId?: string;
  /**
   * Student-board slots are per parish bucket:
   * - string → that parish
   * - null → UK-wide (national) student notices
   * Omit for home (`general`) — counted globally.
   */
  parishBucket?: string | null;
};

async function countPublished(
  audience: AnnouncementAudience,
  options?: PublishCapacityOptions,
) {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("announcements")
    .select("*", { count: "exact", head: true })
    .eq("is_published", true)
    .eq("audience", audience);

  if (options?.excludeId) {
    query = query.neq("id", options.excludeId);
  }

  if (options && "parishBucket" in options) {
    if (options.parishBucket) {
      query = query.eq("parish_id", options.parishBucket);
    } else {
      query = query.is("parish_id", null);
    }
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function capacityOptionsFor(
  audience: AnnouncementAudience,
  parishId: string | null,
  excludeId?: string,
): PublishCapacityOptions {
  if (audience === "general") {
    return excludeId ? { excludeId } : {};
  }
  return {
    excludeId,
    parishBucket: parishId,
  };
}

async function assertPublishCapacity(
  audience: AnnouncementAudience,
  options?: PublishCapacityOptions,
): Promise<AnnouncementActionResult | null> {
  const max = maxPublishedForAudience(audience);
  const published = await countPublished(audience, options);
  if (published >= max) {
    const surface = AUDIENCE_META[audience].surface;
    const bucketLabel =
      audience === "students" && options && "parishBucket" in options
        ? options.parishBucket
          ? " for this parish"
          : " on the UK-wide student board"
        : "";
    return {
      ok: false,
      message: `${surface} allows at most ${max} live notices${bucketLabel}. Unpublish one first.`,
    };
  }
  return null;
}

async function assertBatchBelongsToParish(
  batchId: string | null,
  parishId: string | null,
): Promise<AnnouncementActionResult | null> {
  if (!batchId) return null;
  if (!parishId) {
    return {
      ok: false,
      message: "Choose a parish before selecting a batch.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: batch } = await supabase
    .from("batches")
    .select("id, parish_id")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch || batch.parish_id !== parishId) {
    return {
      ok: false,
      message: "That batch does not belong to the selected parish.",
    };
  }
  return null;
}

function parseAnnouncementFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const href = String(formData.get("href") ?? "").trim() || null;
  const hrefLabel = String(formData.get("hrefLabel") ?? "").trim() || null;
  const publish = String(formData.get("publish") ?? "") === "1";
  const audienceRaw = String(formData.get("audience") ?? "general").trim();
  const audience: AnnouncementAudience = isAnnouncementAudience(audienceRaw)
    ? audienceRaw
    : "general";
  const parishId = String(formData.get("parishId") ?? "").trim() || null;
  const batchId = String(formData.get("batchId") ?? "").trim() || null;

  return { title, body, href, hrefLabel, publish, audience, parishId, batchId };
}

function validateFields(fields: {
  title: string;
  body: string;
  href: string | null;
  hrefLabel: string | null;
}): AnnouncementActionResult | null {
  const { title, body, href, hrefLabel } = fields;
  if (!title || !body) {
    return { ok: false, message: "Title and body are required." };
  }
  if (title.length > ANNOUNCEMENT_TITLE_MAX) {
    return {
      ok: false,
      message: `Title must be ${ANNOUNCEMENT_TITLE_MAX} characters or fewer.`,
    };
  }
  if (body.length > ANNOUNCEMENT_BODY_MAX) {
    return {
      ok: false,
      message: `Body must be ${ANNOUNCEMENT_BODY_MAX} characters or fewer.`,
    };
  }
  if ((href && !hrefLabel) || (!href && hrefLabel)) {
    return {
      ok: false,
      message: "Provide both a link URL and link label, or neither.",
    };
  }
  if (href && !isSafeAnnouncementHref(href)) {
    return {
      ok: false,
      message:
        "Link must be an http(s) URL or a site path starting with /.",
    };
  }
  return null;
}

function resolveScope(
  actor: AdminProfile,
  fields: {
    audience: AnnouncementAudience;
    parishId: string | null;
    batchId: string | null;
  },
):
  | {
      ok: true;
      audience: AnnouncementAudience;
      parishId: string | null;
      batchId: string | null;
    }
  | AnnouncementActionResult {
  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return { ok: false, message: "Parish scope required." };
    }
    return {
      ok: true,
      audience: "students",
      parishId: actor.parish_id,
      batchId: fields.batchId,
    };
  }

  if (fields.audience === "general") {
    return {
      ok: true,
      audience: "general",
      parishId: null,
      batchId: null,
    };
  }

  return {
    ok: true,
    audience: "students",
    parishId: fields.parishId,
    batchId: fields.parishId ? fields.batchId : null,
  };
}

function canManageAnnouncementRow(
  actor: AdminProfile,
  row: { parish_id: string | null; audience?: string | null },
): boolean {
  if (isNationalAdmin(actor)) return true;
  return (
    Boolean(actor.parish_id) &&
    row.parish_id === actor.parish_id &&
    (row.audience ?? "students") === "students"
  );
}

export async function createAnnouncement(
  formData: FormData,
): Promise<AnnouncementActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const fields = parseAnnouncementFields(formData);
    const invalid = validateFields(fields);
    if (invalid) return invalid;

    const scoped = resolveScope(actor, fields);
    if (!("audience" in scoped)) return scoped;

    const batchError = await assertBatchBelongsToParish(
      scoped.batchId,
      scoped.parishId,
    );
    if (batchError) return batchError;

    if (fields.publish) {
      const blocked = await assertPublishCapacity(
        scoped.audience,
        capacityOptionsFor(scoped.audience, scoped.parishId),
      );
      if (blocked) return blocked;
    }

    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const attachmentIds = parseAttachmentIds(formData);
    const { data: created, error } = await supabase
      .from("announcements")
      .insert({
        title: fields.title,
        body: fields.body,
        href: fields.href,
        href_label: fields.hrefLabel,
        audience: scoped.audience,
        parish_id: scoped.parishId,
        batch_id: scoped.batchId,
        is_published: fields.publish,
        published_at: fields.publish ? now : null,
        created_by: actor.id,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error || !created) {
      return failMessage(error, "Could not save this notice. Please try again.");
    }

    await linkAnnouncementAttachments(created.id as string, attachmentIds);

    revalidateAnnouncementPaths();
    return {
      ok: true,
      message: fields.publish
        ? `Published to ${AUDIENCE_META[scoped.audience].surface}.`
        : "Draft saved.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return failMessage(error, "Could not save this notice. Please try again.");
  }
}

export async function updateAnnouncement(
  formData: FormData,
): Promise<AnnouncementActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const id = String(formData.get("id") ?? "");
    const fields = parseAnnouncementFields(formData);

    if (!id) return { ok: false, message: "Announcement id is required." };
    const invalid = validateFields(fields);
    if (invalid) return invalid;

    const scoped = resolveScope(actor, fields);
    if (!("audience" in scoped)) return scoped;

    const batchError = await assertBatchBelongsToParish(
      scoped.batchId,
      scoped.parishId,
    );
    if (batchError) return batchError;

    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from("announcements")
      .select("is_published, published_at, audience, parish_id, batch_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return { ok: false, message: "Announcement not found." };
    }

    if (!canManageAnnouncementRow(actor, existing)) {
      return {
        ok: false,
        message: "You can only edit notices for your own parish.",
      };
    }

    const willBeLive = fields.publish;
    const wasLive = Boolean(existing.is_published);
    const audienceChanged =
      (existing.audience as AnnouncementAudience) !== scoped.audience;
    const parishChanged =
      (existing.parish_id ?? null) !== scoped.parishId;
    const batchChanged = (existing.batch_id ?? null) !== scoped.batchId;
    const scopeChanged = audienceChanged || parishChanged || batchChanged;

    if (willBeLive && (!wasLive || scopeChanged)) {
      const blocked = await assertPublishCapacity(
        scoped.audience,
        capacityOptionsFor(scoped.audience, scoped.parishId, id),
      );
      if (blocked) return blocked;
    }

    const now = new Date().toISOString();
    const publishedAt = fields.publish
      ? existing.published_at || now
      : null;

    const { error } = await supabase
      .from("announcements")
      .update({
        title: fields.title,
        body: fields.body,
        href: fields.href,
        href_label: fields.hrefLabel,
        audience: scoped.audience,
        parish_id: scoped.parishId,
        batch_id: scoped.batchId,
        is_published: fields.publish,
        published_at: publishedAt,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      return failMessage(error, "Could not update this notice. Please try again.");
    }

    await replaceAnnouncementAttachments(id, parseAttachmentIds(formData));

    revalidateAnnouncementPaths();
    return { ok: true, message: "Notice updated." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return failMessage(error, "Could not update this notice. Please try again.");
  }
}

export async function setAnnouncementPublished(
  id: string,
  publish: boolean,
): Promise<AnnouncementActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!id) return { ok: false, message: "Announcement id is required." };

    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from("announcements")
      .select("published_at, audience, parish_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return { ok: false, message: "Announcement not found." };
    }

    if (!canManageAnnouncementRow(actor, existing)) {
      return {
        ok: false,
        message: "You can only publish or unpublish notices for your own parish.",
      };
    }

    const audience = (existing.audience as AnnouncementAudience) ?? "general";

    if (publish) {
      const blocked = await assertPublishCapacity(
        audience,
        capacityOptionsFor(audience, existing.parish_id, id),
      );
      if (blocked) return blocked;
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("announcements")
      .update({
        is_published: publish,
        published_at: publish ? existing.published_at || now : null,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      return failMessage(
        error,
        "Could not change publish status. Please try again.",
      );
    }

    revalidateAnnouncementPaths();
    return {
      ok: true,
      message: publish
        ? `Published to ${AUDIENCE_META[audience].surface}.`
        : "Moved to drafts.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return failMessage(
      error,
      "Could not change publish status. Please try again.",
    );
  }
}

export async function deleteAnnouncement(
  id: string,
): Promise<AnnouncementActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!id) return { ok: false, message: "Announcement id is required." };

    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from("announcements")
      .select("parish_id, audience")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return { ok: false, message: "Announcement not found." };
    }

    if (!canManageAnnouncementRow(actor, existing)) {
      return {
        ok: false,
        message: "You can only delete notices for your own parish.",
      };
    }

    const { error } = await supabase.from("announcements").delete().eq("id", id);

    if (error) {
      return failMessage(error, "Could not delete this notice. Please try again.");
    }

    revalidateAnnouncementPaths();
    return { ok: true, message: "Notice deleted." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    return failMessage(error, "Could not delete this notice. Please try again.");
  }
}
