"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  deleteGallerySelfie,
  flagGallerySelfie,
  getAdminGalleryStudentContext,
  restoreGallerySelfie,
  takeDownGallerySelfie,
  type AdminGalleryCounts,
  type AdminGalleryItem,
  type AdminGalleryTab,
} from "@/app/admin/gallery/actions";
import { GalleryInsight } from "@/components/admin/gallery-insight";
import { useRefreshOnVisible } from "@/components/student/use-refresh-on-visible";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import type { GraduationEligibility } from "@/lib/graduation/eligibility";
import { DeskPagination } from "@/lib/ui/desk-pagination";

type PageView = "desk" | "insight";

type PendingConfirm =
  | { kind: "flag"; userId: string; name: string; note: string }
  | { kind: "takeDown"; userId: string; name: string; note: string }
  | { kind: "restore"; userId: string; name: string }
  | { kind: "delete"; userId: string; name: string; note: string };

type Props = {
  items: AdminGalleryItem[];
  total: number;
  page: number;
  pageSize: number;
  tab: AdminGalleryTab;
  search: string;
  openId: string | null;
  counts: AdminGalleryCounts;
  national: boolean;
};

function galleryHref(input: {
  tab?: AdminGalleryTab;
  page?: number;
  q?: string;
  open?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.tab && input.tab !== "all") params.set("tab", input.tab);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.open) params.set("open", input.open);
  const qs = params.toString();
  return qs ? `/admin/gallery?${qs}` : "/admin/gallery";
}

function studentRelatedFrom(userId: string) {
  return `student:${userId}`;
}

