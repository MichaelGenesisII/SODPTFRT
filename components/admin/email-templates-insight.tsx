import Link from "next/link";
import {
  EMAIL_TEMPLATE_CATALOG,
  EMAIL_TEMPLATE_CATEGORIES,
  EMAIL_TEMPLATE_CATEGORY_LABELS,
  templateCategoryForSlug,
} from "@/lib/email/template-catalog";

export function EmailTemplatesInsight({
  customizedCount,
}: {
  customizedCount: number;
}) {
  const counts = EMAIL_TEMPLATE_CATEGORIES.map((category) => ({
    category,
    label: EMAIL_TEMPLATE_CATEGORY_LABELS[category],
    count: EMAIL_TEMPLATE_CATALOG.filter(
      (entry) => templateCategoryForSlug(entry.slug) === category,
    ).length,
  }));

  return (
    <div className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-3 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Communications
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          Insight
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
          How outbound email copy is stored, customised, and sent — and how this
          desk relates to campaigns.
        </p>
      </div>

      <div className="grid gap-px border-b border-stone bg-stone sm:grid-cols-3">
        {[
          {
            label: "Templates",
            value: String(EMAIL_TEMPLATE_CATALOG.length),
            hint: "Lifecycle emails across the portal",
          },
          {
            label: "Customised",
            value: String(customizedCount),
            hint: "Saved overrides in the database",
          },
          {
            label: "Categories",
            value: String(EMAIL_TEMPLATE_CATEGORIES.length),
            hint: "Grouped by desk or journey",
          },
        ].map((tile) => (
          <article key={tile.label} className="bg-mist/90 px-4 py-4 sm:px-5">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              {tile.label}
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums text-pine">
              {tile.value}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink/55">
              {tile.hint}
            </p>
          </article>
        ))}
      </div>

      <div className="border-b border-stone bg-white/40 px-3 py-5 sm:px-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Template families
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {counts.map((item) => (
            <li
              key={item.category}
              className="border border-stone bg-mist/80 px-4 py-3"
            >
              <p className="text-sm font-medium text-pine">{item.label}</p>
              <p className="mt-1 text-xs text-ink/55">
                {item.count} template{item.count === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <ol className="divide-y divide-stone">
        {[
          {
            title: "Built-in defaults",
            body: "Each template starts from code defaults. Restore default removes your saved override and returns to the shipped copy.",
          },
          {
            title: "Placeholders",
            body: "Tokens like {{firstName}} are replaced when an email sends. Use the placeholder chips in the editor — do not rename tokens unless engineering updates the sender too.",
          },
          {
            title: "HTML and plain text",
            body: "HTML drives most inboxes. Plain text is optional fallback for clients that strip rich markup. Preview uses sample data only.",
          },
          {
            title: "Campaigns desk",
            body: "One-off broadcasts use the Campaigns desk. The campaign shell template here styles those sends; compose the message per run on Campaigns.",
          },
          {
            title: "National desk only",
            body: "Template edits affect every outbound email site-wide. Parish desks cannot change templates — only national admins see this page.",
          },
        ].map((section, index) => (
          <li
            key={section.title}
            className="grid gap-1.5 px-3 py-3.5 sm:grid-cols-[2rem_1fr] sm:gap-4 sm:px-5"
          >
            <p className="font-display text-lg tabular-nums text-celadon/80">
              {String(index + 1).padStart(2, "0")}
            </p>
            <div>
              <h3 className="text-sm font-medium text-pine">{section.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink/65">
                {section.body}
              </p>
              {section.title === "Campaigns desk" ? (
                <Link
                  href="/admin/campaigns"
                  className="mt-2 inline-block text-xs font-medium text-pine underline decoration-pine/25"
                >
                  Open Campaigns desk →
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
