export type CampaignTemplateId = "custom";

/** Max recipients sent per campaign batch. */
export const CAMPAIGN_BATCH_SIZE = 40;

/** Campaign attachment cap per send. */
export const CAMPAIGN_MAX_ATTACHMENTS = 5;

export type CampaignRecipientPayload = {
  to: string;
  firstName: string;
  parishName?: string;
  unsubscribeUrl?: string;
  listUnsubscribeUrl?: string;
};

export type SendCampaignEmailPayload = {
  templateId: string;
  portalUrl: string;
  portalSupportUrl: string;
  siteUrl: string;
  personalNote?: string;
  customSubject?: string;
  customHeadline?: string;
  customBody?: string;
  recipients: CampaignRecipientPayload[];
  attachments?: {
    filename: string;
    content: string;
    contentType: string;
  }[];
};

export function isCampaignTemplateId(
  value: string,
): value is CampaignTemplateId {
  return value === "custom";
}

export type CampaignRecipient = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  parish_id: string | null;
  parish_name: string | null;
  batch_id: string | null;
  batch_name: string | null;
  payment_status: string | null;
};
