import {
  catalogEntryForSlug,
  type EmailTemplateSlug,
} from "@/lib/email/template-catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type EmailTemplateOverride = {
  slug: EmailTemplateSlug;
  subject: string | null;
  html_body: string | null;
  text_body: string | null;
  default_subject: string;
  default_html: string;
  default_text: string | null;
  version: number;
  updated_at: string;
  hasOverride: boolean;
};

export type TemplateOverridePayload = {
  subject?: string;
  html?: string;
  text?: string;
};

export async function getEmailTemplateOverride(
  slug: EmailTemplateSlug,
): Promise<EmailTemplateOverride | null> {
  const catalog = catalogEntryForSlug(slug);
  if (!catalog) return null;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("email_template_overrides")
    .select(
      "slug, subject, html_body, text_body, default_subject, default_html, default_text, version, updated_at",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (data) {
    return {
      slug: data.slug as EmailTemplateSlug,
      subject: (data.subject as string | null) ?? null,
      html_body: (data.html_body as string | null) ?? null,
      text_body: (data.text_body as string | null) ?? null,
      default_subject: catalog.defaultSubject,
      default_html: catalog.defaultHtml,
      default_text: catalog.defaultText ?? null,
      version: data.version as number,
      updated_at: data.updated_at as string,
      hasOverride: Boolean(data.subject || data.html_body || data.text_body),
    };
  }

  return {
    slug,
    subject: null,
    html_body: null,
    text_body: null,
    default_subject: catalog.defaultSubject,
    default_html: catalog.defaultHtml,
    default_text: catalog.defaultText ?? null,
    version: 0,
    updated_at: "",
    hasOverride: false,
  };
}

export async function getActiveTemplateOverridePayload(
  slug: EmailTemplateSlug,
): Promise<TemplateOverridePayload | null> {
  const service = createServiceSupabaseClient();
  const { data } = await service
    .from("email_template_overrides")
    .select("subject, html_body, text_body")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;
  if (!data.subject && !data.html_body && !data.text_body) return null;

  return {
    subject: (data.subject as string | null) ?? undefined,
    html: (data.html_body as string | null) ?? undefined,
    text: (data.text_body as string | null) ?? undefined,
  };
}

export async function listEmailTemplateOverrides(): Promise<EmailTemplateOverride[]> {
  const { EMAIL_TEMPLATE_CATALOG } = await import("@/lib/email/template-catalog");
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("email_template_overrides")
    .select(
      "slug, subject, html_body, text_body, default_subject, default_html, default_text, version, updated_at",
    );

  const bySlug = new Map(
    (data ?? []).map((row) => [row.slug as string, row]),
  );

  return EMAIL_TEMPLATE_CATALOG.map((catalog) => {
    const row = bySlug.get(catalog.slug);
    if (!row) {
      return {
        slug: catalog.slug,
        subject: null,
        html_body: null,
        text_body: null,
        default_subject: catalog.defaultSubject,
        default_html: catalog.defaultHtml,
        default_text: catalog.defaultText ?? null,
        version: 0,
        updated_at: "",
        hasOverride: false,
      };
    }
    return {
      slug: catalog.slug,
      subject: (row.subject as string | null) ?? null,
      html_body: (row.html_body as string | null) ?? null,
      text_body: (row.text_body as string | null) ?? null,
      default_subject: catalog.defaultSubject,
      default_html: catalog.defaultHtml,
      default_text: catalog.defaultText ?? null,
      version: row.version as number,
      updated_at: row.updated_at as string,
      hasOverride: Boolean(row.subject || row.html_body || row.text_body),
    };
  });
}
