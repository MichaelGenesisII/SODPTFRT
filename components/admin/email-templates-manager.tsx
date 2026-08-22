"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  restoreEmailTemplateOverride,
  saveEmailTemplateOverride,
  type EmailTemplateActionResult,
} from "@/app/admin/email-templates/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  catalogEntryForSlug,
  EMAIL_SAMPLE_VALUES,
  formatEmailHtmlForEditor,
  renderTemplatePreview,
  type EmailTemplateSlug,
} from "@/lib/email/template-catalog";
import type { EmailTemplateOverride } from "@/lib/email/template-overrides";

type EditorTab = "html" | "text";

type EmailTemplatesManagerProps = {
  templates: EmailTemplateOverride[];
};

export function EmailTemplatesManager({
  templates,
}: EmailTemplatesManagerProps) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [selectedSlug, setSelectedSlug] = useState<EmailTemplateSlug>(
    templates[0]?.slug ?? "enrolment-confirmation",
  );
  const [editorTab, setEditorTab] = useState<EditorTab>("html");

  const selected =
    templates.find((t) => t.slug === selectedSlug) ?? templates[0]!;
  const catalog = catalogEntryForSlug(selectedSlug);

  const activeSubject =
    selected.subject?.trim() ||
    selected.default_subject ||
    catalog?.defaultSubject ||
    "";
  const activeHtml = formatEmailHtmlForEditor(
    selected.html_body?.trim() ||
      selected.default_html ||
      catalog?.defaultHtml ||
      "",
  );

  const [subject, setSubject] = useState(activeSubject);
  const [html, setHtml] = useState(activeHtml);
  const [textBody, setTextBody] = useState(selected.text_body ?? "");

  useEffect(() => {
    setSubject(activeSubject);
    setHtml(activeHtml);
    setTextBody(selected.text_body ?? "");
    setEditorTab("html");
  }, [selectedSlug, activeSubject, activeHtml, selected.text_body]);

  const previewSubject = useMemo(
    () => renderTemplatePreview(subject),
    [subject],
  );
  const previewHtml = useMemo(() => renderTemplatePreview(html), [html]);

  const sampleKeys = useMemo(
    () => Object.keys(EMAIL_SAMPLE_VALUES).slice(0, 8),
    [],
  );

  function run(
    action: () => Promise<EmailTemplateActionResult>,
    options?: { label?: string },
  ) {
    const label = options?.label ?? "Working…";
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) success(result.message);
        else error(result.message);
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function insertPlaceholder(token: string) {
    if (editorTab === "html") {
      setHtml((value) => `${value}${value.endsWith("\n") ? "" : ""}${token}`);
      return;
    }
    setTextBody((value) => `${value}${token}`);
  }

  return (
    <div
      className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15.5rem_minmax(0,1fr)]"
      aria-busy={busy}
    >
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Templates
        </p>
        <ul className="mt-3 max-h-[min(70vh,36rem)] space-y-0.5 overflow-y-auto border-y border-stone py-1">
          {templates.map((item) => {
            const cat = catalogEntryForSlug(item.slug);
            const active = item.slug === selectedSlug;
            return (
              <li key={item.slug}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSelectedSlug(item.slug)}
                  className={`flex w-full items-start gap-2 px-2.5 py-2.5 text-left transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-pine text-mist"
                      : "text-ink/70 hover:bg-mist/80 hover:text-pine"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">
                      {cat?.label ?? item.slug}
                    </span>
                    {item.hasOverride ? (
                      <span
                        className={`mt-0.5 block text-[0.6rem] uppercase tracking-[0.12em] ${
                          active ? "text-mist/65" : "text-celadon"
                        }`}
                      >
                        Custom · v{item.version}
                      </span>
                    ) : (
                      <span
                        className={`mt-0.5 block text-[0.6rem] uppercase tracking-[0.12em] ${
                          active ? "text-mist/50" : "text-ink/35"
                        }`}
                      >
                        Default
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="relative min-w-0 space-y-5">
        <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />

        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone pb-4">
          <div className="min-w-0">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Editing
            </p>
            <h2 className="mt-1 font-display text-[clamp(1.35rem,3vw,1.85rem)] tracking-[-0.02em] text-pine">
              {catalog?.label ?? selectedSlug}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
              {catalog?.description ??
                "Edit the outbound copy for this template."}
            </p>
            <p className="mt-2 text-xs text-ink/45">
              {selected.hasOverride
                ? `Customised · v${selected.version}${
                    selected.updated_at
                      ? ` · saved ${new Date(selected.updated_at).toLocaleString()}`
                      : ""
                  }`
                : "Using the built-in default."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !selected.hasOverride}
              onClick={() =>
                run(() => restoreEmailTemplateOverride(selectedSlug), {
                  label: "Restoring default…",
                })
              }
              className="inline-flex min-h-[2.5rem] items-center justify-center border border-stone px-3.5 py-2 text-sm text-ink/75 transition-colors hover:border-pine/40 hover:text-pine disabled:opacity-40"
            >
              {busy && busyLabel?.startsWith("Restoring") ? (
                <DeskLoader label="Restoring…" />
              ) : (
                "Restore default"
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    saveEmailTemplateOverride({
                      slug: selectedSlug,
                      subject,
                      html,
                      text: textBody || undefined,
                    }),
                  { label: "Saving template…" },
                )
              }
              className="inline-flex min-h-[2.5rem] min-w-[7.5rem] items-center justify-center bg-pine px-4 py-2 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-50"
            >
              {busy && busyLabel?.startsWith("Saving") ? (
                <DeskLoader label="Saving…" tone="mist" />
              ) : (
                "Save"
              )}
            </button>
          </div>
        </header>

        <label className="block">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
            Subject line
          </span>
          <input
            className="mt-2 w-full border border-stone bg-white/80 px-3.5 py-3 text-sm text-ink outline-none transition-[border-color] focus:border-pine disabled:opacity-60"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            disabled={busy}
          />
        </label>

        {catalog?.variables.length ? (
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
              Placeholders
            </p>
            <p className="mt-1 text-xs text-ink/50">
              Click to insert into the {editorTab === "html" ? "HTML" : "plain text"}{" "}
              editor.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {catalog.variables.map((token) => (
                <button
                  key={token}
                  type="button"
                  disabled={busy}
                  onClick={() => insertPlaceholder(token)}
                  className="border border-dashed border-pine/30 bg-mist/50 px-2 py-1 font-mono text-[0.7rem] text-pine transition-colors hover:border-pine hover:bg-pine/[0.04] disabled:opacity-50"
                >
                  {token}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
          {/* Editor column */}
          <section className="min-w-0 overflow-hidden border border-stone bg-mist/30">
            <div className="flex items-center justify-between gap-2 border-b border-stone bg-white/50 px-1">
              <div className="flex" role="tablist" aria-label="Body editor">
                {(
                  [
                    { id: "html" as const, label: "HTML" },
                    { id: "text" as const, label: "Plain text" },
                  ] as const
                ).map((tab) => {
                  const active = editorTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={busy}
                      onClick={() => setEditorTab(tab.id)}
                      className={`relative px-3.5 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${
                        active ? "text-pine" : "text-ink/45 hover:text-ink/70"
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`absolute inset-x-3 bottom-0 h-0.5 bg-celadon transition-opacity ${
                          active ? "opacity-100" : "opacity-0"
                        }`}
                        aria-hidden
                      />
                    </button>
                  );
                })}
              </div>
              <p className="pr-3 text-[0.65rem] tabular-nums text-ink/40">
                {editorTab === "html"
                  ? `${html.length.toLocaleString()} chars`
                  : `${textBody.length.toLocaleString()} chars`}
              </p>
            </div>

            {editorTab === "html" ? (
              <label className="block">
                <span className="sr-only">HTML body</span>
                <textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  spellCheck={false}
                  disabled={busy}
                  className="min-h-[28rem] w-full resize-y bg-[#f7faf8] px-4 py-3 font-mono text-[0.78rem] leading-relaxed text-ink/90 outline-none focus:bg-white disabled:opacity-60 sm:min-h-[32rem]"
                  placeholder="Paste or edit the HTML for this email…"
                />
              </label>
            ) : (
              <label className="block">
                <span className="sr-only">Plain text body</span>
                <textarea
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  disabled={busy}
                  className="min-h-[28rem] w-full resize-y bg-white/70 px-4 py-3 text-sm leading-relaxed text-ink outline-none focus:bg-white disabled:opacity-60 sm:min-h-[32rem]"
                  placeholder="Optional plain-text fallback for clients that don’t show HTML…"
                />
              </label>
            )}
          </section>

          {/* Preview column */}
          <section className="min-w-0 overflow-hidden border border-stone bg-white/70 xl:sticky xl:top-4">
            <div className="border-b border-stone px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
                    Inbox preview
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-ink">
                    {previewSubject || "Subject preview"}
                  </p>
                </div>
                <p className="shrink-0 text-[0.65rem] text-ink/40">
                  Sample data
                </p>
              </div>
              <p className="mt-2 line-clamp-2 text-[0.7rem] leading-relaxed text-ink/45">
                {sampleKeys.join(" · ")}
                {Object.keys(EMAIL_SAMPLE_VALUES).length > sampleKeys.length
                  ? "…"
                  : ""}
              </p>
            </div>

            <div className="bg-[#dfe8e2] p-3 sm:p-5">
              <div className="mx-auto max-w-[640px] overflow-hidden border border-pine/10 bg-transparent shadow-[0_18px_50px_-28px_rgba(20,53,44,0.45)]">
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={previewHtml}
                  className="h-[min(36rem,75vh)] w-full border-0 bg-[#dfe8e2]"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
