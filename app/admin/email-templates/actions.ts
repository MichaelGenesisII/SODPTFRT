"use server";

import { revalidatePath } from "next/cache";
import {
  catalogEntryForSlug,
  type EmailTemplateSlug,
} from "@/lib/email/template-catalog";
import { isNationalAdmin, requireSessionAdmin } from "@/lib/admin/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type EmailTemplateActionResult = {
  ok: boolean;
  message: string;
};

function unauthorized(): EmailTemplateActionResult {
  return { ok: false, message: "Unauthorized." };
}

async function requireNational(): Promise<EmailTemplateActionResult | null> {
  const actor = await requireSessionAdmin();
  if (!isNationalAdmin(actor)) {
    return { ok: false, message: "National desk only." };
  }
  return null;
}

function isSlug(value: string): value is EmailTemplateSlug {
  return Boolean(catalogEntryForSlug(value));
}

export async function saveEmailTemplateOverride(input: {
  slug: EmailTemplateSlug;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailTemplateActionResult> {
  try {
    const gate = await requireNational();
    if (gate) return gate;

    const catalog = catalogEntryForSlug(input.slug);
    if (!catalog) return { ok: false, message: "Unknown template." };

    const subject = input.subject.trim();
    const html = input.html.trim();
    const text = input.text?.trim() || null;

    if (!subject || !html) {
      return { ok: false, message: "Subject and HTML body are required." };
    }
    if (subject.length > 200) {
      return { ok: false, message: "Subject is too long." };
    }
    if (html.length > 120000) {
      return { ok: false, message: "HTML body is too long." };
    }
    if (text && text.length > 50000) {
      return { ok: false, message: "Plain-text body is too long." };
    }

    const actor = await requireSessionAdmin();
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("email_template_overrides")
      .select("version")
      .eq("slug", input.slug)
      .maybeSingle();

    const version = existing ? (existing.version as number) + 1 : 1;

    const { error } = await supabase.from("email_template_overrides").upsert(
      {
        slug: input.slug,
        subject,
        html_body: html,
        text_body: text,
        default_subject: catalog.defaultSubject,
        default_html: catalog.defaultHtml,
        default_text: catalog.defaultText ?? null,
        version,
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    );

    if (error) {
      console.error("[email-templates save]", error.message);
      return {
        ok: false,
        message: publicActionMessage(error.message, "Could not save template."),
      };
    }

    revalidatePath("/admin/email-templates");
    return { ok: true, message: `Template saved as v${version}.` };
  } catch (error) {
    console.error("[email-templates save]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not save template."),
    };
  }
}

export async function restoreEmailTemplateOverride(
  slugRaw: string,
): Promise<EmailTemplateActionResult> {
  try {
    const gate = await requireNational();
    if (gate) return gate;

    if (!isSlug(slugRaw)) {
      return { ok: false, message: "Unknown template." };
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("email_template_overrides")
      .delete()
      .eq("slug", slugRaw);

    if (error) {
      console.error("[email-templates restore]", error.message);
      return {
        ok: false,
        message: publicActionMessage(error.message, "Could not restore template."),
      };
    }

    revalidatePath("/admin/email-templates");
    return { ok: true, message: "Restored to code default." };
  } catch (error) {
    console.error("[email-templates restore]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not restore template."),
    };
  }
}
