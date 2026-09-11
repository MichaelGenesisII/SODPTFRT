"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCampaign,
  deleteCampaign,
  type AdminCampaignListItem,
} from "@/app/admin/campaigns/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import {
  campaignListLabel,
  campaignStatusLabel,
  formatCampaignUpdated,
} from "@/lib/admin/campaign-records";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const PAGE_SIZE = 10;

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden
    >
      <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6.5 7v5M9.5 7v5M4 4.5l.75 8a1 1 0 0 0 1 .9h4.5a1 1 0 0 0 1-.9l.75-8" />
    </svg>
  );
}

export function CampaignsManager({
  campaigns,
}: {
  campaigns: AdminCampaignListItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((item) => {
      const hay = [
        item.title,
        item.subject,
        campaignStatusLabel(item.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [campaigns, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const draftCount = campaigns.filter((c) => c.status === "draft").length;
  const sentCount = campaigns.filter((c) => c.status === "sent").length;

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function openCampaign(id: string) {
    if (busy) return;
    router.push(campaignDetailHref(id));
  }

  async function requestDelete(item: AdminCampaignListItem) {
    if (busy) return;
    const ok = await deskConfirm({
      title: "Remove this campaign?",
      text: `“${campaignListLabel(item)}” will be permanently deleted${
        item.status === "sent" ? ", including its send record" : ""
      }. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;

    setBusyLabel("Deleting campaign…");
    startTransition(async () => {
      try {
        const result = await deleteCampaign(item.id);
        if (result.ok) {
          await deskSuccess({ text: result.message });
          router.refresh();
        } else {
          await deskError({ text: result.message });
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function campaignDetailHref(id: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", String(page));
    const from = params.toString();
    return from
      ? `/admin/campaigns/${id}?from=${encodeURIComponent(from)}`
      : `/admin/campaigns/${id}`;
  }

  function handleCreate() {
    if (busy) return;
    setBusyLabel("Creating draft…");
    startTransition(async () => {
      try {
        const result = await createCampaign();
        if (result.ok && result.campaignId) {
          router.push(campaignDetailHref(result.campaignId));
          router.refresh();
        } else {
          await deskError({ text: result.message });
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="relative space-y-4" aria-busy={busy}>
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />

      <div
        data-tour="campaigns-stats"
        className="grid gap-px border border-stone bg-stone sm:grid-cols-3"
      >
        {[
          { label: "Campaigns", value: campaigns.length, hint: "Drafts and sent" },
          { label: "Drafts", value: draftCount, hint: "Ready to edit" },
          { label: "Sent", value: sentCount, hint: "Completed sends" },
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

      <section
        data-tour="campaigns-desk"
        className="border border-stone bg-mist/40 p-4 sm:p-5"
      >
        <div
          data-tour="campaigns-toolbar"
          className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="min-w-0 flex-1">
            <label className="block">
              <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                Search campaigns
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Title or subject…"
                disabled={busy}
                className="mt-2 w-full max-w-md border border-stone bg-white/80 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handleCreate}
            className="inline-flex min-h-[2.5rem] items-center justify-center bg-pine px-4 py-2 text-sm font-medium text-mist disabled:opacity-50"
          >
            {busy && busyLabel?.startsWith("Creating") ? (
              <DeskLoader label="Creating…" tone="mist" />
            ) : (
              "New campaign"
            )}
          </button>
        </div>

        <div
          data-tour="campaigns-list"
          className="mt-4 overflow-x-auto border border-stone bg-white/50"
        >
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-stone bg-mist/60 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
              <tr>
                <th className="px-3 py-2.5 font-medium">Campaign</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Recipients</th>
                <th className="px-3 py-2.5 font-medium">Updated</th>
                <th className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone">
              {pageItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-ink/50"
                  >
                    {campaigns.length === 0
                      ? "No campaigns yet. Create a draft to compose and send."
                      : "No campaigns match your search."}
                  </td>
                </tr>
              ) : (
                pageItems.map((item) => (
                  <tr
                    key={item.id}
                    role="link"
                    tabIndex={busy ? -1 : 0}
                    onClick={() => openCampaign(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openCampaign(item.id);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-pine/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pine"
                    aria-label={`Open ${campaignListLabel(item)}`}
                  >
                    <td className="px-3 py-3">
                      <span className="block min-w-0 font-medium text-pine">
                        {campaignListLabel(item)}
                      </span>
                      {item.subject.trim() &&
                      item.title.trim() &&
                      item.title !== item.subject.trim() ? (
                        <p className="mt-0.5 truncate text-xs text-ink/50">
                          {item.subject.trim()}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-xs font-medium uppercase tracking-[0.1em] ${
                          item.status === "sent"
                            ? "text-celadon"
                            : "text-ink/55"
                        }`}
                      >
                        {campaignStatusLabel(item.status)}
                      </span>
                      {item.status === "sent" && item.sent_at ? (
                        <p className="mt-0.5 text-xs text-ink/45">
                          {item.sent_count} sent
                          {item.failed_count > 0
                            ? ` · ${item.failed_count} failed`
                            : ""}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-ink/70">
                      {item.recipient_ids.length}
                    </td>
                    <td className="px-3 py-3 text-xs text-ink/55">
                      {formatCampaignUpdated(item.updated_at)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void requestDelete(item);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center border border-red-900/20 text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50"
                        aria-label={`Delete ${campaignListLabel(item)}`}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <DeskPagination
          page={currentPage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="mt-3"
          itemLabel="campaigns"
        />
      </section>
    </div>
  );
}
