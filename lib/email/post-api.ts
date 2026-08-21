import {
  EMAIL_API_SLUG_BY_PATH,
  type EmailTemplateSlug,
} from "@/lib/email/template-catalog";
import { getActiveTemplateOverridePayload } from "@/lib/email/template-overrides";

export type EmailApiResult = {
  ok: boolean;
  message: string;
  messageId?: string;
  subject?: string;
};

export async function postEmailApi<TPayload extends object>(
  path: string,
  payload: TPayload,
  templateSlug?: EmailTemplateSlug,
): Promise<EmailApiResult> {
  const baseUrl = process.env.EMAIL_API_URL?.replace(/\/$/, "");
  const secret = process.env.EMAIL_API_SECRET;

  if (!baseUrl || !secret) {
    return {
      ok: false,
      message: "Email backend is not configured.",
    };
  }

  let body: TPayload & {
    templateOverride?: { subject?: string; html?: string; text?: string };
  } = payload;

  const slug = templateSlug ?? EMAIL_API_SLUG_BY_PATH[path];
  if (slug) {
    try {
      const override = await getActiveTemplateOverridePayload(slug);
      if (override) {
        body = { ...payload, templateOverride: override };
      }
    } catch (error) {
      console.error("[email override]", slug, error);
    }
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SOD-Email-Secret": secret,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      messageId?: string;
      subject?: string;
    } | null;

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        message: data?.message || "Email could not be sent. Please try again.",
      };
    }

    return {
      ok: true,
      message: data.message || "Email sent.",
      messageId: data.messageId,
      subject: data.subject,
    };
  } catch (error) {
    console.error("[email/post-api]", path, error);
    return {
      ok: false,
      message: "Email could not be sent. Please try again.",
    };
  }
}
