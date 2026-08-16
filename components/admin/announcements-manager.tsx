"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createAnnouncement,
  deleteAnnouncement,
  setAnnouncementPublished,
  updateAnnouncement,
  type AnnouncementActionResult,
} from "@/app/admin/announcements/actions";
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

const fieldClass =
  "w-full border border-stone bg-white/70 px-4 py-3 text-sm outline-none transition-[border-color,background-color] duration-300 focus:border-pine focus:bg-mist";

type Panel = "live" | "drafts" | "compose" | "preview" | "insight";
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

function SlotMeter({
  label,
  filled,
  max,
  tone,
  pulse,
}: {
  label: string;
  filled: number;
  max: number;
  tone: "general" | "students";
  pulse?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/50">
          {label}
        </p>
        <p className="text-xs tabular-nums text-ink/55">
          <span className="font-medium text-ink">
            {filled}/{max}
          </span>
        </p>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {Array.from({ length: max }).map((_, index) => (
          <span
            key={index}
            className={`h-2 flex-1 transition-colors ${
              index < filled
                ? tone === "students"
                  ? "bg-[#c4a574]"
                  : pulse
                    ? "animate-pulse-soft bg-pine"
                    : "bg-pine"
                : "bg-stone"
            }`}
          />
        ))}
      </div>
    </div>
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
  const [panel, setPanel] = useState<Panel>("live");
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<AdminAnnouncementRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<AdminAnnouncementRecord | null>(null);
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

  const defaultComposeAudience = (): AnnouncementAudience =>
    national ? "general" : "students";

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingDelete(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingDelete]);

  function run(
    action: () => Promise<AnnouncementActionResult>,
    form?: HTMLFormElement | null,
    options?: { keepCompose?: boolean },
  ) {
    startTransition(async () => {
      const next = await action();
      if (next.ok) {
        success(next.message, "Notices");
        setPendingDelete(null);
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
        setPanel("live");
      } else {
        error(next.message, "Notices");
      }
    });
  }

  function openCompose(item?: AdminAnnouncementRecord) {
    if (item && !canManageNotice(profile, item)) {
      error("You can only edit notices for your own parish.", "Notices");
      return;
    }
    setEditing(item ?? null);
    setTitleLen(item?.title.length ?? 0);
    setBodyLen(item?.body.length ?? 0);
    setComposeAudience(
      item
        ? audienceOf(item)
        : defaultComposeAudience(),
    );
    setComposeParishId(
      item?.parish_id ?? profile.parish_id ?? "",
    );
    setComposeBatchId(item?.batch_id ?? "");
    setExpandedId(null);
    setGatePulse(false);
    setPanel("compose");
  }

  function nudgeCapacityGate() {
    setGatePulse(true);
    const node = document.getElementById("lane-capacity-gate");
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(() => setGatePulse(false), 1600);
  }

  const tabs: { id: Panel; label: string; count?: number }[] = [
    { id: "live", label: "Live", count: published.length },
    { id: "drafts", label: "Drafts", count: drafts.length },
    { id: "compose", label: editing ? "Edit" : "Compose" },
    { id: "preview", label: "Preview" },
    { id: "insight", label: "Insight" },
  ];

  const composeCapacity = atCapacityFor(composeAudience);
  const publishDisabled = !editing?.is_published && composeCapacity;
  const occupiedForCompose =
    composeAudience === "general" ? generalLive : studentLiveManaged;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col gap-4 border-b border-stone pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:gap-6">
          {national ? (
            <SlotMeter
              label="Home page"
              filled={generalLive.length}
              max={MAX_GENERAL_ANNOUNCEMENTS}
              tone="general"
              pulse={
                panel === "compose" &&
                composeAudience === "general" &&
                generalAtCapacity
              }
            />
          ) : null}
          <SlotMeter
            label={studentSlotLabel}
            filled={studentLiveManaged.length}
            max={MAX_STUDENT_LIVE_ANNOUNCEMENTS}
            tone="students"
            pulse={
              panel === "compose" &&
              composeAudience === "students" &&
              studentAtCapacity
            }
          />
        </div>
        <button
          type="button"
          onClick={() => openCompose()}
          className="shrink-0 bg-pine px-3.5 py-2 text-sm font-medium text-mist transition-colors hover:bg-celadon"
        >
          New notice
        </button>
      </div>

      <nav
        className="mt-4 flex gap-1 overflow-x-auto border-b border-stone pb-px"
        aria-label="Announcement sections"
      >
        {tabs.map((tab) => {
          const active = panel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "compose" && panel !== "compose") {
                  openCompose();
                  return;
                }
                setPanel(tab.id);
              }}
              className={`relative shrink-0 px-3.5 py-2.5 text-sm font-medium tracking-wide transition-colors ${
                active ? "text-pine" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              {tab.label}
              {typeof tab.count === "number" ? (
                <span className="ml-1.5 text-xs text-ink/40">{tab.count}</span>
              ) : null}
              <span
                className={`absolute inset-x-2.5 bottom-0 h-0.5 bg-celadon transition-opacity duration-300 ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      <div key={panel} className="animate-panel-in pt-6">
        {panel === "live" || panel === "drafts" ? (
          <>
            <div
              className="mb-4 flex flex-wrap gap-2"
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
                    className={`px-3 py-1.5 text-xs font-medium tracking-wide transition-colors ${
                      active
                        ? "bg-pine text-mist"
                        : "border border-stone text-ink/60 hover:border-pine/40 hover:text-pine"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <NoticeList
              items={panel === "live" ? filteredPublished : filteredDrafts}
              empty={
                panel === "live"
                  ? "No live notices in this lane. Compose one and publish into an open slot."
                  : "No drafts in this lane."
              }
              mode={panel}
              pending={pending}
              expandedId={expandedId}
              atCapacityFor={atCapacityFor}
              canManage={(item) => canManageNotice(profile, item)}
              onExpand={setExpandedId}
              onEdit={openCompose}
              onToggle={(item) =>
                run(() =>
                  setAnnouncementPublished(item.id, !item.is_published),
                )
              }
              onDelete={setPendingDelete}
            />
          </>
        ) : null}

        {panel === "preview" ? (
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
                    className={`px-3 py-1.5 text-xs font-medium tracking-wide transition-colors ${
                      active
                        ? "bg-pine text-mist"
                        : "border border-stone text-ink/60 hover:border-pine/40"
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
                            className="border-t border-mist/15 py-4 first:border-t-0 first:pt-0 last:pb-0"
                          >
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
                            className="border-t border-[#c4a574]/20 py-4 first:border-t-0 first:pt-0 last:pb-0"
                          >
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

        {panel === "insight" ? (
          <NoticesInsightGuide national={national} />
        ) : null}

        {panel === "compose" ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const formData = new FormData(form);
              formData.set("audience", composeAudience);
              if (editing) {
                formData.set("id", editing.id);
                run(() => updateAnnouncement(formData), form);
              } else {
                run(() => createAnnouncement(formData), form);
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
                  pending={pending}
                  onUnpublish={(item) =>
                    run(
                      () => setAnnouncementPublished(item.id, false),
                      null,
                      { keepCompose: true },
                    )
                  }
                  onEdit={(item) => openCompose(item)}
                  onDelete={(item) => setPendingDelete(item)}
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
                className={`${fieldClass} resize-y`}
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
                disabled={pending}
                className="bg-pine px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
              >
                {pending ? "Saving…" : editing ? "Save changes" : "Save notice"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setComposeAudience(defaultComposeAudience());
                  setComposeParishId(profile.parish_id ?? "");
                  setComposeBatchId("");
                  setPanel("live");
                }}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !pending && setPendingDelete(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-announcement-title"
            className="animate-fade-rise w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-red-800/80">
              Delete notice
            </p>
            <h3
              id="delete-announcement-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              Remove this announcement?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              “{pendingDelete.title}” will be permanently deleted
              {pendingDelete.is_published
                ? ` and removed from ${AUDIENCE_META[audienceOf(pendingDelete)].surface}`
                : ""}
              .
            </p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={() => setPendingDelete(null)}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => deleteAnnouncement(pendingDelete.id), null, {
                    keepCompose: panel === "compose",
                  })
                }
                className="bg-[#5c2a2a] px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-red-900 disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
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
    <ul className="divide-y divide-stone border-y border-stone">
      {items.map((item) => {
        const open = expandedId === item.id;
        const audience = audienceOf(item);
        const manageable = canManage(item);
        const blocked =
          mode === "drafts" && atCapacityFor(audience) && manageable;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onExpand(open ? null : item.id)}
              className="flex w-full items-start gap-3 py-3.5 text-left transition-colors hover:bg-mist/70"
              aria-expanded={open}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-ink">{item.title}</span>
                  <AudiencePill audience={audience} />
                </span>
                <span className="mt-0.5 block line-clamp-1 text-sm text-ink/55">
                  {item.body}
                </span>
              </span>
              <span className="mt-1 text-xs text-ink/40" aria-hidden>
                {open ? "−" : "+"}
              </span>
            </button>
            {open ? (
              <div className="animate-panel-in flex flex-wrap gap-2 border-t border-stone/70 bg-mist/40 pb-4 pt-3">
                {manageable ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onEdit(item)}
                      className="border border-pine/25 px-3 py-1.5 text-xs font-medium text-pine hover:border-pine disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending || blocked}
                      onClick={() => onToggle(item)}
                      className="border border-pine/25 px-3 py-1.5 text-xs font-medium text-pine hover:border-pine disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {mode === "live" ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onDelete(item)}
                      className="inline-flex h-8 w-8 items-center justify-center border border-red-900/20 text-red-800 hover:bg-red-50 disabled:opacity-60"
                      aria-label={`Delete ${item.title}`}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-ink/55">
                    Read-only — managed by the national desk
                    {audience === "general" ? " (home page)" : ""}.
                  </p>
                )}
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
