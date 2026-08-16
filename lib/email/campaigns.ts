export type CampaignTemplateId = "custom";

/** Max recipients sent to the email backend in one request. */
export const CAMPAIGN_BATCH_SIZE = 40;

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
