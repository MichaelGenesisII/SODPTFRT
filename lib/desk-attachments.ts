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
