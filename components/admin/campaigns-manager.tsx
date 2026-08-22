"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { sendStudentCampaign } from "@/app/admin/campaigns/actions";
import { DeskAttachmentPicker } from "@/components/admin/desk-attachment-picker";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { buildCampaignPreview } from "@/lib/email/campaign-preview";
import {
  CAMPAIGN_MAX_ATTACHMENTS,
  type CampaignRecipient,
} from "@/lib/email/campaigns";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";
import { formatAttachmentSize } from "@/lib/desk-attachments";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const CAMPAIGN_PAGE_SIZE = 8;

const fieldClass =
  "mt-1 w-full border border-stone bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-pine";

type CampaignsManagerProps = {
  recipients: CampaignRecipient[];
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Pick<Batch, "id" | "parish_id" | "name" | "year">[];
};

export function CampaignsManager({
  recipients,
  profile,
  parishes,
  batches,
}: CampaignsManagerProps) {
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const national = isNationalAdmin(profile);

  const [parishFilter, setParishFilter] = useState(
    national ? "" : profile.parish_id ?? "",
  );
  const [batchFilter, setBatchFilter] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [personalNote, setPersonalNote] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [customHeadline, setCustomHeadline] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [recipientPage, setRecipientPage] = useState(1);
  const [campaignAttachments, setCampaignAttachments] = useState<
    { id: string; original_name: string; byte_size: number; mime: string }[]
  >([]);

  const preview = useMemo(
    () =>
      buildCampaignPreview({
        personalNote,
        customSubject,
        customHeadline,
        customBody,
        sampleFirstName: "Alex",
      }),
    [personalNote, customSubject, customHeadline, customBody],
  );

  const filterBatches = useMemo(
    () =>
      batches.filter((b) =>
        parishFilter ? b.parish_id === parishFilter : true,
      ),
    [batches, parishFilter],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipients.filter((r) => {
      if (parishFilter && r.parish_id !== parishFilter) return false;
      if (batchFilter && r.batch_id !== batchFilter) return false;
      if (
        unpaidOnly &&
        r.payment_status !== "unpaid" &&
        r.payment_status !== "pending_review"
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [
        r.first_name,
        r.last_name,
        r.email,
        r.parish_name,
        r.batch_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [recipients, parishFilter, batchFilter, unpaidOnly, query]);

  const recipientTotalPages = Math.max(
    1,
    Math.ceil(filtered.length / CAMPAIGN_PAGE_SIZE),
  );
  const currentRecipientPage = Math.min(recipientPage, recipientTotalPages);
  const recipientStart = (currentRecipientPage - 1) * CAMPAIGN_PAGE_SIZE;
  const pageRecipients = filtered.slice(
    recipientStart,
    recipientStart + CAMPAIGN_PAGE_SIZE,
  );

  useEffect(() => {
    setRecipientPage(1);
  }, [parishFilter, batchFilter, unpaidOnly, query]);

  useEffect(() => {
    if (recipientPage > recipientTotalPages) {
      setRecipientPage(recipientTotalPages);
    }
  }, [recipientPage, recipientTotalPages]);

  const selectedInView = filtered.filter((r) => selected.has(r.id));
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
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

  function runSend() {
    if (busy) return;
    const ids = [...selected];
    setBusyLabel("Sending campaign…");
    startTransition(async () => {
      try {
        const result = await sendStudentCampaign({
          studentIds: ids,
          personalNote,
          customSubject,
          customHeadline,
          customBody,
          parishId: parishFilter || undefined,
          batchId: batchFilter || undefined,
          unpaidOnly: unpaidOnly || undefined,
          attachmentIds: campaignAttachments.map((item) => item.id),
        });
        if (result.ok) {
          success(result.message, "Campaigns");
          if (typeof result.remaining === "number") {
            info(
              `${result.remaining} emails left in this rate window.`,
              "Quota",
            );
          }
          setConfirmOpen(false);
          setSelected(new Set());
          setCampaignAttachments([]);
        } else {
          error(result.message, "Campaigns");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="relative space-y-5" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy && !confirmOpen}
        label={busyLabel ?? "Sending campaign…"}
      />
      <section className="border border-stone bg-mist/40 p-4 sm:p-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Compose
        </p>
        <p className="mt-1 text-sm text-ink/60">
          Write the subject and body. Each student is addressed by first name.
        </p>

        <div className="mt-4 grid gap-3">
          <label className="block text-xs text-ink/50">
            Subject
            <input
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className={fieldClass}
              maxLength={180}
              disabled={busy}
              placeholder="Subject line students will see"
            />
          </label>
          <label className="block text-xs text-ink/50">
            Headline
            <input
              value={customHeadline}
              onChange={(e) => setCustomHeadline(e.target.value)}
              className={fieldClass}
              maxLength={160}
              disabled={busy}
              placeholder="Optional short headline in the email header"
            />
          </label>
          <label className="block text-xs text-ink/50">
            Body
            <textarea
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              className={`${fieldClass} min-h-28`}
              maxLength={5000}
              disabled={busy}
              placeholder="Write the message."
            />
          </label>
          <label className="block text-xs text-ink/50">
            Optional note (appended)
            <textarea
              value={personalNote}
              onChange={(e) => setPersonalNote(e.target.value)}
              className={`${fieldClass} min-h-20`}
              maxLength={1200}
              disabled={busy}
              placeholder="e.g. Payment due Friday, or Zoom opens at 7:25pm"
            />
          </label>
          <div>
            <p className="text-xs text-ink/50">Email attachments</p>
            <div className="mt-1">
              <DeskAttachmentPicker
                value={campaignAttachments}
                onChange={setCampaignAttachments}
                disabled={busy}
                maxFiles={CAMPAIGN_MAX_ATTACHMENTS}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 border border-stone bg-white/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Preview
              </p>
              <p className="mt-0.5 truncate text-xs text-ink/55">
                Sample only · “Alex” · no real student data
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className="border border-pine/25 px-2.5 py-1 text-xs text-pine"
            >
              {previewOpen ? "Hide" : "Show"}
            </button>
          </div>
          {previewOpen ? (
            <div className="p-3 sm:p-4">
              <p className="text-xs text-ink/45">Subject</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {preview.subject}
              </p>
              <div className="mt-3 overflow-hidden border border-stone bg-[#e8efe9]">
                <iframe
                  title="Campaign email preview"
                  sandbox=""
                  srcDoc={preview.html}
                  className="h-[28rem] w-full bg-[#e8efe9]"
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-stone bg-mist/40 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Audience
            </p>
            <p className="mt-1 text-sm text-ink/60">
              {selected.size} selected · {filtered.length} matching filter
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleAllFiltered}
              className="border border-pine/25 px-3 py-1.5 text-sm text-pine"
            >
              {allFilteredSelected ? "Clear filtered" : "Select filtered"}
            </button>
            <button
              type="button"
              disabled={
                busy ||
                selected.size === 0 ||
                !customSubject.trim() ||
                !customBody.trim()
              }
              onClick={() => setConfirmOpen(true)}
              className="bg-pine px-3 py-1.5 text-sm font-medium text-mist disabled:opacity-50"
            >
              Send campaign
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs text-ink/50">
            Search
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={fieldClass}
              placeholder="Name or email"
            />
          </label>
          {national ? (
            <label className="block text-xs text-ink/50">
              Parish
              <select
                value={parishFilter}
                onChange={(e) => {
                  setParishFilter(e.target.value);
                  setBatchFilter("");
                }}
                className={fieldClass}
              >
                <option value="">All parishes</option>
                {parishes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block text-xs text-ink/50">
            Batch
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className={fieldClass}
            >
              <option value="">All batches</option>
              {filterBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {formatBatchLabel(b)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={unpaidOnly}
              onChange={(e) => setUnpaidOnly(e.target.checked)}
              className="accent-pine"
            />
            Unpaid / proof in review only
          </label>
        </div>

        <ul className="mt-4 max-h-[28rem] divide-y divide-stone overflow-y-auto border border-stone bg-white/50">
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-ink/50">
              No students match these filters.
            </li>
          ) : (
            pageRecipients.map((r) => {
              const checked = selected.has(r.id);
              return (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-pine/[0.03]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(r.id)}
                      className="mt-1 accent-pine"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {r.first_name} {r.last_name}
                      </span>
                      <span className="block truncate text-xs text-ink/50">
                        {r.email}
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
          pageSize={CAMPAIGN_PAGE_SIZE}
          onPageChange={setRecipientPage}
          className="mt-3"
          itemLabel="recipients"
        />
      </section>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="campaign-confirm-title"
        >
          <div className="relative w-full max-w-md border border-stone bg-mist p-5 shadow-lg">
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Sending campaign…"}
            />
            <p
              id="campaign-confirm-title"
              className="font-display text-xl text-pine"
            >
              Send this campaign?
            </p>
            <p className="mt-2 text-sm text-ink/70">
              This emails <strong>{selected.size}</strong> student
              {selected.size === 1 ? "" : "s"}
              {selectedInView.length !== selected.size
                ? ` (${selectedInView.length} in the current filter view)`
                : ""}
              . Subject: <strong>{customSubject.trim()}</strong>
            </p>
            {campaignAttachments.length > 0 ? (
              <ul className="mt-3 space-y-1 border border-stone bg-white/60 px-3 py-2.5 text-sm text-ink/70">
                {campaignAttachments.map((file) => (
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
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
                className="border border-stone px-3 py-2 text-sm text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={runSend}
                className="inline-flex min-h-[2.5rem] min-w-[8.5rem] items-center justify-center bg-pine px-3 py-2 text-sm font-medium text-mist disabled:opacity-50"
              >
                {busy ? (
                  <DeskLoader label="Sending…" tone="mist" />
                ) : (
                  "Confirm send"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
