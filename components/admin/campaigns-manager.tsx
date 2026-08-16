"use client";

import { useMemo, useState, useTransition } from "react";
import { sendStudentCampaign } from "@/app/admin/campaigns/actions";
import { useToast } from "@/components/ui/toast";
import { buildCampaignPreview } from "@/lib/email/campaign-preview";
import type { CampaignRecipient } from "@/lib/email/campaigns";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";

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
    setConfirmOpen(false);
    const ids = [...selected];
    startTransition(async () => {
      const result = await sendStudentCampaign({
        studentIds: ids,
        personalNote,
        customSubject,
        customHeadline,
        customBody,
        parishId: parishFilter || undefined,
        batchId: batchFilter || undefined,
        unpaidOnly: unpaidOnly || undefined,
      });
      if (result.ok) {
        success(result.message, "Campaigns");
        if (typeof result.remaining === "number") {
          info(`${result.remaining} emails left in this rate window.`, "Quota");
        }
        setSelected(new Set());
      } else {
        error(result.message, "Campaigns");
      }
    });
  }

  return (
    <div className="space-y-5">
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
              placeholder="e.g. Payment due Friday, or Zoom opens at 7:25pm"
            />
          </label>
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
                pending ||
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
            filtered.map((r) => {
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
      </section>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="campaign-confirm-title"
        >
          <div className="w-full max-w-md border border-stone bg-mist p-5 shadow-lg">
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
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="border border-stone px-3 py-2 text-sm text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={runSend}
                className="bg-pine px-3 py-2 text-sm font-medium text-mist disabled:opacity-50"
              >
                {pending ? "Sending…" : "Confirm send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
