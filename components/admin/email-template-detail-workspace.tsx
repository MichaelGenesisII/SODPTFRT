"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  restoreEmailTemplateOverride,
  saveEmailTemplateOverride,
  type EmailTemplateActionResult,
} from "@/app/admin/email-templates/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { formatAdminDate } from "@/lib/admin/students";
import {
  catalogEntryForSlug,
  EMAIL_SAMPLE_VALUES,
  EMAIL_TEMPLATE_CATEGORY_LABELS,
  formatEmailHtmlForEditor,
  renderTemplatePreview,
  templateCategoryForSlug,
  type EmailTemplateSlug,
} from "@/lib/email/template-catalog";
import type { EmailTemplateOverride } from "@/lib/email/template-overrides";

type EditorTab = "html" | "text";
type DetailPanel = "edit" | "preview";
type PendingConfirm = "restore" | "discard";

export function EmailTemplateDetailWorkspace({
  template,
  backHref,
}: {
  template: EmailTemplateOverride;
  backHref: string;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);

  const slug = template.slug;
  const catalog = catalogEntryForSlug(slug);

  const activeSubject =
    template.subject?.trim() ||
    template.default_subject ||
    catalog?.defaultSubject ||
    "";
  const activeHtml = formatEmailHtmlForEditor(
    template.html_body?.trim() ||
      template.default_html ||
      catalog?.defaultHtml ||
      "",
  );
  const activeText = template.text_body ?? "";

  const [panel, setPanel] = useState<DetailPanel>("edit");
  const [editorTab, setEditorTab] = useState<EditorTab>("html");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const [subject, setSubject] = useState(activeSubject);
  const [html, setHtml] = useState(activeHtml);
  const [textBody, setTextBody] = useState(activeText);

  useEffect(() => {
    setSubject(activeSubject);
    setHtml(activeHtml);
    setTextBody(activeText);
    setEditorTab("html");
  }, [template, activeSubject, activeHtml, activeText]);

  const isDirty =
    subject !== activeSubject ||
    html !== activeHtml ||
    textBody !== activeText;

  const previewSubject = useMemo(
    () => renderTemplatePreview(subject),
    [subject],
  );
  const previewHtml = useMemo(() => renderTemplatePreview(html), [html]);

  const sampleKeys = useMemo(
    () => Object.keys(EMAIL_SAMPLE_VALUES).slice(0, 8),
    [],
  );

  useEffect(() => {
    if (!pendingConfirm) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setPendingConfirm(null);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingConfirm, busy]);

  function run(
    action: () => Promise<EmailTemplateActionResult>,
    options?: { label?: string },
  ) {
    const label = options?.label ?? "Working…";
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          success(result.message, "Email templates");
          setPendingConfirm(null);
          router.refresh();
        } else {
          error(result.message, "Email templates");
        }
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

  function requestLeave() {
    if (busy) return;
    if (isDirty) {
      setPendingConfirm("discard");
      return;
    }
    router.push(backHref);
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    if (pendingConfirm === "discard") {
      setPendingConfirm(null);
      router.push(backHref);
      return;
    }
    run(() => restoreEmailTemplateOverride(slug), {
      label: "Restoring default…",
    });
  }

  return (
    <div className="relative space-y-4 pb-28" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy && !pendingConfirm}
        label={busyLabel ?? "Working…"}
      />

      <button
        type="button"
        disabled={busy}
        onClick={requestLeave}
        className="inline-flex min-h-[2.75rem] items-center gap-2 border border-pine/35 bg-white px-4 py-2.5 text-sm font-medium text-pine shadow-[0_1px_0_rgba(20,53,44,0.06)] transition-colors hover:border-pine hover:bg-mist disabled:opacity-50"
      >
        <span aria-hidden className="text-base leading-none">
          ←
        </span>
        All templates
      </button>

      <header className="border border-stone bg-mist/40 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
            {catalog
              ? EMAIL_TEMPLATE_CATEGORY_LABELS[templateCategoryForSlug(slug)]
              : "Template"}
          </p>
          <h2 className="mt-1 font-display text-[clamp(1.35rem,3vw,1.85rem)] tracking-[-0.02em] text-pine">
            {catalog?.label ?? slug}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
            {catalog?.description ??
              "Edit the outbound copy for this template."}
          </p>
          <p className="mt-2 text-xs text-ink/45">
            {template.hasOverride
              ? `Customised · v${template.version}${
                  template.updated_at
                    ? ` · saved ${formatAdminDate(template.updated_at)}`
                    : ""
                }`
              : "Using the built-in default."}
            {isDirty ? " · Unsaved changes" : ""}
          </p>
        </div>
      </header>

      <div className="min-w-0 space-y-4">
        {panel === "edit" ? (
          <div className="space-y-5">
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
                  Click to insert into the{" "}
                  {editorTab === "html" ? "HTML" : "plain text"} editor.
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
                          active
                            ? "text-pine"
                            : "text-ink/45 hover:text-ink/70"
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
          </div>
        ) : null}

        {panel === "preview" ? (
          <section className="min-w-0 overflow-hidden border border-stone bg-white/70">
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
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone bg-mist/95 px-4 py-3 shadow-[0_-6px_28px_-12px_rgba(20,53,44,0.18)] backdrop-blur-sm sm:px-6 lg:left-72">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div
            className="flex w-full sm:w-auto"
            role="tablist"
            aria-label="Template view"
          >
            {(
              [
                { id: "edit" as const, label: "Edit" },
                { id: "preview" as const, label: "Preview" },
              ] as const
            ).map((tab) => {
              const active = panel === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={busy}
                  onClick={() => setPanel(tab.id)}
                  className={`inline-flex min-h-[2.75rem] flex-1 items-center justify-center border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 sm:min-w-[7rem] sm:flex-none ${
                    active
                      ? "border-pine bg-pine text-mist"
                      : "border-stone bg-white/80 text-ink/70 hover:border-pine/35 hover:text-pine"
                  } ${tab.id === "edit" ? "border-r-0" : ""}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              disabled={busy || !template.hasOverride}
              onClick={() => setPendingConfirm("restore")}
              className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center border border-stone bg-white/80 px-4 py-2 text-sm font-medium text-ink/75 transition-colors hover:border-pine/40 hover:text-pine disabled:opacity-40 sm:flex-none"
            >
              Restore default
            </button>
            <button
              type="button"
              disabled={busy || !isDirty}
              onClick={() =>
                run(
                  () =>
                    saveEmailTemplateOverride({
                      slug: slug as EmailTemplateSlug,
                      subject,
                      html,
                      text: textBody || undefined,
                    }),
                  { label: "Saving template…" },
                )
              }
              className="inline-flex min-h-[2.75rem] min-w-[7.5rem] flex-1 items-center justify-center bg-pine px-4 py-2 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-50 sm:flex-none"
            >
              {busy && busyLabel?.startsWith("Saving") ? (
                <DeskLoader label="Saving…" tone="mist" />
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      </div>

      {pendingConfirm ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={
                busyLabel ??
                (pendingConfirm === "restore"
                  ? "Restoring default…"
                  : "Leaving…")
              }
            />
            <p
              className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
                pendingConfirm === "restore"
                  ? "text-red-800/80"
                  : "text-celadon"
              }`}
            >
              {pendingConfirm === "restore" ? "Restore default" : "Unsaved changes"}
            </p>
            <h3
              id="template-confirm-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              {pendingConfirm === "restore"
                ? "Restore default?"
                : "Leave without saving?"}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              {pendingConfirm === "restore" ? (
                <>
                  This removes your saved override for{" "}
                  <span className="font-medium text-ink">
                    {catalog?.label ?? slug}
                  </span>{" "}
                  and returns to the built-in copy. This cannot be undone.
                </>
              ) : (
                <>
                  You have unsaved edits to this template. Leaving now discards
                  those changes.
                </>
              )}
            </p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPendingConfirm(null)}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmPendingAction}
                className={`inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center px-4 py-2.5 text-sm font-medium text-mist transition-colors disabled:opacity-60 ${
                  pendingConfirm === "restore"
                    ? "bg-[#5c2a2a] hover:bg-red-900"
                    : "bg-pine hover:bg-celadon"
                }`}
              >
                {busy && pendingConfirm === "restore" ? (
                  <DeskLoader label="Restoring…" tone="mist" />
                ) : pendingConfirm === "restore" ? (
                  "Restore default"
                ) : (
                  "Discard and leave"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
