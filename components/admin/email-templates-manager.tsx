"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  restoreEmailTemplateOverride,
  saveEmailTemplateOverride,
  type EmailTemplateActionResult,
} from "@/app/admin/email-templates/actions";
import { useToast } from "@/components/ui/toast";
import {
  catalogEntryForSlug,
  EMAIL_SAMPLE_VALUES,
  renderTemplatePreview,
  type EmailTemplateSlug,
} from "@/lib/email/template-catalog";
import type { EmailTemplateOverride } from "@/lib/email/template-overrides";

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 font-mono text-xs outline-none focus:border-pine";

type EmailTemplatesManagerProps = {
  templates: EmailTemplateOverride[];
};

export function EmailTemplatesManager({
  templates,
}: EmailTemplatesManagerProps) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [selectedSlug, setSelectedSlug] = useState<EmailTemplateSlug>(
    templates[0]?.slug ?? "enrolment-confirmation",
  );

  const selected = templates.find((t) => t.slug === selectedSlug) ?? templates[0]!;
  const catalog = catalogEntryForSlug(selectedSlug);

  const activeSubject =
    selected.subject?.trim() ||
    selected.default_subject ||
    catalog?.defaultSubject ||
    "";
  const activeHtml =
    selected.html_body?.trim() ||
    selected.default_html ||
    catalog?.defaultHtml ||
    "";

  const [subject, setSubject] = useState(activeSubject);
  const [html, setHtml] = useState(activeHtml);
  const [textBody, setTextBody] = useState(selected.text_body ?? "");

  useEffect(() => {
    setSubject(activeSubject);
    setHtml(activeHtml);
    setTextBody(selected.text_body ?? "");
  }, [selectedSlug, activeSubject, activeHtml, selected.text_body]);

  const previewSubject = useMemo(
    () => renderTemplatePreview(subject),
    [subject],
  );
  const previewHtml = useMemo(() => renderTemplatePreview(html), [html]);

  function run(action: () => Promise<EmailTemplateActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) success(result.message);
      else error(result.message);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="border border-stone/80 bg-white/50 p-3">
        <p className="px-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Templates
        </p>
        <ul className="mt-2 max-h-[28rem] space-y-0.5 overflow-y-auto">
          {templates.map((item) => {
            const cat = catalogEntryForSlug(item.slug);
            const active = item.slug === selectedSlug;
            return (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => setSelectedSlug(item.slug)}
                  className={`flex w-full items-start gap-2 px-2 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-pine text-mist"
                      : "text-ink/75 hover:bg-mist/80 hover:text-pine"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">
                      {cat?.label ?? item.slug}
                    </span>
                    {item.hasOverride ? (
                      <span
                        className={`mt-0.5 block text-[0.65rem] uppercase tracking-wide ${
                          active ? "text-mist/70" : "text-celadon"
                        }`}
                      >
                        Customised · v{item.version}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="space-y-4">
        {catalog ? (
          <p className="text-sm text-ink/65">{catalog.description}</p>
        ) : null}

        {selected.hasOverride ? (
          <p className="text-xs text-ink/50">
            Customised · v{selected.version}
            {selected.updated_at
              ? ` · saved ${new Date(selected.updated_at).toLocaleString()}`
              : ""}
          </p>
        ) : (
          <p className="text-xs text-ink/45">Using built-in default (not customised).</p>
        )}

        {catalog?.variables.length ? (
          <div className="border border-stone/70 bg-mist/40 px-4 py-3">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
              Placeholders
            </p>
            <p className="mt-2 flex flex-wrap gap-2 text-xs text-ink/70">
              {catalog.variables.map((v) => (
                <code
                  key={v}
                  className="border border-stone/80 bg-white/60 px-1.5 py-0.5"
                >
                  {v}
                </code>
              ))}
            </p>
          </div>
        ) : null}

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
            Subject
          </span>
          <input
            className={`${fieldClass} mt-1 font-sans text-sm`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
            HTML body
          </span>
          <textarea
            className={`${fieldClass} mt-1 min-h-[220px] resize-y`}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
            Plain text (optional)
          </span>
          <textarea
            className={`${fieldClass} mt-1 min-h-[100px] resize-y font-sans text-sm`}
            value={textBody}
            onChange={(e) => setTextBody(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                saveEmailTemplateOverride({
                  slug: selectedSlug,
                  subject,
                  html,
                  text: textBody || undefined,
                }),
              )
            }
            className="bg-pine px-4 py-2 text-sm font-medium text-mist disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save template"}
          </button>
          <button
            type="button"
            disabled={pending || !selected.hasOverride}
            onClick={() => run(() => restoreEmailTemplateOverride(selectedSlug))}
            className="border border-stone px-4 py-2 text-sm text-ink disabled:opacity-40"
          >
            Restore to default
          </button>
        </div>

        <section className="border border-stone/80 bg-white/50">
          <div className="border-b border-stone/70 px-4 py-3">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Preview
            </p>
            <p className="mt-1 text-sm font-medium text-ink">{previewSubject}</p>
          </div>
          <iframe
            title="Email preview"
            className="h-[min(420px,60vh)] w-full border-0 bg-white"
            sandbox=""
            srcDoc={previewHtml}
          />
          <p className="border-t border-stone/60 px-4 py-2 text-[0.65rem] text-ink/45">
            Sample values: {Object.keys(EMAIL_SAMPLE_VALUES).slice(0, 6).join(", ")}…
          </p>
        </section>
      </div>
    </div>
  );
}
