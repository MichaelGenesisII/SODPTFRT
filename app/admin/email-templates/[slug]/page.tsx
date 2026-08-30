import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAdminEmailTemplate } from "@/app/admin/email-templates/actions";
import { EmailTemplateDetailWorkspace } from "@/components/admin/email-template-detail-workspace";
import {
  catalogEntryForSlug,
  templateCategoryForSlug,
  EMAIL_TEMPLATE_CATEGORY_LABELS,
} from "@/lib/email/template-catalog";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const catalog = catalogEntryForSlug(slug);
  const title = catalog
    ? `${catalog.label} | Email templates | School of Disciples Portal`
    : "Email templates | School of Disciples Portal";
  return { title };
}

export default async function AdminEmailTemplateDetailPage({
  params,
  searchParams,
}: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");
  if (!isNationalAdmin(profile)) redirect("/admin");

  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const backHref = sp.from
    ? `/admin/email-templates?${sp.from}`
    : "/admin/email-templates";

  const template = await getAdminEmailTemplate(slug);
  if (!template) {
    notFound();
  }

  const catalog = catalogEntryForSlug(slug);

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Communications · Template file
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.5rem,4vw,2.2rem)] tracking-[-0.02em] text-pine">
          {catalog?.label ?? slug}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {catalog
            ? EMAIL_TEMPLATE_CATEGORY_LABELS[templateCategoryForSlug(template.slug)]
            : "Template"}
          {" · "}
          Edit subject and body, preview with sample data, then save or restore
          the default.
        </p>
      </section>

      <EmailTemplateDetailWorkspace template={template} backHref={backHref} />
    </div>
  );
}
