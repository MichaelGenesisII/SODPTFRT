"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveCampaignDraft,
  sendSavedCampaign,
  type AdminCampaignDetail,
  type CampaignActionResult,
} from "@/app/admin/campaigns/actions";
import {
  CampaignDeskFilters,
  defaultCampaignDeskFilters,
  type CampaignDeskFilterState,
} from "@/components/admin/campaign-desk-filters";
import { DeskAttachmentPicker } from "@/components/admin/desk-attachment-picker";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  campaignListLabel,
  campaignStatusLabel,
  formatCampaignUpdated,
  type AdminCampaignRecord,
} from "@/lib/admin/campaign-records";
import { buildCampaignPreview } from "@/lib/email/campaign-preview";
import {
  CAMPAIGN_MAX_ATTACHMENTS,
  type CampaignRecipient,
} from "@/lib/email/campaigns";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { type Cohort } from "@/lib/cohorts";
import { formatAttachmentSize } from "@/lib/desk-attachments";
import { type Batch, type Parish } from "@/lib/parishes";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const RECIPIENT_PAGE_SIZE = 8;

const fieldClass =
  "mt-1 w-full border border-stone bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-pine";

type DetailPanel = "audience" | "message";
type PendingConfirm = "send" | "discard";

function sameIdSet(a: Iterable<string>, b: Iterable<string>) {
  const left = [...a].sort();
  const right = [...b].sort();
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

function filtersFromCampaign(
  campaign: AdminCampaignRecord,
  national: boolean,
  parishId: string | null,
): CampaignDeskFilterState {
  return {
    ...defaultCampaignDeskFilters(parishId, national),
    parish: national
      ? campaign.filter_parish_id ?? ""
      : parishId ?? "",
    cohort: campaign.filter_cohort_id ?? "",
    batch: campaign.filter_batch_id ?? "",
    saturday: campaign.filter_saturday
      ? String(campaign.filter_saturday)
      : "",
    payment: campaign.filter_payment,
  };
}

function matchesCampaignFilters(
  recipient: CampaignRecipient,
  filters: CampaignDeskFilterState,
): boolean {
  if (filters.parish && recipient.parish_id !== filters.parish) return false;
  if (filters.cohort && recipient.cohort_id !== filters.cohort) return false;
  if (filters.batch && recipient.batch_id !== filters.batch) return false;
  if (
    filters.saturday &&
    String(recipient.saturday_slot ?? "") !== filters.saturday
  ) {
    return false;
  }
  if (filters.payment === "unpaid" && recipient.payment_status !== "unpaid") {
    return false;
  }
  if (
    filters.payment === "pending_review" &&
    recipient.payment_status !== "pending_review"
  ) {
    return false;
  }
  if (filters.payment === "paid" && recipient.payment_status !== "paid") {
    return false;
  }
  return true;
}

function buildSavePayload(
  campaignId: string,
  filters: CampaignDeskFilterState,
  selected: Set<string>,
  attachments: { id: string }[],
  fields: {
    title: string;
    subject: string;
    headline: string;
    body: string;
    personalNote: string;
  },
) {
  return {
    campaignId,
    title: fields.title,
    subject: fields.subject,
    headline: fields.headline,
    body: fields.body,
    personalNote: fields.personalNote,
    filterParishId: filters.parish || undefined,
    filterCohortId: filters.cohort || undefined,
    filterBatchId: filters.batch || undefined,
    filterSaturday: filters.saturday
      ? (Number(filters.saturday) as 1 | 2 | 3 | 4)
      : null,
    filterPayment: filters.payment,
    recipientIds: [...selected],
    attachmentIds: attachments.map((item) => item.id),
  };
}

export function CampaignDetailWorkspace({
  initialDetail,
  recipients,
  profile,
  parishes,
  batches,
  cohorts,
  backHref,
}: {
  initialDetail: AdminCampaignDetail;
  recipients: CampaignRecipient[];
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Pick<
    Batch,
    "id" | "parish_id" | "cohort_id" | "name" | "year"
  >[];
  cohorts: Pick<Cohort, "id" | "name" | "year_start" | "year_end">[];
  backHref: string;
}) {
  const router = useRouter();
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const national = isNationalAdmin(profile);
  const readOnly = initialDetail.campaign.status === "sent";

  const [panel, setPanel] = useState<DetailPanel>("audience");
  const [title, setTitle] = useState(initialDetail.campaign.title);
  const [subject, setSubject] = useState(initialDetail.campaign.subject);
  const [headline, setHeadline] = useState(initialDetail.campaign.headline);
  const [body, setBody] = useState(initialDetail.campaign.body);
  const [personalNote, setPersonalNote] = useState(
    initialDetail.campaign.personal_note ?? "",
  );
  const [filters, setFilters] = useState<CampaignDeskFilterState>(() =>
    filtersFromCampaign(
      initialDetail.campaign,
      national,
      profile.parish_id,
    ),
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialDetail.campaign.recipient_ids),
  );
  const [attachments, setAttachments] = useState(initialDetail.attachments);
  const [recipientPage, setRecipientPage] = useState(1);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  useEffect(() => {
    setTitle(initialDetail.campaign.title);
    setSubject(initialDetail.campaign.subject);
    setHeadline(initialDetail.campaign.headline);
    setBody(initialDetail.campaign.body);
    setPersonalNote(initialDetail.campaign.personal_note ?? "");
    setFilters(
      filtersFromCampaign(
        initialDetail.campaign,
        national,
        profile.parish_id,
      ),
    );
    setSelected(new Set(initialDetail.campaign.recipient_ids));
    setAttachments(initialDetail.attachments);
  }, [initialDetail, national, profile.parish_id]);

  const baselineFilters = useMemo(
    () =>
      filtersFromCampaign(
        initialDetail.campaign,
        national,
        profile.parish_id,
      ),
    [initialDetail.campaign, national, profile.parish_id],
  );

  const isDirty = useMemo(() => {
    if (readOnly) return false;
    const campaign = initialDetail.campaign;
    if (title !== campaign.title) return true;
    if (subject !== campaign.subject) return true;
    if (headline !== campaign.headline) return true;
    if (body !== campaign.body) return true;
    if (personalNote !== (campaign.personal_note ?? "")) return true;
    if (
      filters.parish !== baselineFilters.parish ||
      filters.cohort !== baselineFilters.cohort ||
      filters.batch !== baselineFilters.batch ||
      filters.saturday !== baselineFilters.saturday ||
      filters.payment !== baselineFilters.payment
    ) {
      return true;
    }
    if (!sameIdSet(selected, campaign.recipient_ids)) return true;
    if (
      !sameIdSet(
        attachments.map((item) => item.id),
        campaign.attachment_ids,
      )
    ) {
      return true;
    }
    return false;
  }, [
    readOnly,
    initialDetail.campaign,
    title,
    subject,
    headline,
    body,
    personalNote,
    filters,
    baselineFilters,
    selected,
    attachments,
  ]);

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

  const preview = useMemo(
    () =>
      buildCampaignPreview({
        personalNote,
        customSubject: subject,
        customHeadline: headline,
        customBody: body,
        sampleFirstName: "Alex",
      }),
    [personalNote, subject, headline, body],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipients.filter((r) => {
      if (!matchesCampaignFilters(r, filters)) return false;
      if (!q) return true;
      const hay = [
        r.first_name,
        r.last_name,
        r.email,
        r.parish_name,
        r.cohort_name,
        r.batch_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [recipients, filters, query]);

  const recipientTotalPages = Math.max(
    1,
    Math.ceil(filtered.length / RECIPIENT_PAGE_SIZE),
  );
  const currentRecipientPage = Math.min(recipientPage, recipientTotalPages);
  const recipientStart = (currentRecipientPage - 1) * RECIPIENT_PAGE_SIZE;
  const pageRecipients = filtered.slice(
    recipientStart,
    recipientStart + RECIPIENT_PAGE_SIZE,
  );

  useEffect(() => {
    setRecipientPage(1);
  }, [filters, query]);

  useEffect(() => {
    if (recipientPage > recipientTotalPages) {
      setRecipientPage(recipientTotalPages);
    }
  }, [recipientPage, recipientTotalPages]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const canSend =
    Boolean(subject.trim()) &&
    Boolean(body.trim()) &&
    selected.size > 0 &&
    !readOnly;

  function toggleOne(id: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const r of filtered) next.delete(r.id);
      } else {
        for (const r of filtered) next.add(r.id);
      }
      return next;
    });
  }

  function run(
    action: () => Promise<CampaignActionResult>,
    options?: { label?: string; after?: () => void },
  ) {
    setBusyLabel(options?.label ?? "Working…");
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          success(result.message, "Campaigns");
          router.refresh();
          options?.after?.();
        } else {
          error(result.message, "Campaigns");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function handleSave(then?: () => void) {
    run(
      () =>
        saveCampaignDraft(
          buildSavePayload(
            initialDetail.campaign.id,
            filters,
            selected,
            attachments,
            { title, subject, headline, body, personalNote },
          ),
        ),
      { label: "Saving campaign…", after: then },
    );
  }

  function handleSend() {
    if (!canSend || busy) return;
    setBusyLabel("Sending campaign…");
    startTransition(async () => {
      try {
        const result = await sendSavedCampaign(initialDetail.campaign.id);
        if (result.ok) {
          success(result.message, "Campaigns");
          setPendingConfirm(null);
          if (typeof result.remaining === "number") {
            info(
              `${result.remaining} emails left in this rate window.`,
              "Quota",
            );
          }
          router.refresh();
        } else {
          error(result.message, "Campaigns");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function openSendConfirm() {
    if (!subject.trim() || !body.trim()) {
      error("Add a subject and body before sending.", "Campaigns");
      setPanel("message");
      return;
    }
    if (selected.size === 0) {
      error("Select at least one student before sending.", "Campaigns");
      setPanel("audience");
      return;
    }
    handleSave(() => setPendingConfirm("send"));
  }

  function requestLeave() {
    if (busy) return;
    if (!readOnly && isDirty) {
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
    handleSend();
  }

  return (
    <div className="relative space-y-4" aria-busy={busy}>
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
        All campaigns
      </button>

      <header className="flex flex-wrap items-end justify-between gap-3 border border-stone bg-mist/40 px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1">
          {!readOnly ? (
            <label className="block">
              <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Campaign title
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
                maxLength={120}
                className="mt-1 w-full max-w-xl border border-stone bg-white/80 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50"
                placeholder="Internal label for this campaign"
              />
            </label>
          ) : (
            <>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Campaign
              </p>
              <h2 className="mt-1 font-display text-xl text-pine">
                {campaignListLabel(initialDetail.campaign)}
              </h2>
            </>
          )}
          <p className="mt-2 text-xs text-ink/50">
            {campaignStatusLabel(initialDetail.campaign.status)}
            {" · "}
            Updated {formatCampaignUpdated(initialDetail.campaign.updated_at)}
            {initialDetail.campaign.status === "sent" &&
            initialDetail.campaign.sent_at
              ? ` · Sent ${formatCampaignUpdated(initialDetail.campaign.sent_at)} to ${initialDetail.campaign.sent_count} students`
              : null}
            {!readOnly && isDirty ? " · Unsaved changes" : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleSave()}
                className="inline-flex min-h-[2.5rem] items-center justify-center border border-pine/25 px-4 py-2 text-sm font-medium text-pine disabled:opacity-50"
              >
                {busy && busyLabel?.startsWith("Saving") ? (
                  <DeskLoader label="Saving…" />
                ) : (
                  "Save"
                )}
              </button>
              <button
                type="button"
                disabled={busy || !canSend}
                onClick={openSendConfirm}
                className="inline-flex min-h-[2.5rem] min-w-[8rem] items-center justify-center bg-pine px-4 py-2 text-sm font-medium text-mist disabled:opacity-50"
              >
                Send campaign
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="min-w-0 space-y-4">
          <nav
            className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
            aria-label="Campaign editor"
          >
            {(
              [
                { id: "audience" as const, label: "Audience" },
                { id: "message" as const, label: "Message" },
              ] as const
            ).map((tab) => {
              const active = panel === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPanel(tab.id)}
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

          {panel === "audience" ? (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 border border-stone bg-mist/40 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
                <div>
                  <p className="text-sm text-ink/60">
                    Filter the list, then tick who should receive this email.
                  </p>
                  <p className="mt-1 text-sm font-medium text-pine">
                    {selected.size} selected · {filtered.length} matching filter
                  </p>
                </div>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    disabled={busy}
                    className="border border-pine/25 px-3 py-1.5 text-sm text-pine disabled:opacity-50"
                  >
                    {allFilteredSelected ? "Clear filtered" : "Select filtered"}
                  </button>
                ) : null}
              </div>

              <CampaignDeskFilters
                query={query}
                onQueryChange={setQuery}
                filters={filters}
                onFiltersChange={readOnly ? () => {} : setFilters}
                parishes={parishes}
                cohorts={cohorts}
                batches={batches}
                national={national}
                resultCount={filtered.length}
                totalCount={recipients.length}
                disabled={busy || readOnly}
              />

              <ul className="max-h-[min(52vh,28rem)] divide-y divide-stone overflow-y-auto border border-stone bg-white/50">
                {filtered.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-ink/50">
                    No students match these filters.
                  </li>
                ) : (
                  pageRecipients.map((r) => {
                    const checked = selected.has(r.id);
                    return (
                      <li key={r.id}>
                        <label
                          className={`flex items-start gap-3 px-3 py-2.5 ${
                            readOnly
                              ? "cursor-default"
                              : "cursor-pointer hover:bg-pine/[0.03]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(r.id)}
                            className="mt-1 accent-pine"
                            disabled={busy || readOnly}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {r.first_name} {r.last_name}
                            </span>
                            <span className="block truncate text-xs text-ink/50">
                              {r.email}
                              {r.cohort_name ? ` · ${r.cohort_name}` : ""}
                              {r.parish_name ? ` · ${r.parish_name}` : ""}
                              {r.batch_name ? ` · ${r.batch_name}` : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
              <DeskPagination
                page={currentRecipientPage}
                totalItems={filtered.length}
                pageSize={RECIPIENT_PAGE_SIZE}
                onPageChange={setRecipientPage}
                itemLabel="recipients"
              />
            </section>
          ) : null}

          {panel === "message" ? (
            <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
              <section className="space-y-3 border border-stone bg-mist/40 p-4 sm:p-5">
                <p className="text-sm text-ink/60">
                  Write the subject and body. Each student is addressed by first
                  name.
                </p>
                <label className="block text-xs text-ink/50">
                  Subject
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className={fieldClass}
                    maxLength={180}
                    disabled={busy || readOnly}
                  />
                </label>
                <label className="block text-xs text-ink/50">
                  Headline
                  <input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className={fieldClass}
                    maxLength={160}
                    disabled={busy || readOnly}
                  />
                </label>
                <label className="block text-xs text-ink/50">
                  Body
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className={`${fieldClass} min-h-32`}
                    maxLength={5000}
                    disabled={busy || readOnly}
                  />
                </label>
                <label className="block text-xs text-ink/50">
                  Optional note (appended)
                  <textarea
                    value={personalNote}
                    onChange={(e) => setPersonalNote(e.target.value)}
                    className={`${fieldClass} min-h-20`}
                    maxLength={1200}
                    disabled={busy || readOnly}
                  />
                </label>
                {!readOnly ? (
                  <div>
                    <p className="text-xs text-ink/50">Email attachments</p>
                    <div className="mt-1">
                      <DeskAttachmentPicker
                        value={attachments}
                        onChange={setAttachments}
                        disabled={busy}
                        maxFiles={CAMPAIGN_MAX_ATTACHMENTS}
                      />
                    </div>
                  </div>
                ) : attachments.length > 0 ? (
                  <ul className="space-y-1 border border-stone bg-white/60 px-3 py-2.5 text-sm text-ink/70">
                    {attachments.map((file) => (
                      <li key={file.id} className="flex flex-wrap gap-x-2">
                        <span className="min-w-0 truncate font-medium text-ink">
                          {file.original_name}
                        </span>
                        <span className="text-[0.65rem] tabular-nums text-ink/45">
                          {formatAttachmentSize(file.byte_size)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <aside className="min-w-0 border border-stone bg-white/70 xl:sticky xl:top-4">
                <div className="border-b border-stone px-4 py-3">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                    Preview
                  </p>
                  <p className="mt-0.5 text-xs text-ink/55">
                    Sample only · “Alex” · no real student data
                  </p>
                  <p className="mt-2 text-sm font-medium text-ink">
                    {preview.subject || "Subject preview"}
                  </p>
                </div>
                <div className="bg-[#e8efe9] p-3">
                  <iframe
                    title="Campaign email preview"
                    sandbox=""
                    srcDoc={preview.html}
                    className="h-[min(58vh,32rem)] w-full border-0 bg-[#e8efe9]"
                  />
                </div>
              </aside>
            </div>
          ) : null}
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
            aria-labelledby="campaign-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={
                busyLabel ??
                (pendingConfirm === "send"
                  ? "Sending campaign…"
                  : "Leaving…")
              }
            />
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              {pendingConfirm === "send" ? "Send campaign" : "Unsaved changes"}
            </p>
            <h3
              id="campaign-confirm-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              {pendingConfirm === "send"
                ? "Send this campaign?"
                : "Leave without saving?"}
            </h3>
            {pendingConfirm === "send" ? (
              <>
                <p className="mt-3 text-sm leading-relaxed text-ink/70">
                  This emails{" "}
                  <span className="font-medium text-ink">{selected.size}</span>{" "}
                  student{selected.size === 1 ? "" : "s"}. Subject:{" "}
                  <span className="font-medium text-ink">{subject.trim()}</span>
                </p>
                {attachments.length > 0 ? (
                  <ul className="mt-3 space-y-1 border border-stone bg-white/60 px-3 py-2.5 text-sm text-ink/70">
                    {attachments.map((file) => (
                      <li key={file.id} className="flex flex-wrap gap-x-2">
                        <span className="min-w-0 truncate font-medium text-ink">
                          {file.original_name}
                        </span>
                        <span className="text-[0.65rem] tabular-nums text-ink/45">
                          {formatAttachmentSize(file.byte_size)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-ink/70">
                You have unsaved edits to this campaign. Leaving now discards
                those changes.
              </p>
            )}
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
                className="inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
              >
                {busy && pendingConfirm === "send" ? (
                  <DeskLoader label="Sending…" tone="mist" />
                ) : pendingConfirm === "send" ? (
                  "Confirm send"
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
