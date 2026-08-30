import { formatAdminDate } from "@/lib/admin/students";
import type { CampaignPaymentLane } from "@/lib/email/campaigns";

export type CampaignStatus = "draft" | "sent";

export type AdminCampaignRecord = {
  id: string;
  title: string;
  status: CampaignStatus;
  subject: string;
  headline: string;
  body: string;
  personal_note: string | null;
  filter_parish_id: string | null;
  filter_cohort_id: string | null;
  filter_batch_id: string | null;
  filter_saturday: 1 | 2 | 3 | 4 | null;
  filter_payment: CampaignPaymentLane;
  recipient_ids: string[];
  attachment_ids: string[];
  parish_id: string | null;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
};

export function campaignListLabel(campaign: Pick<AdminCampaignRecord, "title" | "subject">): string {
  const title = campaign.title.trim();
  if (title && title !== "Untitled campaign") return title;
  const subject = campaign.subject.trim();
  return subject || "Untitled campaign";
}

export function campaignStatusLabel(status: CampaignStatus): string {
  return status === "sent" ? "Sent" : "Draft";
}

export function formatCampaignUpdated(iso: string): string {
  return formatAdminDate(iso);
}
