"use server";

import { randomUUID } from "node:crypto";
import {
  DESK_ATTACHMENTS_BUCKET,
  validateDeskAttachmentFile,
  type DeskAttachmentRecord,
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

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120) || "file";
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
  attachmentIds: string[],
): Promise<void> {
  if (!attachmentIds.length) return;
  const supabase = await createServerSupabaseClient();
  const rows = attachmentIds.map((attachmentId, index) => ({
    announcement_id: announcementId,
    attachment_id: attachmentId,
    sort_order: index,
  }));
  const { error } = await supabase.from("announcement_attachments").insert(rows);
  if (error) {
    console.error("[announcement attachments link]", error.message);
  }
}

export async function replaceAnnouncementAttachments(
  announcementId: string,
  attachmentIds: string[],
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase
    .from("announcement_attachments")
    .delete()
    .eq("announcement_id", announcementId);
  await linkAnnouncementAttachments(announcementId, attachmentIds);
}

export type AnnouncementAttachmentRow = {
  announcement_id: string;
  attachment_id: string;
  sort_order: number;
  desk_attachments: DeskAttachmentRecord | null;
};

function unwrapJoinedAttachment<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listAnnouncementAttachmentsForAdmin(
  announcementIds: string[],
): Promise<Map<string, DeskAttachmentRecord[]>> {
  const result = new Map<string, DeskAttachmentRecord[]>();
  if (!announcementIds.length) return result;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("announcement_attachments")
    .select(
      "announcement_id, attachment_id, sort_order, desk_attachments(id, storage_path, mime, original_name, byte_size, created_at)",
    )
    .in("announcement_id", announcementIds)
    .order("sort_order", { ascending: true });

  for (const row of data ?? []) {
    const attachment = unwrapJoinedAttachment(
      row.desk_attachments as DeskAttachmentRecord | DeskAttachmentRecord[] | null,
    );
    if (!attachment) continue;
    const list = result.get(row.announcement_id as string) ?? [];
    list.push(attachment);
    result.set(row.announcement_id as string, list);
  }
  return result;
}

export async function signedDeskAttachmentUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service.storage
    .from(DESK_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) {
    console.error("[desk-attachment sign]", error.message);
    return null;
  }
  return data.signedUrl;
}

export async function loadCampaignAttachmentPayload(
  attachmentIds: string[],
): Promise<
  { filename: string; content: string; contentType: string }[]
> {
  if (!attachmentIds.length) return [];
  await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("desk_attachments")
    .select("storage_path, mime, original_name")
    .in("id", attachmentIds);

  const service = createServiceSupabaseClient();
  const out: { filename: string; content: string; contentType: string }[] = [];

  for (const row of data ?? []) {
    const { data: file, error } = await service.storage
      .from(DESK_ATTACHMENTS_BUCKET)
      .download(row.storage_path as string);
    if (error || !file) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    out.push({
      filename: row.original_name as string,
      content: buffer.toString("base64"),
      contentType: row.mime as string,
    });
  }
  return out;
}
