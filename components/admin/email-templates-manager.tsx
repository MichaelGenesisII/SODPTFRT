"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmailTemplatesInsight } from "@/components/admin/email-templates-insight";
import {
  catalogEntryForSlug,
  EMAIL_TEMPLATE_CATEGORIES,
  EMAIL_TEMPLATE_CATEGORY_LABELS,
  templateCategoryForSlug,
  type EmailTemplateCategory,
} from "@/lib/email/template-catalog";
import type { EmailTemplateOverride } from "@/lib/email/template-overrides";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const PAGE_SIZE = 12;

export function EmailTemplatesManager({
  templates,
}: {
  templates: EmailTemplateOverride[];
}) {
  const [pageView, setPageView] = useState<"desk" | "insight">("desk");
  const [categoryFilter, setCategoryFilter] = useState<
    EmailTemplateCategory | "all"
  >("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const customizedCount = templates.filter((item) => item.hasOverride).length;

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((item) => {
      const cat = catalogEntryForSlug(item.slug);
      const category = templateCategoryForSlug(item.slug);
      if (categoryFilter !== "all" && category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [
        cat?.label,
        cat?.description,
        item.slug,
        EMAIL_TEMPLATE_CATEGORY_LABELS[category],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [templates, categoryFilter, query]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTemplates.length / PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredTemplates.slice(
    pageStart,
    pageStart + PAGE_SIZE,
  );

  function templateDetailHref(slug: string) {
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", String(page));
    const from = params.toString();
    return from
      ? `/admin/email-templates/${slug}?from=${encodeURIComponent(from)}`
      : `/admin/email-templates/${slug}`;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        data-tour="email-templates-tabs"
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
        aria-label="Email templates page"
      >
        {(
          [
            { id: "desk" as const, label: "Desk" },
            { id: "insight" as const, label: "Insight" },
          ] as const
        ).map((tab) => {
          const active = pageView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPageView(tab.id)}
              className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                active ? "text-pine" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              {tab.label}
              <span
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      {pageView === "insight" ? (
        <EmailTemplatesInsight customizedCount={customizedCount} />
      ) : (
        <>
          <div
            data-tour="email-templates-stats"
            className="grid gap-px border border-stone bg-stone sm:grid-cols-3"
          >
            {[
              {
                label: "Templates",
                value: templates.length,
                hint: "Lifecycle emails",
              },
              {
                label: "Customised",
                value: customizedCount,
                hint: "Saved overrides",
              },
              {
                label: "Showing",
                value: filteredTemplates.length,
                hint: "After filters",
              },
            ].map((tile) => (
              <div
                key={tile.label}
                className="bg-mist/90 px-4 py-3 sm:px-5 sm:py-4"
              >
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  {tile.label}
                </p>
                <p className="mt-1 font-display text-2xl tabular-nums text-pine">
                  {tile.value}
                </p>
                <p className="mt-1 text-xs text-ink/50">{tile.hint}</p>
              </div>
            ))}
          </div>

          <section className="border border-stone bg-mist/40 p-4 sm:p-5">
            <p className="text-sm text-ink/60">
              Open a template to edit subject and body, preview with sample
              data, and save or restore defaults.
            </p>

            <div className="mt-4 space-y-3 border border-stone bg-mist/35">
              <div className="border-b border-stone px-3 py-2.5 sm:px-4">
                <label className="block">
                  <span className="sr-only">Search templates</span>
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search templates…"
                    className="w-full border border-stone bg-white/80 px-3 py-2 text-sm outline-none placeholder:text-ink/35 focus:border-pine"
                  />
                </label>
              </div>

              <div
                data-tour="email-templates-categories"
                className="flex flex-wrap gap-1.5 px-3 py-2 sm:px-4"
              >
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("all");
                    setPage(1);
                  }}
                  className={`border px-2.5 py-1 text-xs font-medium transition-colors ${
                    categoryFilter === "all"
                      ? "border-pine bg-pine text-mist"
                      : "border-stone bg-white/60 text-ink/70 hover:border-pine/30"
                  }`}
                >
                  All
                </button>
                {EMAIL_TEMPLATE_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(category);
                      setPage(1);
                    }}
                    className={`border px-2.5 py-1 text-xs font-medium transition-colors ${
                      categoryFilter === category
                        ? "border-pine bg-pine text-mist"
                        : "border-stone bg-white/60 text-ink/70 hover:border-pine/30"
                    }`}
                  >
                    {EMAIL_TEMPLATE_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>

              <ul className="grid gap-2 px-3 pb-4 sm:grid-cols-2 sm:px-4 lg:grid-cols-3">
                {pageItems.length === 0 ? (
                  <li className="col-span-full px-2 py-8 text-center text-sm text-ink/50">
                    No templates match these filters.
                  </li>
                ) : (
                  pageItems.map((item) => {
                    const cat = catalogEntryForSlug(item.slug);
                    const category = templateCategoryForSlug(item.slug);
                    return (
                      <li key={item.slug}>
                        <Link
                          href={templateDetailHref(item.slug)}
                          className="flex h-full flex-col border border-stone bg-white/70 px-4 py-3.5 transition-colors hover:border-pine/35 hover:bg-white"
                        >
                          <span className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-celadon">
                            {EMAIL_TEMPLATE_CATEGORY_LABELS[category]}
                          </span>
                          <span className="mt-1 text-sm font-medium text-pine">
                            {cat?.label ?? item.slug}
                          </span>
                          <span className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-ink/55">
                            {cat?.description}
                          </span>
                          <span
                            className={`mt-3 text-[0.6rem] font-medium uppercase tracking-[0.12em] ${
                              item.hasOverride ? "text-celadon" : "text-ink/35"
                            }`}
                          >
                            {item.hasOverride
                              ? `Custom · v${item.version}`
                              : "Default"}
                          </span>
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            <DeskPagination
              page={currentPage}
              totalItems={filteredTemplates.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              className="mt-3"
              itemLabel="templates"
            />
          </section>
        </>
      )}
    </div>
  );
}
