"use server";

import { publicActionMessage } from "@/lib/safe-action-message";
import { verifyCampaignUnsubscribeToken } from "@/lib/email/unsubscribe";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type UnsubscribeResult = {
  ok: boolean;
  message: string;
  email?: string;
};

export async function recordCampaignUnsubscribe(
  token: string,
  source: "link" | "one-click" = "link",
): Promise<UnsubscribeResult> {
  try {
    const verified = verifyCampaignUnsubscribeToken(token);
    if (!verified.ok) {
      return { ok: false, message: verified.message };
    }

    const service = createServiceSupabaseClient();
    const { error } = await service.from("email_campaign_unsubscribes").upsert(
      {
        email: verified.email,
        unsubscribed_at: new Date().toISOString(),
        source,
      },
      { onConflict: "email" },
    );

    if (error) {
      console.error("[unsubscribe] upsert failed", error);
      return {
        ok: false,
        message: publicActionMessage(
          error.message,
          "Could not update email preferences. Please try again.",
        ),
      };
    }

    return {
      ok: true,
      email: verified.email,
      message:
        "You have been unsubscribed from School of Disciples desk campaigns. Transactional notices (payments, access, classes) may still be sent when needed.",
    };
  } catch (error) {
    console.error("[unsubscribe]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not update email preferences. Please try again.",
      ),
    };
  }
}