export function AdminGalleryManager({
  items,
  total,
  page,
  pageSize,
  tab,
  search,
  openId: initialOpenId,
  counts,
  national,
}: Props) {
  useRefreshOnVisible();
  const [pageView, setPageView] = useState<PageView>("desk");
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [query, setQuery] = useState(search);
  const [note, setNote] = useState("");
  const [eligibility, setEligibility] = useState<GraduationEligibility | null>(
    null,
  );
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const busy = pending || Boolean(busyLabel);
  const { success, error } = useToast();
  const router = useRouter();

  useEffect(() => {
    setOpenId(initialOpenId);
  }, [initialOpenId]);

  useEffect(() => {
    setQuery(search);
  }, [search]);

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

  const openItem = items.find((item) => item.userId === openId) ?? null;

  useEffect(() => {
    if (openItem) {
      setNote(openItem.moderationNote ?? "");
    }
  }, [openItem]);

  useEffect(() => {
    if (!openId) {
      setEligibility(null);
      setEligibilityLoading(false);
      return;
    }
    let cancelled = false;
    setEligibilityLoading(true);
    void getAdminGalleryStudentContext(openId).then((result) => {
      if (cancelled) return;
      setEligibilityLoading(false);
      setEligibility(result.ok ? result.eligibility : null);
    });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  function navigate(input: {
    tab?: AdminGalleryTab;
    page?: number;
    q?: string;
    open?: string | null;
  }) {
    router.push(galleryHref({ tab, page, q: query, open: openId, ...input }));
  }

  function run(
    action: () => Promise<{ ok: boolean; message: string }>,
    label: string,
    clearNote = true,
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          error(result.message, "Gallery");
          return;
        }
        success(result.message, "Gallery");
        setPendingConfirm(null);
        if (clearNote) setNote("");
        setOpenId(null);
        router.refresh();
      } catch (err) {
        console.error("[gallery/ui]", err);
        error("Something went wrong. Please try again.", "Gallery");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    switch (pendingConfirm.kind) {
      case "flag":
        run(
          () =>
            flagGallerySelfie(pendingConfirm.userId, pendingConfirm.note),
          "Flagging portrait…",
        );
        return;
      case "takeDown":
        run(
          () =>
            takeDownGallerySelfie(
              pendingConfirm.userId,
              pendingConfirm.note,
            ),
          "Taking down…",
        );
        return;
      case "restore":
        run(
          () => restoreGallerySelfie(pendingConfirm.userId),
          "Restoring…",
          false,
        );
        return;
      case "delete":
        run(
          () =>
            deleteGallerySelfie(pendingConfirm.userId, pendingConfirm.note),
          "Deleting…",
        );
    }
  }

  const confirmCopy = (() => {
    if (!pendingConfirm) return null;
    switch (pendingConfirm.kind) {
      case "flag":
        return {
          eyebrow: "Flag portrait",
          title: "Flag this portrait?",
          body: (
            <>
              <span className="font-medium text-ink">{pendingConfirm.name}</span>
              ’s portrait will be hidden from classmates while you investigate.
              {pendingConfirm.note.trim() ? (
                <>
                  {" "}
                  Note:{" "}
                  <span className="font-medium text-ink">
                    {pendingConfirm.note.trim()}
                  </span>
                </>
              ) : null}
            </>
          ),
          confirmLabel: "Flag portrait",
          destructive: false,
        };
      case "takeDown":
        return {
          eyebrow: "Take down",
          title: "Take this portrait down?",
          body: (
            <>
              <span className="font-medium text-ink">{pendingConfirm.name}</span>
              ’s portrait leaves the gallery. They can upload again afterward.
              {pendingConfirm.note.trim() ? (
                <>
                  {" "}
                  Note:{" "}
                  <span className="font-medium text-ink">
                    {pendingConfirm.note.trim()}
                  </span>
                </>
              ) : null}
            </>
          ),
          confirmLabel: "Take down",
          destructive: false,
        };
      case "restore":
        return {
          eyebrow: "Restore portrait",
          title: "Restore this portrait?",
          body: (
            <>
              <span className="font-medium text-ink">{pendingConfirm.name}</span>
              ’s portrait returns to the visible gallery. Any moderation note on
              file will be cleared.
            </>
          ),
          confirmLabel: "Restore",
          destructive: false,
        };
      case "delete":
        return {
          eyebrow: "Delete portrait",
          title: "Delete this portrait permanently?",
          body: (
            <>
              Removes{" "}
              <span className="font-medium text-ink">{pendingConfirm.name}</span>
              ’s graduation selfie from storage. This cannot be undone — they
              would need to upload again if allowed.
              {pendingConfirm.note.trim() ? (
                <>
                  {" "}
                  Note:{" "}
                  <span className="font-medium text-ink">
                    {pendingConfirm.note.trim()}
                  </span>
                </>
              ) : null}
            </>
          ),
          confirmLabel: "Delete permanently",
          destructive: true,
        };
    }
  })();

  return (
    <div className="relative space-y-3 sm:space-y-4" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy && !pendingConfirm}
        label={busyLabel ?? "Working…"}
      />

      <nav
        data-tour="gallery-tabs"
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Gallery page"
      >
        {(
          [
            { id: "desk" as const, label: "Desk" },
            { id: "insight" as const, label: "Insight" },
          ] as const
        ).map((item) => {
          const active = pageView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPageView(item.id)}
              className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                active ? "text-pine" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              {item.label}
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
        <GalleryInsight national={national} />
      ) : (
        <>
          <section
            data-tour="gallery-stats"
            className="grid grid-cols-3 gap-2 sm:gap-3.5"
          >
            <GalleryStatTile
              label="Portraits"
              shortLabel="All"
              value={counts.all}
              hint="With a selfie on file"
            />
            <GalleryStatTile
              label="Flagged"
              value={counts.flagged}
              hint="Hidden pending review"
            />
            <GalleryStatTile
              label="Taken down"
              shortLabel="Down"
              value={counts.takenDown}
              hint="Awaiting re-upload"
            />
          </section>

          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              navigate({ page: 1, q: query, open: null });
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or email"
              className="min-w-0 flex-1 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine sm:max-w-xs"
            />
            <button
              type="submit"
              className="border border-pine/30 px-3 py-2 text-sm font-medium text-pine"
            >
              Search
            </button>
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  navigate({ page: 1, q: "", open: null });
                }}
                className="border border-stone px-3 py-2 text-sm text-ink/55"
              >
                Clear
              </button>
            ) : null}
          </form>

          <nav
            data-tour="gallery-filters"
            className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
            aria-label="Gallery filters"
          >
            {(
              [
                ["all", "All", counts.all],
                ["flagged", "Flagged", counts.flagged],
                ["taken_down", "Taken down", counts.takenDown],
              ] as const
            ).map(([id, label, count]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate({ tab: id, page: 1, open: null })}
                  className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                    active ? "text-pine" : "text-ink/50 hover:text-ink/80"
                  }`}
                >
                  {label}
                  <span className="ml-1.5 tabular-nums text-ink/35">{count}</span>
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

          <section className="border border-stone bg-mist/30">
            <div className="border-b border-stone px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
                {national ? "Network" : "Parish"} gallery
              </p>
              <h2 className="mt-1.5 font-display text-xl text-pine sm:text-2xl">
                Graduation selfies
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
                Tap a portrait to review graduation gate context, open the
                student file or scorecard, then flag, take down, restore, or
                delete.
              </p>
            </div>
            <div className="px-3 py-4 sm:px-5 sm:py-5">
              {items.length === 0 ? (
                <p className="border border-dashed border-stone px-4 py-10 text-center text-sm text-ink/50">
                  No portraits in this view.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {items.map((item) => {
                    const open = openId === item.userId;
                    const relatedFrom = studentRelatedFrom(item.userId);
                    return (
                      <li
                        key={item.userId}
                        className={
                          open
                            ? "col-span-2 sm:col-span-3 lg:col-span-4"
                            : undefined
                        }
                      >
                        <div
                          className={
                            open
                              ? "grid gap-3 border border-pine/30 bg-white/40 p-2 sm:grid-cols-[minmax(0,12rem)_1fr] sm:gap-4 sm:p-3 md:grid-cols-[minmax(0,14rem)_1fr]"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const next = open ? null : item.userId;
                              setOpenId(next);
                              setNote(item.moderationNote ?? "");
                              navigate({ open: next });
                            }}
                            aria-expanded={open}
                            className={`group relative overflow-hidden border text-left transition-colors ${
                              open
                                ? "border-pine"
                                : "border-stone hover:border-pine/40"
                            }`}
                          >
                            <div className="aspect-[3/4] overflow-hidden bg-pine/5">
                              {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.imageUrl}
                                  alt={`Graduation selfie of ${item.displayName}`}
                                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center bg-stone text-xs text-ink/40">
                                  Removed
                                </span>
                              )}
                            </div>
                            <div className="absolute inset-x-0 top-0 flex justify-between gap-1 p-1.5 sm:p-2">
                              <span
                                className={`px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] ${
                                  item.moderationStatus === "flagged"
                                    ? "bg-[#efe8dc] text-[#6b4f2a]"
                                    : item.moderationStatus === "taken_down"
                                      ? "bg-red-50 text-red-900"
                                      : "bg-mist/90 text-pine"
                                }`}
                              >
                                {statusLabel(item.moderationStatus)}
                              </span>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-pine/90 px-2 py-2 sm:px-3 sm:py-2.5">
                              <p className="truncate font-display text-sm leading-snug text-mist sm:text-base">
                                {item.displayName}
                              </p>
                              <p className="mt-0.5 truncate text-[0.6rem] uppercase tracking-[0.08em] text-mist/65">
                                {item.batchLabel || "Batch"}
                                {national && item.parishName
                                  ? ` · ${item.parishName}`
                                  : ""}
                              </p>
                            </div>
                          </button>
                          {open ? (
                            <div className="space-y-3 px-1 py-1 sm:px-0 sm:py-0">
                              <div>
                                <p className="font-display text-lg text-pine">
                                  {item.displayName}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-ink/50">
                                  {item.email}
                                  {national && item.parishName
                                    ? ` · ${item.parishName}`
                                    : ""}
                                </p>
                                {item.uploadedAt ? (
                                  <p className="mt-1 text-xs text-ink/45">
                                    Uploaded{" "}
                                    {new Intl.DateTimeFormat("en-GB", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    }).format(new Date(item.uploadedAt))}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Link
                                  href={`/admin/students/${item.userId}`}
                                  className="inline-flex min-h-[2rem] items-center justify-center border border-stone bg-white/70 px-3 py-1.5 text-sm font-medium text-pine hover:border-pine/40"
                                >
                                  Student file
                                </Link>
                                <Link
                                  href={`/admin/records/${item.userId}?from=${encodeURIComponent(relatedFrom)}`}
                                  className="inline-flex min-h-[2rem] items-center justify-center border border-stone bg-white/70 px-3 py-1.5 text-sm font-medium text-pine hover:border-pine/40"
                                >
                                  Scorecard
                                </Link>
                                <Link
                                  href={`/admin/payments?user=${item.userId}&from=${encodeURIComponent(relatedFrom)}`}
                                  className="inline-flex min-h-[2rem] items-center justify-center border border-stone bg-white/70 px-3 py-1.5 text-sm font-medium text-pine hover:border-pine/40"
                                >
                                  Payments
                                </Link>
                              </div>

                              <GraduationGatePanel
                                loading={eligibilityLoading}
                                eligibility={eligibility}
                              />

                              {item.moderationNote ? (
                                <p className="text-sm text-ink/65">
                                  Last note: {item.moderationNote}
                                </p>
                              ) : null}
                              <label className="block text-sm font-medium text-ink">
                                Reason / note
                                <textarea
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  rows={2}
                                  maxLength={500}
                                  disabled={busy}
                                  placeholder="Why this action is needed"
                                  className="mt-2 w-full border border-stone bg-mist/40 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-60"
                                />
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {item.moderationStatus !== "flagged" &&
                                item.path ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      setPendingConfirm({
                                        kind: "flag",
                                        userId: item.userId,
                                        name: item.displayName,
                                        note,
                                      })
                                    }
                                    className="inline-flex min-h-[2.25rem] min-w-[4rem] items-center justify-center border border-[#c4a574] px-3 py-2 text-sm font-medium text-[#6b4f2a] disabled:opacity-60"
                                  >
                                    {busy &&
                                    busyLabel?.startsWith("Flagging") ? (
                                      <DeskLoader label={busyLabel} />
                                    ) : (
                                      "Flag"
                                    )}
                                  </button>
                                ) : null}
                                {item.moderationStatus !== "taken_down" &&
                                item.path ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      setPendingConfirm({
                                        kind: "takeDown",
                                        userId: item.userId,
                                        name: item.displayName,
                                        note,
                                      })
                                    }
                                    className="inline-flex min-h-[2.25rem] min-w-[5.5rem] items-center justify-center border border-pine/30 px-3 py-2 text-sm font-medium text-pine disabled:opacity-60"
                                  >
                                    {busy &&
                                    busyLabel?.startsWith("Taking") ? (
                                      <DeskLoader label={busyLabel} />
                                    ) : (
                                      "Take down"
                                    )}
                                  </button>
                                ) : null}
                                {item.moderationStatus !== "visible" &&
                                item.path ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      setPendingConfirm({
                                        kind: "restore",
                                        userId: item.userId,
                                        name: item.displayName,
                                      })
                                    }
                                    className="inline-flex min-h-[2.25rem] min-w-[5rem] items-center justify-center border border-stone px-3 py-2 text-sm font-medium text-ink/70 disabled:opacity-60"
                                  >
                                    {busy &&
                                    busyLabel?.startsWith("Restoring") ? (
                                      <DeskLoader label={busyLabel} />
                                    ) : (
                                      "Restore"
                                    )}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    setPendingConfirm({
                                      kind: "delete",
                                      userId: item.userId,
                                      name: item.displayName,
                                      note,
                                    })
                                  }
                                  className="inline-flex min-h-[2.25rem] min-w-[4.5rem] items-center justify-center border border-red-800/30 px-3 py-2 text-sm font-medium text-red-900 disabled:opacity-60"
                                >
                                  {busy &&
                                  busyLabel?.startsWith("Deleting") ? (
                                    <DeskLoader label={busyLabel} />
                                  ) : (
                                    "Delete"
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setOpenId(null);
                                    navigate({ open: null });
                                  }}
                                  className="border border-stone px-3 py-2 text-sm text-ink/55 disabled:opacity-60"
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <DeskPagination
                page={page}
                totalItems={total}
                pageSize={pageSize}
                itemLabel="portraits"
                onPageChange={(nextPage) =>
                  navigate({ page: nextPage, open: null })
                }
                className="mt-4"
              />
            </div>
          </section>
        </>
      )}

      {pendingConfirm && confirmCopy ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Working…"}
            />
            <p
              className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
                confirmCopy.destructive ? "text-red-800/80" : "text-celadon"
              }`}
            >
              {confirmCopy.eyebrow}
            </p>
            <h3
              id="gallery-confirm-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              {confirmCopy.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              {confirmCopy.body}
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
                  confirmCopy.destructive
                    ? "bg-[#5c2a2a] hover:bg-red-900"
                    : "bg-pine hover:bg-celadon"
                }`}
              >
                {busy ? (
                  <DeskLoader label="Working…" tone="mist" />
                ) : (
                  confirmCopy.confirmLabel
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GraduationGatePanel({
  loading,
  eligibility,
}: {
  loading: boolean;
  eligibility: GraduationEligibility | null;
}) {
  if (loading) {
    return (
      <div className="border border-stone bg-white/40 px-3 py-3">
        <DeskLoader label="Loading graduation context…" size="sm" />
      </div>
    );
  }

  if (!eligibility) {
    return (
      <div className="border border-stone bg-white/40 px-3 py-3 text-sm text-ink/50">
        Graduation context is unavailable for this student.
      </div>
    );
  }

  if (eligibility.bypassed) {
    return (
      <div className="border border-celadon/25 bg-celadon/[0.08] px-3 py-3">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
          Graduation gate
        </p>
        <p className="mt-1.5 text-sm text-ink/75">
          Early access — {eligibility.bypassReason ?? "override on file"}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-stone bg-white/40 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
          Graduation gate
        </p>
        <span
          className={`text-[0.65rem] font-medium uppercase tracking-[0.1em] ${
            eligibility.eligible ? "text-pine" : "text-ink/45"
          }`}
        >
          {eligibility.eligible ? "Eligible" : "Not yet eligible"}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {eligibility.checklist.map((item) => (
          <li key={item.id} className="text-sm text-ink/70">
            <span
              className={
                item.met ? "font-medium text-pine" : "text-ink/55"
              }
            >
              {item.met ? "✓" : "○"} {item.label}
            </span>
            <span className="mt-0.5 block text-xs text-ink/45">
              {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(status: AdminGalleryItem["moderationStatus"]) {
  if (status === "flagged") return "Flagged";
  if (status === "taken_down") return "Taken down";
  return "Visible";
}

function GalleryStatTile({
  label,
  shortLabel,
  value,
  hint,
}: {
  label: string;
  shortLabel?: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-stone/50 bg-white px-2 py-2.5 text-center sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-3 sm:text-left">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine sm:h-11 sm:w-11">
        <span className="font-display text-xl text-mist tabular-nums">
          {value}
        </span>
      </div>
      <div className="min-w-0 sm:border-l sm:border-stone/70 sm:pl-3">
        <p className="truncate text-[0.7rem] font-medium text-pine sm:text-sm">
          <span className="sm:hidden">{shortLabel ?? label}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="mt-0.5 hidden truncate text-xs text-ink/50 sm:block">
          {hint}
        </p>
      </div>
    </div>
  );
}
