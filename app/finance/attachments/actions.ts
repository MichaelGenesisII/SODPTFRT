"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  FINANCE_ATTACHMENTS_BUCKET,
  validateDeskAttachmentFile,
  type FinanceAttachmentRecord,
} from "@/lib/finance/attachments";
import { requireSessionFinance } from "@/lib/finance/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinanceAttachmentActionResult = {
  ok: boolean;
  message: string;
  attachment?: FinanceAttachmentRecord;
};

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120) || "file";
}

export async function uploadFinanceAttachment(
  formData: FormData,
): Promise<FinanceAttachmentActionResult> {
  try {
    const finance = await requireSessionFinance();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, message: "Choose a file to upload." };
    }

    const invalid = validateDeskAttachmentFile(file);
    if (invalid) return { ok: false, message: invalid };

    const id = randomUUID();
    const storagePath = `${finance.id}/${id}/${sanitizeFilename(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const service = createServiceSupabaseClient();

    const { error: uploadError } = await service.storage
      .from(FINANCE_ATTACHMENTS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[finance/attachment upload]", uploadError.message);
      return {
        ok: false,
        message: publicActionMessage(
          uploadError.message,
          "Could not upload file.",
        ),
      };
    }

    const { data, error } = await service
      .from("finance_attachments")
      .insert({
        id,
        ledger_entry_id: null,
        storage_path: storagePath,
        mime: file.type,
        original_name: file.name,
        byte_size: file.size,
        sort_order: 0,
        created_by: finance.id,
      })
      .select(
        "id, ledger_entry_id, storage_path, mime, original_name, byte_size, sort_order, created_at",
      )
      .single();

    if (error) {
      console.error("[finance/attachment insert]", error.message);
      await service.storage
        .from(FINANCE_ATTACHMENTS_BUCKET)
        .remove([storagePath]);
      return {
        ok: false,
        message: publicActionMessage(
          error.message,
          "Could not save attachment.",
        ),
      };
    }

    return {
      ok: true,
      message: "File uploaded.",
      attachment: data as FinanceAttachmentRecord,
    };
  } catch (error) {
    console.error("[finance/attachment upload]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not upload file."),
    };
  }
}

export async function deleteFinanceAttachment(
  attachmentId: string,
): Promise<FinanceAttachmentActionResult> {
  try {
    await requireSessionFinance();
    const id = attachmentId.trim();
    if (!id) return { ok: false, message: "Missing attachment." };

    const service = createServiceSupabaseClient();
    const { data: row, error: loadError } = await service
      .from("finance_attachments")
      .select("id, storage_path, ledger_entry_id")
      .eq("id", id)
      .maybeSingle();

    if (loadError) {
      console.error("[finance/attachment delete load]", loadError.message);
      return {
        ok: false,
        message: "Could not remove attachment. Please try again.",
      };
    }
    if (!row) return { ok: false, message: "Attachment not found." };

    if (row.ledger_entry_id) {
      return {
        ok: false,
        message:
          "Proof already linked to a ledger entry cannot be removed. Record a reversing entry if needed.",
      };
    }

    const path = row.storage_path as string;
    const { error: storageError } = await service.storage
      .from(FINANCE_ATTACHMENTS_BUCKET)
      .remove([path]);
    if (storageError) {
      console.error("[finance/attachment storage delete]", storageError.message);
    }

    const { error: deleteError } = await service
      .from("finance_attachments")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[finance/attachment delete]", deleteError.message);
      return {
        ok: false,
        message: "Could not remove attachment. Please try again.",
      };
    }

    return { ok: true, message: "Attachment removed." };
  } catch (error) {
    console.error("[finance/attachment delete]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not remove attachment."),
    };
  }
}

export async function signedFinanceAttachmentUrl(
  storagePath: string,
  expiresIn = 3600,
  options?: { download?: string | boolean },
): Promise<string | null> {
  await requireSessionFinance();
  const service = createServiceSupabaseClient();
  const { data, error } = await service.storage
    .from(FINANCE_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn, {
      download: options?.download,
    });
  if (error) {
    console.error("[finance/attachment sign]", error.message);
    return null;
  }
  return data.signedUrl;
}

export async function linkFinanceAttachmentsToEntry(
  entryId: string,
  attachmentIds: string[],
): Promise<void> {
  if (!attachmentIds.length) return;
  const service = createServiceSupabaseClient();
  const unique = [...new Set(attachmentIds.map((id) => id.trim()).filter(Boolean))];

  const { data: rows, error: loadError } = await service
    .from("finance_attachments")
    .select("id, ledger_entry_id")
    .in("id", unique);

  if (loadError) {
    console.error("[finance/attachment link load]", loadError.message);
    throw new Error("Could not link attachments.");
  }

  const found = rows ?? [];
  if (found.length !== unique.length) {
    throw new Error("One or more attachments could not be found.");
  }
  for (const row of found) {
    if (row.ledger_entry_id && row.ledger_entry_id !== entryId) {
      throw new Error("An attachment is already linked elsewhere.");
    }
  }

  for (let index = 0; index < unique.length; index += 1) {
    const { error } = await service
      .from("finance_attachments")
      .update({
        ledger_entry_id: entryId,
        sort_order: index,
      })
      .eq("id", unique[index]);
    if (error) {
      console.error("[finance/attachment link]", error.message);
      throw new Error("Could not link attachments.");
    }
  }
}

export async function purgeUnlinkedFinanceAttachments(
  attachmentIds: string[],
): Promise<void> {
  if (!attachmentIds.length) return;
  const service = createServiceSupabaseClient();
  const unique = [...new Set(attachmentIds.map((id) => id.trim()).filter(Boolean))];

  const { data: rows } = await service
    .from("finance_attachments")
    .select("id, storage_path, ledger_entry_id")
    .in("id", unique);

  const orphans = (rows ?? []).filter((row) => !row.ledger_entry_id);
  if (!orphans.length) return;

  const paths = orphans
    .map((row) => row.storage_path as string)
    .filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await service.storage
      .from(FINANCE_ATTACHMENTS_BUCKET)
      .remove(paths);
    if (storageError) {
      console.error("[finance/attachment purge storage]", storageError.message);
    }
  }

  const { error } = await service
    .from("finance_attachments")
    .delete()
    .in(
      "id",
      orphans.map((row) => row.id as string),
    );
  if (error) {
    console.error("[finance/attachment purge]", error.message);
  }
}

export async function revalidateFinanceLedgerPaths() {
  revalidatePath("/finance/ledger");
  revalidatePath("/finance/categories");
  revalidatePath("/finance/books");
  revalidatePath("/finance");
}
