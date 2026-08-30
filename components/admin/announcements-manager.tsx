"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createAnnouncement,
  deleteAnnouncement,
  setAnnouncementPublished,
  updateAnnouncement,
  type AnnouncementActionResult,
} from "@/app/admin/announcements/actions";
import {
  attachmentLinksField,
  DeskAttachmentPicker,
} from "@/components/admin/desk-attachment-picker";
import { NoticeAttachmentList, NoticeFilesMark } from "@/components/notices/notice-attachments";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  AUDIENCE_META,
  formatAnnouncementDate,
  MAX_GENERAL_ANNOUNCEMENTS,
  MAX_STUDENT_LIVE_ANNOUNCEMENTS,
  maxPublishedForAudience,
  type AdminAnnouncementRecord,
  type AnnouncementAudience,
} from "@/lib/announcements";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const NOTIC_PAGE_SIZE = 8;

const fieldClass =
  "w-full border border-stone bg-white/70 px-4 py-3 text-sm outline-none transition-[border-color,background-color] duration-300 focus:border-pine focus:bg-mist";

type PageView = "desk" | "insight";
type ListTab = "live" | "drafts" | "preview";
type AudienceFilter = "all" | AnnouncementAudience;

type AnnouncementsManagerProps = {
  announcements: AdminAnnouncementRecord[];
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Pick<Batch, "id" | "parish_id" | "name" | "year">[];
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M8 7v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v5M14 11v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function audienceOf(item: AdminAnnouncementRecord): AnnouncementAudience {
  return item.audience === "students" ? "students" : "general";
}

function canManageNotice(
  profile: AdminProfile,
  item: AdminAnnouncementRecord,
): boolean {
  if (isNationalAdmin(profile)) return true;
  return (
    Boolean(profile.parish_id) &&
    item.parish_id === profile.parish_id &&
    audienceOf(item) === "students"
  );
}

function noticeScopeLabel(
  item: AdminAnnouncementRecord,
  parishes: Pick<Parish, "id" | "name">[],
  batches: Pick<Batch, "id" | "parish_id" | "name" | "year">[],
): string {
  if (audienceOf(item) === "general") return "Home page";
  if (!item.parish_id) return "All UK students";
  const parish = parishes.find((p) => p.id === item.parish_id);
  if (item.batch_id) {
    const batch = batches.find((b) => b.id === item.batch_id);
    return batch
      ? `${parish?.name ?? "Parish"} · ${formatBatchLabel(batch)}`
      : (parish?.name ?? "Parish students");
  }
  return parish?.name ?? "Parish students";
}

function AudiencePill({ audience }: { audience: AnnouncementAudience }) {
  const meta = AUDIENCE_META[audience];
  const students = audience === "students";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] ${
        students ? "text-[#6b4f2a]" : "text-celadon"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 ${students ? "bg-[#c4a574]" : "bg-celadon"}`}
        aria-hidden
      />
      {meta.short}
    </span>
  );
}

/** Interactive reclaim UI when a publish lane is full. */
function LaneCapacityGate({
  audience,
  occupied,
  pending,
  onUnpublish,
  onEdit,
  onDelete,
}: {
  audience: AnnouncementAudience;
  occupied: AdminAnnouncementRecord[];
  pending: boolean;
  onUnpublish: (item: AdminAnnouncementRecord) => void;
  onEdit: (item: AdminAnnouncementRecord) => void;
  onDelete: (item: AdminAnnouncementRecord) => void;
}) {
  const general = audience === "general";
  const max = maxPublishedForAudience(audience);
  const meta = AUDIENCE_META[audience];

  return (
    <aside
      className={`animate-panel-in relative overflow-hidden border ${
        general
          ? "border-pine/30 bg-pine text-mist"
          : "border-[#c4a574]/40 bg-[#f7f1e6] text-ink"
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          general
            ? "bg-[radial-gradient(ellipse_at_top_right,rgba(95_143_122/0.4),transparent_55%)]"
            : "bg-[radial-gradient(ellipse_at_top_right,rgba(196_165_116/0.35),transparent_60%)]"
        }`}
        aria-hidden
      />

      <div className="relative px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
                general ? "text-celadon" : "text-[#6b4f2a]/75"
              }`}
            >
              {general ? "Square is full" : "Board is full"}
            </p>
            <h3
              className={`mt-2 font-display text-xl tracking-[-0.02em] sm:text-2xl ${
                general ? "text-mist" : "text-pine"
              }`}
            >
              All {max} {meta.short.toLowerCase()} slots are taken
            </h3>
            <p
              className={`mt-2 max-w-md text-sm leading-relaxed ${
                general ? "text-mist/70" : "text-ink/60"
              }`}
            >
              Free a seat first — unpublish one to drafts, rewrite it, or delete
              it — then your new notice can go live on {meta.surface.toLowerCase()}.
            </p>
          </div>
          <div className="flex gap-1.5 pt-1" aria-hidden>
            {Array.from({ length: max }).map((_, index) => (
              <span
                key={index}
                className={`h-8 w-2.5 ${
                  general
                    ? "animate-pulse-soft bg-celadon/80"
                    : "animate-pulse-soft bg-[#c4a574]"
                }`}
                style={{ animationDelay: `${index * 0.12}s` }}
              />
            ))}
          </div>
        </div>

        <ul className="mt-5 space-y-2">
          {occupied.map((item, index) => {
            const dateLabel = formatAnnouncementDate(
              item.published_at ?? undefined,
            );
            return (
              <li
                key={item.id}
                className={`animate-fade-rise border ${
                  general
                    ? "border-mist/15 bg-mist/[0.06]"
                    : "border-[#c4a574]/25 bg-white/50"
                }`}
                style={{ animationDelay: `${0.05 + index * 0.06}s` }}
              >
                <div className="flex flex-wrap items-start gap-3 px-3.5 py-3 sm:px-4">
                  <span
                    className={`mt-0.5 font-display text-lg tabular-nums ${
                      general ? "text-celadon/90" : "text-[#c4a574]"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-medium leading-snug ${
                        general ? "text-mist" : "text-pine"
                      }`}
                    >
                      {item.title}
                    </p>
                    <p
                      className={`mt-0.5 line-clamp-1 text-xs ${
                        general ? "text-mist/55" : "text-ink/50"
                      }`}
                    >
                      {dateLabel ? `${dateLabel} · ` : ""}
                      {item.body}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onUnpublish(item)}
                        className={`px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          general
                            ? "bg-mist/15 text-mist hover:bg-mist/25"
                            : "bg-pine/10 text-pine hover:bg-pine/15"
                        }`}
                      >
                        Unpublish
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onEdit(item)}
                        className={`border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          general
                            ? "border-mist/25 text-mist/90 hover:border-mist/50"
                            : "border-pine/25 text-pine hover:border-pine"
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onDelete(item)}
                        className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          general
                            ? "border-red-300/30 text-red-200 hover:bg-red-950/40"
                            : "border-red-900/20 text-red-800 hover:bg-red-50"
                        }`}
                      >
                        <TrashIcon className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <p
          className={`mt-4 text-xs ${
            general ? "text-mist/50" : "text-ink/45"
          }`}
        >
          You can still save this notice as a draft while a slot opens.
        </p>
      </div>
    </aside>
  );
}

export function AnnouncementsManager({
  announcements,
  profile,
  parishes,
  batches,
}: AnnouncementsManagerProps) {
  const { success, error } = useToast();
  const national = isNationalAdmin(profile);
  const [pageView, setPageView] = useState<PageView>("desk");
  const [listTab, setListTab] = useState<ListTab>("live");
  const [composing, setComposing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [editing, setEditing] = useState<AdminAnnouncementRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<
    | { kind: "delete"; item: AdminAnnouncementRecord }
    | { kind: "unpublish"; item: AdminAnnouncementRecord }
    | { kind: "discard" }
    | { kind: "switchEdit"; item: AdminAnnouncementRecord }
    | null
  >(null);
  const [query, setQuery] = useState("");
  const [titleLen, setTitleLen] = useState(0);
  const [bodyLen, setBodyLen] = useState(0);
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>("all");
  const [composeAudience, setComposeAudience] =
    useState<AnnouncementAudience>(national ? "general" : "students");
  const [composeParishId, setComposeParishId] = useState(
    profile.parish_id ?? "",
  );
  const [composeBatchId, setComposeBatchId] = useState("");
  const [previewLane, setPreviewLane] =
    useState<AnnouncementAudience>(national ? "general" : "students");
  const [gatePulse, setGatePulse] = useState(false);
  const [livePage, setLivePage] = useState(1);
  const [draftPage, setDraftPage] = useState(1);
  const [composeAttachments, setComposeAttachments] = useState<
    {
      id: string;
      original_name: string;
      byte_size: number;
      mime: string;
      access?: "view" | "download" | "both";
    }[]
  >([]);

  const composeBatches = useMemo(
    () =>
      batches.filter((b) =>
        composeParishId ? b.parish_id === composeParishId : false,
      ),
    [batches, composeParishId],
  );

  const published = useMemo(
    () => announcements.filter((item) => item.is_published),
    [announcements],
  );
  const drafts = useMemo(
    () => announcements.filter((item) => !item.is_published),
    [announcements],
  );

  const generalLive = useMemo(
    () => published.filter((item) => audienceOf(item) === "general"),
    [published],
  );
  const studentLive = useMemo(
    () => published.filter((item) => audienceOf(item) === "students"),
    [published],
  );
  /** Live student notices that count toward the current compose bucket. */
  const studentLiveManaged = useMemo(() => {
    if (!national) {
      return studentLive.filter((item) => item.parish_id === profile.parish_id);
    }
    // National: empty parish selector = UK-wide bucket (parish_id null).
    const bucket = composeParishId || null;
    return studentLive.filter((item) =>
      bucket ? item.parish_id === bucket : item.parish_id == null,
    );
  }, [national, studentLive, profile.parish_id, composeParishId]);

  const generalAtCapacity =
    generalLive.length >= MAX_GENERAL_ANNOUNCEMENTS;
  const studentAtCapacity =
    studentLiveManaged.length >= MAX_STUDENT_LIVE_ANNOUNCEMENTS;

  function atCapacityFor(audience: AnnouncementAudience) {
    return audience === "general" ? generalAtCapacity : studentAtCapacity;
  }

  const studentSlotLabel = useMemo(() => {
    if (!national) return "Your parish board";
    if (!composeParishId) return "UK-wide student board";
    const parish = parishes.find((p) => p.id === composeParishId);
    return parish ? `${parish.name} board` : "Parish student board";
  }, [national, composeParishId, parishes]);

  const filteredPublished = useMemo(() => {
    if (audienceFilter === "all") return published;
    return published.filter((item) => audienceOf(item) === audienceFilter);
  }, [published, audienceFilter]);

  const filteredDrafts = useMemo(() => {
    if (audienceFilter === "all") return drafts;
    return drafts.filter((item) => audienceOf(item) === audienceFilter);
  }, [drafts, audienceFilter]);

  function matchesQuery(item: AdminAnnouncementRecord) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      item.title,
      item.body,
      noticeScopeLabel(item, parishes, batches),
      AUDIENCE_META[audienceOf(item)].short,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  const searchedPublished = useMemo(
    () => filteredPublished.filter(matchesQuery),
    [filteredPublished, query, parishes, batches],
  );
  const searchedDrafts = useMemo(
    () => filteredDrafts.filter(matchesQuery),
    [filteredDrafts, query, parishes, batches],
  );

  const liveTotalPages = Math.max(
    1,
    Math.ceil(searchedPublished.length / NOTIC_PAGE_SIZE),
  );
  const draftTotalPages = Math.max(
    1,
    Math.ceil(searchedDrafts.length / NOTIC_PAGE_SIZE),
  );
  const activeListPage = listTab === "live" ? livePage : draftPage;
  const activeTotalPages = listTab === "live" ? liveTotalPages : draftTotalPages;
  const activeFiltered =
    listTab === "live" ? searchedPublished : searchedDrafts;
  const pageStart = (activeListPage - 1) * NOTIC_PAGE_SIZE;
  const pageItems = activeFiltered.slice(
    pageStart,
    pageStart + NOTIC_PAGE_SIZE,
  );

  useEffect(() => {
    setLivePage(1);
    setDraftPage(1);
  }, [audienceFilter, query]);

  const defaultComposeAudience = (): AnnouncementAudience =>
    national ? "general" : "students";

  useEffect(() => {
    if (!pendingConfirm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setPendingConfirm(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingConfirm, busy]);

  const composeIsDirty = useMemo(() => {
    if (!composing) return false;
    const baselineTitle = editing?.title.length ?? 0;
    const baselineBody = editing?.body.length ?? 0;
    const baselineAttachmentIds = (editing?.attachments ?? [])
      .map((file) => file.id)
      .sort()
      .join(",");
    const currentAttachmentIds = composeAttachments
      .map((file) => file.id)
      .sort()
      .join(",");
    if (titleLen !== baselineTitle) return true;
    if (bodyLen !== baselineBody) return true;
    if (currentAttachmentIds !== baselineAttachmentIds) return true;
    if (editing) {
      if (audienceOf(editing) !== composeAudience) return true;
      if ((editing.parish_id ?? "") !== composeParishId) return true;
      if ((editing.batch_id ?? "") !== composeBatchId) return true;
    } else if (
      composeAudience !== defaultComposeAudience() ||
      composeParishId !== (profile.parish_id ?? "") ||
      composeBatchId
    ) {
      return titleLen > 0 || bodyLen > 0 || composeAttachments.length > 0;
    }
    return false;
  }, [
    composing,
    editing,
    titleLen,
    bodyLen,
    composeAttachments,
    composeAudience,
    composeParishId,
    composeBatchId,
    profile.parish_id,
    national,
  ]);

  function run(
    action: () => Promise<AnnouncementActionResult>,
    form?: HTMLFormElement | null,
    options?: { keepCompose?: boolean; label?: string },
  ) {
    const label = options?.label ?? "Working…";
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          success(next.message, "Notices");
          setPendingConfirm(null);
          setExpandedId(null);
          if (options?.keepCompose) {
            return;
          }
          form?.reset();
          setEditing(null);
          setTitleLen(0);
          setBodyLen(0);
          setComposeAudience(defaultComposeAudience());
          setComposeParishId(profile.parish_id ?? "");
          setComposeBatchId("");
          setComposeAttachments([]);
          setComposing(false);
          setListTab("live");
          setPageView("desk");
        } else {
          error(next.message, "Notices");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function applyCompose(item?: AdminAnnouncementRecord) {
    if (item && !canManageNotice(profile, item)) {
      error("You can only edit notices for your own parish.", "Notices");
      return;
    }
    setEditing(item ?? null);
    setTitleLen(item?.title.length ?? 0);
    setBodyLen(item?.body.length ?? 0);
    setComposeAudience(
      item ? audienceOf(item) : defaultComposeAudience(),
    );
    setComposeParishId(item?.parish_id ?? profile.parish_id ?? "");
    setComposeBatchId(item?.batch_id ?? "");
    setComposeAttachments(
      (item?.attachments ?? []).map((file) => ({
        id: file.id,
        original_name: file.name,
        byte_size: file.byteSize,
        mime: file.mime,
        access: file.access ?? "both",
      })),
    );
    setExpandedId(null);
    setGatePulse(false);
    setComposing(true);
    setPageView("desk");
  }

  function openCompose(item?: AdminAnnouncementRecord) {
    if (composing && composeIsDirty) {
      if (item) {
        setPendingConfirm({ kind: "switchEdit", item });
        return;
      }
      setPendingConfirm({ kind: "discard" });
      return;
    }
    applyCompose(item);
  }

  function closeCompose() {
    if (composeIsDirty) {
      setPendingConfirm({ kind: "discard" });
      return;
    }
    setEditing(null);
    setTitleLen(0);
    setBodyLen(0);
    setComposeAudience(defaultComposeAudience());
    setComposeParishId(profile.parish_id ?? "");
    setComposeBatchId("");
    setComposeAttachments([]);
    setComposing(false);
  }

  function forceCloseCompose() {
    setEditing(null);
    setTitleLen(0);
    setBodyLen(0);
    setComposeAudience(defaultComposeAudience());
    setComposeParishId(profile.parish_id ?? "");
    setComposeBatchId("");
    setComposeAttachments([]);
    setComposing(false);
  }

  function requestTogglePublish(item: AdminAnnouncementRecord) {
    if (item.is_published) {
      setPendingConfirm({ kind: "unpublish", item });
      return;
    }
    run(() => setAnnouncementPublished(item.id, true), null, {
      label: "Publishing…",
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    switch (pendingConfirm.kind) {
      case "delete":
        run(() => deleteAnnouncement(pendingConfirm.item.id), null, {
          keepCompose: composing,
          label: "Removing notice…",
        });
        return;
      case "unpublish":
        run(() => setAnnouncementPublished(pendingConfirm.item.id, false), null, {
          keepCompose: composing,
          label: composing ? "Freeing a slot…" : "Unpublishing…",
        });
        return;
      case "discard":
        setPendingConfirm(null);
        forceCloseCompose();
        return;
      case "switchEdit": {
        const item = pendingConfirm.item;
        setPendingConfirm(null);
        applyCompose(item);
      }
    }
  }

  function nudgeCapacityGate() {
    setGatePulse(true);
    const node = document.getElementById("lane-capacity-gate");
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(() => setGatePulse(false), 1600);
  }

  const composeCapacity = atCapacityFor(composeAudience);
  const publishDisabled = !editing?.is_published && composeCapacity;
  const occupiedForCompose =
    composeAudience === "general" ? generalLive : studentLiveManaged;

  const deskKey = composing ? "compose" : listTab;

  return (
    <div className="relative space-y-4" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy && !pendingConfirm}
        label={busyLabel ?? "Working…"}
      />

      {!composing ? (
        <>
          <nav
            data-tour="notices-tabs"
            className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
            aria-label="Notices page"
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
            <NoticesInsightGuide national={national} />
          ) : (
            <>
              <div
                data-tour="notices-stats"
                className="grid gap-px border border-stone bg-stone sm:grid-cols-2 lg:grid-cols-4"
              >
                {[
                  {
                    label: "Live",
                    value: published.length,
                    hint: "Published notices",
                  },
                  {
                    label: "Drafts",
                    value: drafts.length,
                    hint: "Not yet published",
                  },
                  ...(national
                    ? [
                        {
                          label: "Home slots",
                          value: `${generalLive.length}/${MAX_GENERAL_ANNOUNCEMENTS}`,
                          hint: "Public home page",
                        },
                      ]
                    : []),
                  {
                    label: national ? "Student board" : "Your board",
                    value: `${studentLiveManaged.length}/${MAX_STUDENT_LIVE_ANNOUNCEMENTS}`,
                    hint: national ? studentSlotLabel : "Parish student portal",
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

              <div
                data-tour="notices-compose"
                className="flex flex-col gap-3 border border-stone bg-mist/40 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"
              >
                <div className="min-w-0 flex-1">
                  <label className="block">
                    <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                      Search notices
                    </span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Title, body, or audience…"
                      disabled={busy}
                      className="mt-2 w-full max-w-md border border-stone bg-white/80 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openCompose()}
                  className="inline-flex min-h-[2.5rem] shrink-0 items-center justify-center bg-pine px-4 py-2 text-sm font-medium text-mist disabled:opacity-50"
                >
                  New notice
                </button>
              </div>

              <div className="flex flex-col gap-4 border border-stone bg-mist/40 p-4 sm:p-5">
                <nav
                  className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
                  aria-label="Notice lists"
                >
                    {(
                      [
                        { id: "live" as const, label: "Live", count: published.length },
                        { id: "drafts" as const, label: "Drafts", count: drafts.length },
                        { id: "preview" as const, label: "Preview" },
                      ] as const
                    ).map((tab) => {
                      const active = listTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setListTab(tab.id)}
                          className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                            active ? "text-pine" : "text-ink/50 hover:text-ink/80"
                          }`}
                        >
                          {tab.label}
                          {"count" in tab && typeof tab.count === "number" ? (
                            <span className="ml-1.5 text-xs text-ink/40">
                              {tab.count}
                            </span>
                          ) : null}
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

                {listTab === "live" || listTab === "drafts" ? (
                  <>
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label="Filter by audience"
                    >
                      {(
                        national
                          ? ([
                              { id: "all" as const, label: "All" },
                              { id: "general" as const, label: "Home page" },
                              { id: "students" as const, label: "Student portal" },
                            ] as const)
                          : ([
                              { id: "all" as const, label: "All visible" },
                              { id: "students" as const, label: "Student portal" },
                              { id: "general" as const, label: "Home (read-only)" },
                            ] as const)
                      ).map((chip) => {
                        const active = audienceFilter === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => setAudienceFilter(chip.id)}
                            className={`border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? "border-pine bg-pine text-mist"
                                : "border-stone bg-white/60 text-ink/70 hover:border-pine/30"
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                    <NoticeList
                      items={pageItems}
                      parishes={parishes}
                      batches={batches}
                      empty={
                        listTab === "live"
                          ? announcements.length === 0
                            ? "No live notices yet. Create a notice and publish it into an open slot."
                            : query.trim()
                              ? "No live notices match your search."
                              : "No live notices in this lane. Compose one and publish into an open slot."
                          : announcements.length === 0
                            ? "No drafts yet. Create a notice and save it as a draft."
                            : query.trim()
                              ? "No drafts match your search."
                              : "No drafts in this lane."
                      }
                      mode={listTab}
                      pending={busy}
                      expandedId={expandedId}
                      atCapacityFor={atCapacityFor}
                      canManage={(item) => canManageNotice(profile, item)}
                      onExpand={setExpandedId}
                      onEdit={openCompose}
                      onToggle={requestTogglePublish}
                      onDelete={(item) =>
                        setPendingConfirm({ kind: "delete", item })
                      }
                    />
                    <DeskPagination
                      page={activeListPage}
                      totalItems={activeFiltered.length}
                      pageSize={NOTIC_PAGE_SIZE}
                      onPageChange={(next) =>
                        listTab === "live"
                          ? setLivePage(next)
                          : setDraftPage(next)
                      }
                      itemLabel="notices"
                    />
                  </>
                ) : null}

                {listTab === "preview" ? (
                  <div>
                    <div className="mb-4 flex gap-2">
                      {(
                        [
                          { id: "general" as const, label: "Home page" },
                          { id: "students" as const, label: "Student portal" },
                        ] as const
                      ).map((lane) => {
                        const active = previewLane === lane.id;
                        return (
                          <button
                            key={lane.id}
                            type="button"
                            onClick={() => setPreviewLane(lane.id)}
                            className={`border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? "border-pine bg-pine text-mist"
                                : "border-stone bg-white/60 text-ink/70 hover:border-pine/30"
                            }`}
                          >
                            {lane.label}
                          </button>
                        );
                      })}
                    </div>

            {previewLane === "general" ? (
              <aside className="bg-pine text-mist">
                <div className="border-b border-mist/15 px-5 py-3.5">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-mist/55">
                    Home page preview
                  </p>
                  <p className="mt-1 text-sm text-mist/65">
                    Visible to everyone · max {MAX_GENERAL_ANNOUNCEMENTS}
                  </p>
                </div>
                {generalLive.length > 0 ? (
                  <ul className="px-5 py-4">
                    {generalLive
                      .slice(0, MAX_GENERAL_ANNOUNCEMENTS)
                      .map((item) => {
                        const dateLabel = formatAnnouncementDate(
                          item.published_at ?? undefined,
                        );
                        return (
                          <li
                            key={item.id}
                            className="relative border-t border-mist/15 py-4 first:border-t-0 first:pt-0 last:pb-0"
                          >
                            <NoticeFilesMark
                              count={item.attachments?.length ?? 0}
                              tone="mist"
                            />
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              {dateLabel ? (
                                <time className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-mist/50">
                                  {dateLabel}
                                </time>
                              ) : null}
                              <span className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-celadon">
                                Home
                              </span>
                            </div>
                            <h3 className="mt-2 font-display text-lg leading-snug">
                              {item.title}
                            </h3>
                            <p className="mt-1.5 text-sm leading-relaxed text-mist/70">
                              {item.body}
                            </p>
                            <NoticeAttachmentList
                              files={item.attachments}
                              tone="mist"
                            />
                          </li>
                        );
                      })}
                  </ul>
                ) : (
                  <div className="px-5 py-8">
                    <p className="font-display text-xl">Public board is quiet</p>
                    <p className="mt-2 text-sm text-mist/65">
                      Publish a general notice to see it on the home page.
                    </p>
                  </div>
                )}
              </aside>
            ) : (
              <aside className="border border-[#c4a574]/35 bg-[#f7f1e6] text-ink">
                <div className="border-b border-[#c4a574]/25 px-5 py-3.5">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-[#6b4f2a]/70">
                    Student portal preview
                  </p>
                  <p className="mt-1 text-sm text-ink/55">
                    Signed-in students only · max {MAX_STUDENT_LIVE_ANNOUNCEMENTS}
                  </p>
                </div>
                {studentLive.length > 0 ? (
                  <ul className="px-5 py-4">
                    {studentLive
                      .slice(0, MAX_STUDENT_LIVE_ANNOUNCEMENTS)
                      .map((item, index) => {
                        const dateLabel = formatAnnouncementDate(
                          item.published_at ?? undefined,
                        );
                        return (
                          <li
                            key={item.id}
                            className="relative border-t border-[#c4a574]/20 py-4 first:border-t-0 first:pt-0 last:pb-0"
                          >
                            <NoticeFilesMark
                              count={item.attachments?.length ?? 0}
                              tone="parchment"
                            />
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <span className="font-display text-sm tabular-nums text-[#c4a574]">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              {dateLabel ? (
                                <time className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-ink/40">
                                  {dateLabel}
                                </time>
                              ) : null}
                            </div>
                            <h3 className="mt-2 font-display text-lg leading-snug text-pine">
                              {item.title}
                            </h3>
                            <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
                              {item.body}
                            </p>
                            <NoticeAttachmentList
                              files={item.attachments}
                              tone="parchment"
                            />
                          </li>
                        );
                      })}
                  </ul>
                ) : (
                  <div className="px-5 py-8">
                    <p className="font-display text-xl text-pine">
                      Cohort channel is empty
                    </p>
                    <p className="mt-2 text-sm text-ink/55">
                      Publish a students-only notice for the portal board.
                    </p>
                  </div>
                )}
              </aside>
            )}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : (
        <div key={deskKey} className="animate-panel-in space-y-4">
          <button
            type="button"
            disabled={busy}
            onClick={closeCompose}
            className="inline-flex min-h-[2.75rem] items-center gap-2 border border-pine/35 bg-white px-4 py-2.5 text-sm font-medium text-pine shadow-[0_1px_0_rgba(20,53,44,0.06)] transition-colors hover:border-pine hover:bg-mist disabled:opacity-50"
          >
            <span aria-hidden className="text-base leading-none">
              ←
            </span>
            All notices
          </button>

          <form
            className="grid gap-4 border border-stone bg-mist/40 p-4 sm:p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const formData = new FormData(form);
              formData.set("audience", composeAudience);
              formData.set("attachmentLinks", attachmentLinksField(composeAttachments));
              if (editing) {
                formData.set("id", editing.id);
                run(() => updateAnnouncement(formData), form, {
                  label: "Saving changes…",
                });
              } else {
                run(() => createAnnouncement(formData), form, {
                  label: "Saving notice…",
                });
              }
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                {editing ? "Edit notice" : "New notice"}
              </p>
              <p className="text-xs text-ink/45">
                Title ≤{ANNOUNCEMENT_TITLE_MAX} · Body ≤{ANNOUNCEMENT_BODY_MAX}
              </p>
            </div>

            {editing ? (
              <input type="hidden" name="id" value={editing.id} />
            ) : null}
            <input type="hidden" name="audience" value={composeAudience} />
            <input type="hidden" name="parishId" value={composeParishId} />
            <input type="hidden" name="batchId" value={composeBatchId} />
            <input
              type="hidden"
              name="attachmentLinks"
              value={attachmentLinksField(composeAttachments)}
            />

            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-ink">
                Where should this land?
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  (
                    national
                      ? ([
                          { id: "general" as const, icon: "◈" },
                          { id: "students" as const, icon: "◎" },
                        ] as const)
                      : ([{ id: "students" as const, icon: "◎" }] as const)
                  )
                ).map((lane) => {
                  const meta = AUDIENCE_META[lane.id];
                  const selected = composeAudience === lane.id;
                  const filled =
                    lane.id === "general"
                      ? generalLive.length
                      : studentLiveManaged.length;
                  const max = maxPublishedForAudience(lane.id);
                  return (
                    <button
                      key={lane.id}
                      type="button"
                      onClick={() => {
                        setComposeAudience(lane.id);
                        if (
                          lane.id === "general" &&
                          generalAtCapacity &&
                          !editing?.is_published
                        ) {
                          window.setTimeout(() => nudgeCapacityGate(), 50);
                        }
                      }}
                      className={`relative border px-4 py-4 text-left transition-colors ${
                        selected
                          ? lane.id === "students"
                            ? "border-[#c4a574] bg-[#f7f1e6]"
                            : generalAtCapacity && !editing?.is_published
                              ? "border-pine bg-pine/10 ring-1 ring-pine/30"
                              : "border-pine bg-pine/5"
                          : "border-stone bg-white/50 hover:border-pine/35"
                      }`}
                    >
                      <span
                        className={`text-lg ${
                          selected
                            ? lane.id === "students"
                              ? "text-[#c4a574]"
                              : "text-celadon"
                            : "text-ink/35"
                        }`}
                        aria-hidden
                      >
                        {lane.icon}
                      </span>
                      <p className="mt-2 font-display text-lg text-pine">
                        {meta.label}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-ink/55">
                        {meta.hint}
                      </p>
                      <p className="mt-3 text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
                        {filled}/{max} live
                        {lane.id === "general" &&
                        filled >= max &&
                        !editing?.is_published
                          ? " · full"
                          : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {composeAudience === "students" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {national ? (
                  <label className="block text-sm">
                    <span className="mb-2 block font-medium text-ink">
                      Parish scope
                    </span>
                    <select
                      value={composeParishId}
                      onChange={(event) => {
                        setComposeParishId(event.target.value);
                        setComposeBatchId("");
                      }}
                      className={fieldClass}
                    >
                      <option value="">All UK students</option>
                      {parishes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-sm text-ink/60 sm:col-span-2">
                    This notice posts to your parish’s student board
                    {composeParishId
                      ? ` (${parishes.find((p) => p.id === composeParishId)?.name ?? "your parish"})`
                      : ""}
                    .
                  </p>
                )}
                <label className="block text-sm">
                  <span className="mb-2 block font-medium text-ink">
                    Batch (optional)
                  </span>
                  <select
                    value={composeBatchId}
                    onChange={(event) => setComposeBatchId(event.target.value)}
                    className={fieldClass}
                    disabled={!composeParishId}
                  >
                    <option value="">Whole parish</option>
                    {composeBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {formatBatchLabel(b)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {publishDisabled ? (
              <div
                id="lane-capacity-gate"
                className={
                  gatePulse
                    ? "animate-fade-rise ring-2 ring-offset-2 ring-offset-mist ring-pine/40"
                    : undefined
                }
              >
                <LaneCapacityGate
                  audience={composeAudience}
                  occupied={occupiedForCompose}
                  pending={busy}
                  onUnpublish={(item) =>
                    setPendingConfirm({ kind: "unpublish", item })
                  }
                  onEdit={(item) => openCompose(item)}
                  onDelete={(item) =>
                    setPendingConfirm({ kind: "delete", item })
                  }
                />
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  className="block text-sm font-medium text-ink"
                  htmlFor="title"
                >
                  Title
                </label>
                <span
                  className={`text-xs tabular-nums ${
                    titleLen > ANNOUNCEMENT_TITLE_MAX
                      ? "text-red-800"
                      : "text-ink/45"
                  }`}
                >
                  {titleLen}/{ANNOUNCEMENT_TITLE_MAX}
                </span>
              </div>
              <input
                id="title"
                name="title"
                required
                maxLength={ANNOUNCEMENT_TITLE_MAX}
                defaultValue={editing?.title ?? ""}
                onChange={(event) => setTitleLen(event.target.value.length)}
                disabled={busy}
                className={fieldClass}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  className="block text-sm font-medium text-ink"
                  htmlFor="body"
                >
                  Body
                </label>
                <span
                  className={`text-xs tabular-nums ${
                    bodyLen > ANNOUNCEMENT_BODY_MAX
                      ? "text-red-800"
                      : "text-ink/45"
                  }`}
                >
                  {bodyLen}/{ANNOUNCEMENT_BODY_MAX}
                </span>
              </div>
              <textarea
                id="body"
                name="body"
                required
                rows={4}
                maxLength={ANNOUNCEMENT_BODY_MAX}
                defaultValue={editing?.body ?? ""}
                onChange={(event) => setBodyLen(event.target.value.length)}
                disabled={busy}
                className={`${fieldClass} resize-y`}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Attachments</p>
              <p className="mb-2 text-xs text-ink/50">
                Choose View, Download, or Both for each file.
              </p>
              <DeskAttachmentPicker
                value={composeAttachments}
                onChange={setComposeAttachments}
                disabled={busy}
                enableAccessMode
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-ink"
                  htmlFor="href"
                >
                  Link URL
                </label>
                <input
                  id="href"
                  name="href"
                  type="url"
                  placeholder="Optional"
                  defaultValue={editing?.href ?? ""}
                  disabled={busy}
                  className={fieldClass}
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-ink"
                  htmlFor="hrefLabel"
                >
                  Link label
                </label>
                <input
                  id="hrefLabel"
                  name="hrefLabel"
                  placeholder="Optional"
                  maxLength={40}
                  defaultValue={editing?.href_label ?? ""}
                  disabled={busy}
                  className={fieldClass}
                />
              </div>
            </div>

            <div
              key={`publish-${composeAudience}-${editing?.id ?? "new"}`}
              className="flex flex-wrap items-center gap-4 border border-stone px-4 py-3 text-sm"
            >
              <label className="flex items-center gap-2 text-ink/80">
                <input
                  type="radio"
                  name="publish"
                  value="0"
                  defaultChecked={!editing?.is_published}
                />
                Draft
              </label>
              {publishDisabled ? (
                <button
                  type="button"
                  onClick={nudgeCapacityGate}
                  className="flex items-center gap-2 text-left text-pine transition-colors hover:text-celadon"
                >
                  <span
                    className="inline-block h-3.5 w-3.5 border border-pine/40"
                    aria-hidden
                  />
                  <span>
                    Publish blocked —{" "}
                    <span className="underline decoration-pine/30 underline-offset-2">
                      free a {AUDIENCE_META[composeAudience].short.toLowerCase()}{" "}
                      slot
                    </span>
                  </span>
                </button>
              ) : (
                <label className="flex items-center gap-2 text-ink/80">
                  <input
                    type="radio"
                    name="publish"
                    value="1"
                    defaultChecked={Boolean(editing?.is_published)}
                  />
                  Publish to {AUDIENCE_META[composeAudience].surface}
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[2.5rem] min-w-[8.5rem] items-center justify-center bg-pine px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
              >
                {busy ? (
                  <DeskLoader
                    label={busyLabel ?? "Saving…"}
                    tone="mist"
                  />
                ) : editing ? (
                  "Save changes"
                ) : (
                  "Save notice"
                )}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={closeCompose}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingConfirm ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notices-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Working…"}
            />
            {(() => {
              const copy =
                pendingConfirm.kind === "delete"
                  ? {
                      eyebrow: "Delete notice",
                      title: "Remove this announcement?",
                      body: (
                        <>
                          “{pendingConfirm.item.title}” will be permanently
                          deleted
                          {pendingConfirm.item.is_published
                            ? ` and removed from ${AUDIENCE_META[audienceOf(pendingConfirm.item)].surface}`
                            : ""}
                          .
                        </>
                      ),
                      confirmLabel: "Delete permanently",
                      destructive: true,
                    }
                  : pendingConfirm.kind === "unpublish"
                    ? {
                        eyebrow: "Unpublish",
                        title: "Take this notice offline?",
                        body: (
                          <>
                            “{pendingConfirm.item.title}” will leave{" "}
                            {
                              AUDIENCE_META[
                                audienceOf(pendingConfirm.item)
                              ].surface
                            }{" "}
                            and return to drafts.
                          </>
                        ),
                        confirmLabel: "Unpublish",
                        destructive: false,
                      }
                    : pendingConfirm.kind === "switchEdit"
                      ? {
                          eyebrow: "Unsaved changes",
                          title: "Switch notice without saving?",
                          body: (
                            <>
                              You have unsaved edits. Opening another notice
                              discards them.
                            </>
                          ),
                          confirmLabel: "Discard and switch",
                          destructive: false,
                        }
                      : {
                          eyebrow: "Unsaved changes",
                          title: "Leave without saving?",
                          body: (
                            <>
                              You have unsaved edits to this notice. Leaving now
                              discards those changes.
                            </>
                          ),
                          confirmLabel: "Discard and leave",
                          destructive: false,
                        };

              return (
                <>
                  <p
                    className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
                      copy.destructive ? "text-red-800/80" : "text-celadon"
                    }`}
                  >
                    {copy.eyebrow}
                  </p>
                  <h3
                    id="notices-confirm-title"
                    className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
                  >
                    {copy.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink/70">
                    {copy.body}
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
                        copy.destructive
                          ? "bg-[#5c2a2a] hover:bg-red-900"
                          : "bg-pine hover:bg-celadon"
                      }`}
                    >
                      {busy ? (
                        <DeskLoader label="Working…" tone="mist" />
                      ) : (
                        copy.confirmLabel
                      )}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NoticeList({
  items,
  empty,
  mode,
  pending,
  expandedId,
  atCapacityFor,
  canManage,
  parishes,
  batches,
  onExpand,
  onEdit,
  onToggle,
  onDelete,
}: {
  items: AdminAnnouncementRecord[];
  empty: string;
  mode: "live" | "drafts";
  pending: boolean;
  expandedId: string | null;
  atCapacityFor: (audience: AnnouncementAudience) => boolean;
  canManage: (item: AdminAnnouncementRecord) => boolean;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Pick<Batch, "id" | "parish_id" | "name" | "year">[];
  onExpand: (id: string | null) => void;
  onEdit: (item: AdminAnnouncementRecord) => void;
  onToggle: (item: AdminAnnouncementRecord) => void;
  onDelete: (item: AdminAnnouncementRecord) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="border border-dashed border-stone px-4 py-8 text-center text-sm text-ink/55">
        {empty}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-stone border border-stone bg-white/50">
      {items.map((item) => {
        const open = expandedId === item.id;
        const audience = audienceOf(item);
        const manageable = canManage(item);
        const blocked =
          mode === "drafts" && atCapacityFor(audience) && manageable;
        const updatedLabel = formatAnnouncementDate(item.updated_at);
        const scope = noticeScopeLabel(item, parishes, batches);

        function handleRowActivate() {
          if (manageable) {
            onEdit(item);
            return;
          }
          onExpand(open ? null : item.id);
        }

        return (
          <li key={item.id} className="relative">
            <NoticeFilesMark
              count={item.attachments?.length ?? 0}
              className="top-3"
            />
            <div
              role="button"
              tabIndex={pending ? -1 : 0}
              onClick={handleRowActivate}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleRowActivate();
                }
              }}
              className="flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 pr-4 text-left transition-colors hover:bg-pine/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pine sm:pr-6"
              aria-expanded={manageable ? undefined : open}
              aria-label={
                manageable
                  ? `Edit ${item.title}`
                  : `View ${item.title}`
              }
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-pine">{item.title}</span>
                  <AudiencePill audience={audience} />
                </span>
                <span className="mt-1 block line-clamp-2 text-sm leading-relaxed text-ink/55">
                  {item.body}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.65rem] uppercase tracking-[0.1em] text-ink/40">
                  <span>{scope}</span>
                  {updatedLabel ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>Updated {updatedLabel}</span>
                    </>
                  ) : null}
                  {!manageable ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>Read-only</span>
                    </>
                  ) : null}
                </span>
              </span>
              <div
                className="flex shrink-0 flex-wrap items-center justify-end gap-1.5"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {manageable ? (
                  <>
                    <button
                      type="button"
                      disabled={pending || blocked}
                      onClick={() => onToggle(item)}
                      className="border border-pine/25 px-2.5 py-1 text-xs font-medium text-pine transition-colors hover:border-pine disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {mode === "live" ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onDelete(item)}
                      className="inline-flex h-8 w-8 items-center justify-center border border-red-900/20 text-red-800 transition-colors hover:bg-red-50 disabled:opacity-60"
                      aria-label={`Delete ${item.title}`}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-ink/40" aria-hidden>
                    {open ? "−" : "+"}
                  </span>
                )}
              </div>
            </div>
            {open && !manageable ? (
              <div className="animate-panel-in space-y-3 border-t border-stone/70 bg-mist/40 px-4 pb-4 pt-3 sm:px-6">
                {item.attachments?.length ? (
                  <NoticeAttachmentList files={item.attachments} />
                ) : null}
                <p className="text-xs text-ink/55">
                  Read-only — managed by the national desk
                  {audience === "general" ? " (home page)" : ""}.
                </p>
              </div>
            ) : null}
            {open && manageable && item.attachments?.length ? (
              <div className="border-t border-stone/70 bg-mist/25 px-4 py-3 sm:px-6">
                <NoticeAttachmentList files={item.attachments} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function NoticesInsightGuide({ national }: { national: boolean }) {
  const points = national
    ? [
        {
          title: "Two places",
          body: `Home page (everyone, max ${MAX_GENERAL_ANNOUNCEMENTS}) and student portal (signed-in students, max ${MAX_STUDENT_LIVE_ANNOUNCEMENTS} live).`,
        },
        {
          title: "Parish & batch",
          body: "Student notices can be UK-wide, one parish, or one batch. Students only see notices that match their enrolment.",
        },
        {
          title: "Publish",
          body: "Live slots are limited. Unpublish an old notice before publishing a new one when a lane is full.",
        },
      ]
    : [
        {
          title: "Your desk",
          body: `You post to your parish’s student portal board (max ${MAX_STUDENT_LIVE_ANNOUNCEMENTS} live). You can optionally limit to one batch.`,
        },
        {
          title: "Home page",
          body: "Home-page notices are national-only. You may see them here as read-only.",
        },
        {
          title: "Publish",
          body: "Publishing shows the notice to matching students immediately. Unpublish returns it to drafts.",
        },
      ];

  return (
    <div className="border border-stone bg-mist">
      <div className="border-b border-stone px-4 py-4 sm:px-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Insight
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          How Notices work
        </h2>
        <p className="mt-1.5 text-sm text-ink/60">
          Desk:{" "}
          <span className="font-medium text-pine">
            {national ? "National / Master" : "Parish"}
          </span>
        </p>
      </div>
      <ul className="divide-y divide-stone">
        {points.map((point) => (
          <li key={point.title} className="px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-medium text-ink">{point.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              {point.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
