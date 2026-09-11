import {
  DESK_ATTACHMENT_MAX_BYTES,
  DESK_ATTACHMENT_MIMES,
  formatAttachmentSize,
  isAllowedDeskAttachmentMime,
  validateDeskAttachmentFile,
  type DeskAttachmentMime,
} from "@/lib/desk-attachments";

/** Same allow-list and size as desk attachments (PDF / JPEG / PNG / WebP, 10 MB). */
export const FINANCE_ATTACHMENTS_BUCKET = "finance-attachments";
export const FINANCE_ATTACHMENT_MAX_BYTES = DESK_ATTACHMENT_MAX_BYTES;
export const FINANCE_ATTACHMENT_MIMES = DESK_ATTACHMENT_MIMES;
export const FINANCE_ATTACHMENT_MAX_PER_ENTRY = 5;

export type FinanceAttachmentMime = DeskAttachmentMime;

export type FinanceAttachmentRecord = {
  id: string;
  ledger_entry_id: string | null;
  storage_path: string;
  mime: string;
  original_name: string;
  byte_size: number;
  sort_order: number;
  created_at: string;
};

export {
  formatAttachmentSize,
  isAllowedDeskAttachmentMime,
  validateDeskAttachmentFile,
};
