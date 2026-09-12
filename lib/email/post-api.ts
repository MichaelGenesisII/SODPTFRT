import { isEmailConfigured } from "@/lib/email/config";
import { dispatchTemplateEmail } from "@/lib/email/dispatch";
import {
  EMAIL_SLUG_BY_ROUTE,
  type EmailTemplateSlug,
} from "@/lib/email/template-catalog";
import { getActiveTemplateOverridePayload } from "@/lib/email/template-overrides";

export type EmailSendResult = {
  ok: boolean;
  message: string;
  messageId?: string;
  subject?: string;
};

/** @deprecated Use EmailSendResult */
export type EmailApiResult = EmailSendResult;

/**
 * Build a templated message (with optional admin override) and send via Resend.
 * `route` is a stable internal key (legacy `/api/email/...` paths).
 */
export async function sendTemplatedEmail<TPayload extends object>(
  route: string,
  payload: TPayload,
  templateSlug?: EmailTemplateSlug,
): Promise<EmailSendResult> {
  if (!isEmailConfigured()) {
    return {
      ok: false,
      message: "Email is not configured.",
    };
  }

  const slug = templateSlug ?? EMAIL_SLUG_BY_ROUTE[route];
  let override = null;
  if (slug) {
    try {
      override = await getActiveTemplateOverridePayload(slug);
    } catch (error) {
      console.error("[email override]", slug, error);
    }
  }

  try {
    const result = await dispatchTemplateEmail(
      route,
      payload as Record<string, unknown>,
      override,
    );
    return {
      ok: true,
      message: "Email sent.",
      messageId: result.messageId,
      subject: result.subject,
    };
  } catch (error) {
    console.error("[email/send]", route, error);
    return {
      ok: false,
      message: "Email could not be sent. Please try again.",
    };
  }
}

/** @deprecated Use sendTemplatedEmail */
export const postEmailApi = sendTemplatedEmail;
