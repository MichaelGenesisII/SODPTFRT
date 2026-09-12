"use server";

import { randomUUID } from "node:crypto";
import {
  DESK_ATTACHMENTS_BUCKET,
  validateDeskAttachmentFile,
  type DeskAttachmentRecord,
  type NoticeAttachmentAccess,
  type NoticeAttachmentLinkInput,
} from "@/lib/desk-attachments";
import { requireSessionAdmin } from "@/lib/admin/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type DeskAttachmentActionResult = {
  ok: boolean;
  message: string;
  attachment?: DeskAttachmentRecord;
};

export type AnnouncementLinkedAttachment = DeskAttachmentRecord & {
  access_mode: NoticeAttachmentAccess;
};

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120) || "file";
}

function normalizeAccess(value: unknown): NoticeAttachmentAccess {
  if (value === "view" || value === "download" || value === "both") {
    return value;
  }
  return "both";
}

export async function uploadDeskAttachment(
  formData: FormData,
): Promise<DeskAttachmentActionResult> {
  try {
    const admin = await requireSessionAdmin();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, message: "Choose a file to upload." };
    }

    const invalid = validateDeskAttachmentFile(file);
    if (invalid) return { ok: false, message: invalid };

    const id = randomUUID();
    const storagePath = `${id}/${sanitizeFilename(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = await createServerSupabaseClient();

    const { error: uploadError } = await supabase.storage
      .from(DESK_ATTACHMENTS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[desk-attachment upload]", uploadError.message);
      return {
        ok: false,
        message: publicActionMessage(uploadError.message, "Could not upload file."),
      };
    }

    const { data, error } = await supabase
      .from("desk_attachments")
      .insert({
        id,
        storage_path: storagePath,
        mime: file.type,
        original_name: file.name,
        byte_size: file.size,
        created_by: admin.id,
      })
      .select("id, storage_path, mime, original_name, byte_size, created_at")
      .single();

    if (error) {
      console.error("[desk-attachment insert]", error.message);
      await supabase.storage.from(DESK_ATTACHMENTS_BUCKET).remove([storagePath]);
      return {
        ok: false,
        message: publicActionMessage(error.message, "Could not save attachment."),
      };
    }

    return {
      ok: true,
      message: "File uploaded.",
      attachment: data as DeskAttachmentRecord,
    };
  } catch (error) {
    console.error("[desk-attachment upload]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not upload file."),
    };
  }
}

export async function linkAnnouncementAttachments(
  announcementId: string,
  links: NoticeAttachmentLinkInput[],
): Promise<void> {
  if (!links.length) return;
  const supabase = await createServerSupabaseClient();
  const rows = links.map((link, index) => ({
    announcement_id: announcementId,
    attachment_id: link.id,
    sort_order: index,
    access_mode: link.access,
  }));
  const { error } = await supabase.from("announcement_attachments").insert(rows);
  if (error) {
    console.error("[announcement attachments link]", error.message);
  }
}

/**
 * Replace notice file links. Removes storage for files no longer linked
 * to any notice.
 */
export async function replaceAnnouncementAttachments(
  announcementId: string,
  links: NoticeAttachmentLinkInput[],
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: previous } = await supabase
    .from("announcement_attachments")
    .select("attachment_id")
    .eq("announcement_id", announcementId);

  const previousIds = (previous ?? []).map(
    (row) => row.attachment_id as string,
  );
  const nextIds = new Set(links.map((link) => link.id));
  const removedIds = previousIds.filter((id) => !nextIds.has(id));

  await supabase
    .from("announcement_attachments")
    .delete()
    .eq("announcement_id", announcementId);
  await linkAnnouncementAttachments(announcementId, links);
  await purgeOrphanedDeskAttachments(removedIds);
}

/**
 * After a notice row is deleted (junction already cascaded), purge its
 * former files from desk_attachments + storage when unused elsewhere.
 */
export async function purgeAnnouncementAttachments(
  attachmentIds: string[],
): Promise<void> {
  await purgeOrphanedDeskAttachments(attachmentIds);
}

/**
 * Remove a desk file when it is no longer linked to any notice
 * (campaign uploads, abandoned compose, notice picker Remove).
 */
export async function deleteDeskAttachment(
  attachmentId: string,
): Promise<DeskAttachmentActionResult> {
  try {
    await requireSessionAdmin();
    if (!attachmentId.trim()) {
      return { ok: false, message: "Missing attachment." };
    }
    await purgeOrphanedDeskAttachments([attachmentId]);
    return { ok: true, message: "Attachment removed." };
  } catch (error) {
    console.error("[desk-attachment delete]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not remove attachment."),
    };
  }
}

/** Bulk purge for unlinked desk files (e.g. after a campaign send). */
export async function purgeDeskAttachments(
  attachmentIds: string[],
): Promise<void> {
  await requireSessionAdmin();
  await purgeOrphanedDeskAttachments(attachmentIds);
}

async function purgeOrphanedDeskAttachments(
  attachmentIds: string[],
): Promise<void> {
  if (!attachmentIds.length) return;

  const supabase = await createServerSupabaseClient();
  const uniqueIds = [...new Set(attachmentIds)];

  const { data: stillLinked } = await supabase
    .from("announcement_attachments")
    .select("attachment_id")
    .in("attachment_id", uniqueIds);

  const linked = new Set(
    (stillLinked ?? []).map((row) => row.attachment_id as string),
  );
  const toDelete = uniqueIds.filter((id) => !linked.has(id));
  if (!toDelete.length) return;

  const { data: rows } = await supabase
    .from("desk_attachments")
    .select("id, storage_path")
    .in("id", toDelete);

  const paths = (rows ?? [])
    .map((row) => row.storage_path as string)
    .filter(Boolean);

  if (paths.length) {
    const service = createServiceSupabaseClient();
    const { error: storageError } = await service.storage
      .from(DESK_ATTACHMENTS_BUCKET)
      .remove(paths);
    if (storageError) {
      console.error("[desk-attachment storage purge]", storageError.message);
    }
  }

  const { error: deleteError } = await supabase
    .from("desk_attachments")
    .delete()
    .in("id", toDelete);
  if (deleteError) {
    console.error("[desk-attachment row purge]", deleteError.message);
  }
}

export type AnnouncementAttachmentRow = {
  announcement_id: string;
  attachment_id: string;
  sort_order: number;
  access_mode?: string | null;
  desk_attachments: DeskAttachmentRecord | null;
};

function unwrapJoinedAttachment<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listAnnouncementAttachmentsForAdmin(
  announcementIds: string[],
): Promise<Map<string, AnnouncementLinkedAttachment[]>> {
  const result = new Map<string, AnnouncementLinkedAttachment[]>();
  if (!announcementIds.length) return result;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("announcement_attachments")
    .select(
      "announcement_id, attachment_id, sort_order, access_mode, desk_attachments(id, storage_path, mime, original_name, byte_size, created_at)",
    )
    .in("announcement_id", announcementIds)
    .order("sort_order", { ascending: true });

  for (const row of data ?? []) {
    const attachment = unwrapJoinedAttachment(
      row.desk_attachments as DeskAttachmentRecord | DeskAttachmentRecord[] | null,
    );
    if (!attachment) continue;
    const list = result.get(row.announcement_id as string) ?? [];
    list.push({
      ...attachment,
      access_mode: normalizeAccess(row.access_mode),
    });
    result.set(row.announcement_id as string, list);
  }
  return result;
}

export async function listAnnouncementAttachmentIds(
  announcementId: string,
): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("announcement_attachments")
    .select("attachment_id")
    .eq("announcement_id", announcementId);
  return (data ?? []).map((row) => row.attachment_id as string);
}

export async function signedDeskAttachmentUrl(
  storagePath: string,
  expiresIn = 3600,
  options?: { download?: string | boolean },
): Promise<string | null> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service.storage
    .from(DESK_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn, {
      download: options?.download,
    });
  if (error) {
    console.error("[desk-attachment sign]", error.message);
    return null;
  }
  return data.signedUrl;
}

/** Build view / download signed URLs from access mode. */
export async function signedNoticeAttachmentUrls(
  storagePath: string,
  filename: string,
  access: NoticeAttachmentAccess,
): Promise<{ url?: string; downloadUrl?: string }> {
  const allowView = access === "view" || access === "both";
  const allowDownload = access === "download" || access === "both";

  const [url, downloadUrl] = await Promise.all([
    allowView ? signedDeskAttachmentUrl(storagePath) : Promise.resolve(undefined),
    allowDownload
      ? signedDeskAttachmentUrl(storagePath, 3600, { download: filename })
      : Promise.resolve(undefined),
  ]);

  return {
    url: url ?? undefined,
    downloadUrl: downloadUrl ?? undefined,
  };
}

export async function loadCampaignAttachmentPayload(
  attachmentIds: string[],
): Promise<
  { filename: string; content: string; contentType: string }[]
> {
  const uniqueIds = [...new Set(attachmentIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("desk_attachments")
    .select("id, storage_path, mime, original_name")
    .in("id", uniqueIds);

  if (error) {
    console.error("[campaign attachments list]", error.message);
    throw new Error(
      "Attachments could not be loaded. Please re-attach and try again.",
    );
  }

  const rows = data ?? [];
  if (rows.length !== uniqueIds.length) {
    console.error("[campaign attachments missing]", {
      requested: uniqueIds.length,
      found: rows.length,
    });
    throw new Error(
      "Attachments could not be loaded. Please re-attach and try again.",
    );
  }

  const service = createServiceSupabaseClient();
  const out: { filename: string; content: string; contentType: string }[] = [];

  for (const row of rows) {
    const { data: file, error: downloadError } = await service.storage
      .from(DESK_ATTACHMENTS_BUCKET)
      .download(row.storage_path as string);
    if (downloadError || !file) {
      console.error(
        "[campaign attachment download]",
        downloadError?.message ?? row.storage_path,
      );
      throw new Error(
        "Attachments could not be loaded. Please re-attach and try again.",
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    out.push({
      filename: row.original_name as string,
      content: buffer.toString("base64"),
      contentType: row.mime as string,
    });
  }
  return out;
}
