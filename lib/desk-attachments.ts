export const DESK_ATTACHMENTS_BUCKET = "desk-attachments";

export const DESK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const DESK_ATTACHMENT_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type DeskAttachmentMime = (typeof DESK_ATTACHMENT_MIMES)[number];

export type DeskAttachmentRecord = {
  id: string;
  storage_path: string;
  mime: string;
  original_name: string;
  byte_size: number;
  created_at: string;
};

export type DeskAttachmentView = {
  id: string;
  name: string;
  mime: string;
  byteSize: number;
  url?: string;
};

/** How a notice attachment may be opened by students / the public. */
export const NOTICE_ATTACHMENT_ACCESS_MODES = [
  "view",
  "download",
  "both",
] as const;

export type NoticeAttachmentAccess =
  (typeof NOTICE_ATTACHMENT_ACCESS_MODES)[number];

export type NoticeAttachmentLinkInput = {
  id: string;
  access: NoticeAttachmentAccess;
};

export function isNoticeAttachmentAccess(
  value: string,
): value is NoticeAttachmentAccess {
  return (NOTICE_ATTACHMENT_ACCESS_MODES as readonly string[]).includes(value);
}

export function parseNoticeAttachmentLinks(
  formData: FormData,
): NoticeAttachmentLinkInput[] {
  const raw = String(
    formData.get("attachmentLinks") ?? formData.get("attachmentIds") ?? "",
  ).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const links: NoticeAttachmentLinkInput[] = [];
    for (const entry of parsed) {
      if (typeof entry === "string") {
        links.push({ id: entry, access: "both" });
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      const id = (entry as { id?: unknown }).id;
      const accessRaw = (entry as { access?: unknown }).access;
      if (typeof id !== "string" || !id) continue;
      const access =
        typeof accessRaw === "string" && isNoticeAttachmentAccess(accessRaw)
          ? accessRaw
          : "both";
      links.push({ id, access });
    }
    return links;
  } catch {
    return [];
  }
}

export function isAllowedDeskAttachmentMime(
  mime: string,
): mime is DeskAttachmentMime {
  return (DESK_ATTACHMENT_MIMES as readonly string[]).includes(mime);
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateDeskAttachmentFile(file: File): string | null {
  if (!isAllowedDeskAttachmentMime(file.type)) {
    return "Only PDF and image files (JPEG, PNG, WebP) are allowed.";
  }
  if (file.size <= 0) return "File is empty.";
  if (file.size > DESK_ATTACHMENT_MAX_BYTES) {
    return "Each file must be 10 MB or smaller.";
  }
  return null;
}

/** Parse attachment id JSON from announcement / campaign form posts. */
export function parseAttachmentIds(formData: FormData): string[] {
  const raw = String(formData.get("attachmentIds") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}
