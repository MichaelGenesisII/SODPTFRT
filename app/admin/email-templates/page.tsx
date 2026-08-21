import { redirect } from "next/navigation";
import { EmailTemplatesManager } from "@/components/admin/email-templates-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import { listEmailTemplateOverrides } from "@/lib/email/template-overrides";

export default async function AdminEmailTemplatesPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");
  if (!isNationalAdmin(profile)) redirect("/admin");

  const templates = await listEmailTemplateOverrides();

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Communications
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Email templates
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Edit outbound email copy for the portal. Placeholders like{" "}
          {"{{firstName}}"} are replaced when each email sends. Restore returns
          to the built-in default.
        </p>
      </section>

      <EmailTemplatesManager templates={templates} />
    </div>
  );
}
