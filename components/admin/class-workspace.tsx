"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  endActiveZoomMeetings,
  getClassZoomLiveStatus,
  getInPortalHostSession,
  type ClassStudentOption,
  type ClassZoomSnapshot,
} from "@/app/admin/classes/actions";
import { InPortalZoom } from "@/components/classes/in-portal-zoom";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { useToast } from "@/components/ui/toast";
import type { ClassAttendanceRollup } from "@/lib/admin/class-roll";
import { ClassAttendancePanel } from "@/components/admin/class-attendance-panel";
import {
  audienceLabel,
  classSessionPhase,
  classSessionPhaseLabel,
  classUsesExternalJoinLink,
  formatClassDateTime,
  formatClassScheduleRange,
  formatDuration,
  formatDurationMinutes,
  type ZoomClass,
  type ZoomClassAttendance,
} from "@/lib/classes/types";
import type { InPortalZoomSession } from "@/lib/zoom/types";

const fieldClass =
  "w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

function normalizeDisplayId(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function ClassWorkspace({
  item,
  roster,
  rollup,
  pending,
  busyLabel,
  refreshing = false,
  zoomReady,
  meetingSdkReady,
  backHref,
  onBack,
  onRefresh,
  onSync,
  onRegenCode,
  onSetCheckinCodeVisible,
  onManual,
  onSearchStudents,
  onStatus,
  onDelete,
  onClassZoomUpdated,
  onUpdateJoinLink,
}: {
  item: ZoomClass;
  roster: ZoomClassAttendance[];
  rollup?: ClassAttendanceRollup | null;
  pending: boolean;
  busyLabel: string | null;
  refreshing?: boolean;
  zoomReady: boolean;
  meetingSdkReady: boolean;
  backHref?: string;
  onBack?: () => void;
  onRefresh?: () => void;
  onSync: () => void;
  onRegenCode: () => void;
  onSetCheckinCodeVisible?: (show: boolean) => void;
  onManual: (userId: string, present: boolean) => void;
  onSearchStudents: (query: string) => Promise<ClassStudentOption[]>;
  onStatus: (status: ZoomClass["status"]) => void;
  onDelete: () => void;
  onClassZoomUpdated?: (zoom: ClassZoomSnapshot) => void;
  onUpdateJoinLink?: (input: {
    zoom_join_url: string;
    zoom_meeting_id?: string;
    zoom_passcode?: string;
  }) => void;
}) {
  const { success, error: toastError } = useToast();
  const [studentQuery, setStudentQuery] = useState("");
  const [hits, setHits] = useState<ClassStudentOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [portalSession, setPortalSession] =
    useState<InPortalZoomSession | null>(null);
  const [hostRefreshAttempted, setHostRefreshAttempted] = useState(false);
  const [hosting, setHosting] = useState(false);
  const [endingLive, setEndingLive] = useState(false);
  const [confirmEndLive, setConfirmEndLive] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);
  const [zoomLive, setZoomLive] = useState(false);
  const [displayMeetingId, setDisplayMeetingId] = useState(
    () => item.zoom_meeting_id,
  );
  const [clock, setClock] = useState(() => Date.now());
  const [editingJoinLink, setEditingJoinLink] = useState(false);
  const [joinUrlDraft, setJoinUrlDraft] = useState(item.zoom_join_url ?? "");
  const [meetingIdDraft, setMeetingIdDraft] = useState(
    item.zoom_meeting_id ?? "",
  );
  const [passcodeDraft, setPasscodeDraft] = useState(item.zoom_passcode ?? "");

  const externalJoinLink = classUsesExternalJoinLink(item);

  useEffect(() => {
    setDisplayMeetingId(item.zoom_meeting_id);
  }, [item.zoom_meeting_id]);

  useEffect(() => {
    if (editingJoinLink) return;
    setJoinUrlDraft(item.zoom_join_url ?? "");
    setMeetingIdDraft(item.zoom_meeting_id ?? "");
    setPasscodeDraft(item.zoom_passcode ?? "");
  }, [
    item.zoom_join_url,
    item.zoom_meeting_id,
    item.zoom_passcode,
    editingJoinLink,
  ]);

  function applyClassZoom(zoom: ClassZoomSnapshot) {
    setDisplayMeetingId(zoom.zoom_meeting_id);
    onClassZoomUpdated?.(zoom);
  }

  const sessionPhase = classSessionPhase(item, new Date(clock));
  const inSessionWindow = sessionPhase === "in_window";
  const hostingInPortal = Boolean(portalSession);
  const modalBusy = hosting || endingLive;

  useEffect(() => {
    const tick = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!confirmEndLive && !confirmSync) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !modalBusy) {
        setConfirmEndLive(false);
        setConfirmSync(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [confirmEndLive, confirmSync, modalBusy]);

  useEffect(() => {
    if (!item.zoom_meeting_id || !zoomReady) {
      setZoomLive(false);
      return;
    }

    let cancelled = false;

    async function refreshLive() {
      const next = await getClassZoomLiveStatus(item.id);
      if (!cancelled && next.ok) setZoomLive(next.live);
    }

    void refreshLive();
    const poll = window.setInterval(() => void refreshLive(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [item.id, item.zoom_meeting_id, zoomReady, hostingInPortal, endingLive]);

  useEffect(() => {
    const q = studentQuery.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setSearching(true);
      void onSearchStudents(q).then((rows) => {
        if (!cancelled) {
          setHits(rows);
          setSearching(false);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [studentQuery, onSearchStudents]);

  const hasZoom = Boolean(item.zoom_meeting_id || item.zoom_join_url);

  async function startInPortalHost(forceRefreshMeeting = false) {
    setHosting(true);
    setPortalSession(null);
    const next = await getInPortalHostSession(item.id, {
      forceRefreshMeeting,
    });
    setHosting(false);
    if (!next.ok) {
      toastError(next.message, "In-portal Zoom");
      return;
    }
    if (next.classZoom) {
      applyClassZoom(next.classZoom);
    }
    if (next.meetingRefreshed) {
      setHostRefreshAttempted(true);
      success(
        next.classZoom
          ? `Zoom meeting ID updated to ${next.classZoom.zoom_meeting_id}. Starting host…`
          : "A fresh Zoom meeting was created for this class. Starting host…",
        "In-portal Zoom",
      );
      onRefresh?.();
    }
    setPortalSession(next.session);
    if (item.zoom_meeting_id && zoomReady) {
      const live = await getClassZoomLiveStatus(item.id);
      if (live.ok) setZoomLive(live.live);
    }
  }

  async function retryHostAfterMissingMeeting() {
    if (hostRefreshAttempted) {
      toastError(
        "The meeting exists on Zoom, but the browser SDK still cannot open it. Use Host in Zoom app. On the live site, App B must use Production Client ID/Secret, Meeting SDK turned on, and portal.schoolofdisciples.org on the domain allow list — then redeploy.",
        "In-portal Zoom",
      );
      setPortalSession(null);
      return;
    }
    setHostRefreshAttempted(true);
    await startInPortalHost(true);
  }

  async function endLiveMeetings() {
    setEndingLive(true);
    setPortalSession(null);
    try {
      const result = await endActiveZoomMeetings({ classId: item.id });
      if (!result.ok) {
        toastError(result.message, "End Zoom");
        return;
      }
      success(result.message, "End Zoom");
      setZoomLive(false);
      setConfirmEndLive(false);
    } finally {
      setEndingLive(false);
    }
  }

  function leavePortalZoom() {
    setPortalSession(null);
    setHostRefreshAttempted(false);
    void getClassZoomLiveStatus(item.id).then((next) => {
      if (next.ok) setZoomLive(next.live);
    });
  }

  return (
    <div
      className="relative animate-panel-in"
      aria-busy={pending || hosting || endingLive}
    >
      <DeskLoaderOverlay
        active={(hosting || endingLive) && !confirmEndLive}
        label={
          endingLive ? "Ending live Zoom meetings…" : "Opening host session…"
        }
      />
      <header className="border-b border-stone px-3 py-4 sm:px-6">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
          >
            <span aria-hidden>←</span> Classes
          </Link>
        ) : onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
          >
            <span aria-hidden>←</span> Directory
          </button>
        ) : null}
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          {item.status} ·{" "}
          {audienceLabel(
            item.audience,
            item.parish_name,
            item.batch_name,
            item.cohort_name,
            item.year,
          )}
        </p>
        <h2 className="mt-1 font-display text-[clamp(1.3rem,4vw,2rem)] text-pine">
          {item.title}
        </h2>

        <div className="mt-3 border border-stone bg-white/70 px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                Schedule
              </p>
              <p className="mt-1 text-sm text-ink/80">
                {formatClassScheduleRange(
                  item.scheduled_start,
                  item.scheduled_end,
                )}
              </p>
              <p className="mt-1 text-xs text-ink/50">
                Starts {formatClassDateTime(item.scheduled_start)} · Ends{" "}
                {formatClassDateTime(item.scheduled_end)} ·{" "}
                {formatDurationMinutes(item.duration_minutes)} planned
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {zoomLive ? (
                <span className="inline-flex items-center gap-1.5 border border-celadon/50 bg-celadon/10 px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-pine">
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-celadon"
                    aria-hidden
                  />
                  Zoom live
                </span>
              ) : null}
              {hostingInPortal ? (
                <span className="border border-pine/30 bg-pine/5 px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-pine">
                  Hosting in portal
                </span>
              ) : null}
              {inSessionWindow && item.status === "live" && !zoomLive ? (
                <span className="border border-stone px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/60">
                  Class marked live
                </span>
              ) : null}
              {inSessionWindow && !zoomLive && item.status !== "live" ? (
                <span className="border border-stone px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/60">
                  In session window
                </span>
              ) : null}
              {!zoomLive && !inSessionWindow ? (
                <span className="border border-stone px-2 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/50">
                  {classSessionPhaseLabel(sessionPhase)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {item.primary_teacher_name ? (
          <div className="mt-3 flex items-center gap-3 border border-pine/20 bg-pine/[0.04] px-3 py-2.5">
            {item.primary_teacher_avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.primary_teacher_avatar_url}
                alt=""
                className="size-10 shrink-0 rounded-full object-cover ring-2 ring-pine/15"
              />
            ) : (
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pine/10 font-display text-sm text-pine"
                aria-hidden
              >
                {item.primary_teacher_name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase() ?? "")
                  .join("") || "T"}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Teacher
              </p>
              <p className="mt-0.5 truncate text-sm font-medium text-pine">
                {item.primary_teacher_name}
              </p>
              {item.primary_teacher_email ? (
                <p className="truncate text-xs text-ink/50">
                  {item.primary_teacher_email}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-3 border border-dashed border-stone px-3 py-2.5 text-sm text-ink/50">
            No teacher assigned for this class.
          </div>
        )}

        <div className="mt-3 border border-pine/20 bg-white/70 px-3 py-2.5">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
            Check-in code
          </p>
          {item.attendance_code ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-mono text-2xl tracking-[0.2em] text-pine">
                {item.attendance_code}
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={onRegenCode}
                className="border border-stone px-2 py-1 text-xs text-ink/70"
              >
                Regenerate
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={onRegenCode}
              className="mt-1 border border-pine/30 px-3 py-1.5 text-xs font-medium text-pine"
            >
              Generate code
            </button>
          )}
          <p className="mt-1 text-xs text-ink/50">
            Share with students in the room. They enter it under Classes →
            Check-in unless you allow portal visibility below.
          </p>
          {item.attendance_code && onSetCheckinCodeVisible ? (
            <label className="mt-3 flex items-start gap-2 border-t border-stone/60 pt-3 text-xs text-ink/70">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(item.show_checkin_code_to_students)}
                disabled={pending}
                onChange={(event) =>
                  onSetCheckinCodeVisible(event.target.checked)
                }
              />
              <span>
                Show check-in code on student portal
                <span className="mt-0.5 block text-[0.65rem] leading-relaxed text-ink/50">
                  {item.show_checkin_code_to_students
                    ? "Students can read this code online — they may check in without being in the room."
                    : "Recommended. Students must get the code from you in person."}
                </span>
              </span>
            </label>
          ) : null}
        </div>

        {externalJoinLink ? (
          <div className="mt-3 border border-stone bg-white/70 px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                  Join link
                </p>
                {editingJoinLink ? (
                  <div className="mt-2 space-y-3">
                    <label className="block text-sm">
                      Zoom join URL
                      <input
                        required
                        value={joinUrlDraft}
                        onChange={(e) => setJoinUrlDraft(e.target.value)}
                        className={`mt-1 ${fieldClass}`}
                        placeholder="https://zoom.us/j/…"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        Meeting ID
                        <input
                          value={meetingIdDraft}
                          onChange={(e) => setMeetingIdDraft(e.target.value)}
                          className={`mt-1 ${fieldClass}`}
                          placeholder="For attendance sync"
                        />
                      </label>
                      <label className="block text-sm">
                        Passcode
                        <input
                          value={passcodeDraft}
                          onChange={(e) => setPasscodeDraft(e.target.value)}
                          className={`mt-1 ${fieldClass}`}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 break-all font-mono text-sm text-ink/80">
                      {item.zoom_join_url}
                    </p>
                    {item.zoom_meeting_id ? (
                      <p className="mt-1 text-xs text-ink/50">
                        Meeting ID{" "}
                        <span className="font-mono text-ink/70">
                          {item.zoom_meeting_id}
                        </span>
                        {item.zoom_passcode ? (
                          <>
                            {" "}
                            · passcode set
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {editingJoinLink ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setEditingJoinLink(false);
                        setJoinUrlDraft(item.zoom_join_url ?? "");
                        setMeetingIdDraft(item.zoom_meeting_id ?? "");
                        setPasscodeDraft(item.zoom_passcode ?? "");
                      }}
                      className="border border-stone px-3 py-1.5 text-xs text-ink/70"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={pending || !joinUrlDraft.trim()}
                      onClick={() => {
                        const joinUrl = joinUrlDraft.trim();
                        if (!/^https?:\/\//i.test(joinUrl)) {
                          toastError(
                            "Join link must start with http:// or https://.",
                            "Classes",
                          );
                          return;
                        }
                        onUpdateJoinLink?.({
                          zoom_join_url: joinUrl,
                          zoom_meeting_id: meetingIdDraft.trim() || undefined,
                          zoom_passcode: passcodeDraft.trim() || undefined,
                        });
                        setEditingJoinLink(false);
                      }}
                      className="border border-pine bg-pine px-3 py-1.5 text-xs font-medium text-mist disabled:opacity-40"
                    >
                      Save link
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setEditingJoinLink(true)}
                    className="border border-stone px-3 py-1.5 text-xs text-ink/70 hover:border-pine hover:text-pine disabled:opacity-40"
                  >
                    Change link
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-ink/50">
              Students open this link to join. Update it here if the host
              changes the Zoom room.
            </p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {onRefresh ? (
            <button
              type="button"
              disabled={pending || refreshing}
              onClick={onRefresh}
              className="inline-flex min-h-[1.85rem] items-center justify-center border border-stone px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:border-pine hover:text-pine disabled:opacity-40"
            >
              {refreshing ? (
                <DeskLoader label="Refreshing…" />
              ) : (
                "Refresh"
              )}
            </button>
          ) : null}
          {item.zoom_meeting_id ? (
            <button
              type="button"
              disabled={pending || hosting || !meetingSdkReady}
              onClick={() => {
                setHostRefreshAttempted(false);
                void startInPortalHost(false);
              }}
              className="inline-flex min-h-[1.85rem] min-w-[7.5rem] items-center justify-center bg-pine px-3 py-1.5 text-xs font-medium text-mist disabled:opacity-40"
              title={
                meetingSdkReady
                  ? "Host inside the Classes page"
                  : "In-portal Zoom is not configured yet"
              }
            >
              {hosting ? (
                <DeskLoader label="Opening…" tone="mist" />
              ) : (
                "Host in portal"
              )}
            </button>
          ) : null}
          {item.zoom_start_url ? (
            <a
              href={item.zoom_start_url}
              target="_blank"
              rel="noreferrer"
              className="border border-pine/30 px-3 py-1.5 text-xs font-medium text-pine"
            >
              Host in Zoom app
            </a>
          ) : null}
          {item.zoom_join_url ? (
            <a
              href={item.zoom_join_url}
              target="_blank"
              rel="noreferrer"
              className="border border-stone px-3 py-1.5 text-xs text-ink/70"
            >
              Open join link
            </a>
          ) : null}
          {hasZoom ? (
            <button
              type="button"
              disabled={pending || !zoomReady}
              onClick={() => setConfirmSync(true)}
              className="inline-flex min-h-[1.85rem] min-w-[5.5rem] items-center justify-center border border-celadon/40 px-3 py-1.5 text-xs font-medium text-pine disabled:opacity-40"
            >
              {pending && busyLabel?.startsWith("Syncing") ? (
                <DeskLoader label={busyLabel} />
              ) : (
                "Sync Zoom"
              )}
            </button>
          ) : null}
          {zoomReady ? (
            <button
              type="button"
              disabled={pending || hosting || endingLive}
              onClick={() => setConfirmEndLive(true)}
              className="inline-flex min-h-[1.85rem] items-center justify-center border border-[#c4a574]/50 px-3 py-1.5 text-xs font-medium text-[#6b4f2a] disabled:opacity-40"
              title="End live meetings on the Zoom host account so Host in portal can start cleanly"
            >
              {endingLive ? (
                <DeskLoader label="Ending…" />
              ) : (
                "End live Zoom"
              )}
            </button>
          ) : null}
          {item.status === "scheduled" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatus("live")}
              className="border border-stone px-3 py-1.5 text-xs text-ink/70"
            >
              Mark live
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="border border-stone px-3 py-1.5 text-xs text-red-800"
          >
            Delete
          </button>
        </div>
        {displayMeetingId ? (
          <p className="mt-2 text-xs text-ink/50">
            Zoom meeting ID{" "}
            <span className="font-mono text-ink/70">{displayMeetingId}</span>
            {portalSession?.meetingNumber &&
            normalizeDisplayId(portalSession.meetingNumber) !==
              normalizeDisplayId(displayMeetingId) ? (
              <>
                {" "}
                · hosting as{" "}
                <span className="font-mono text-ink/70">
                  {portalSession.meetingNumber}
                </span>
              </>
            ) : null}
            {" · "}
            Check it under Meetings on the Zoom host account dashboard.
          </p>
        ) : null}
        {item.last_synced_at ? (
          <p className="mt-2 text-xs text-ink/45">
            Last Zoom sync{" "}
            {new Date(item.last_synced_at).toLocaleString("en-GB")}
          </p>
        ) : null}
      </header>

      {portalSession ? (
        <div className="border-b border-stone px-3 py-3 sm:px-6">
          <InPortalZoom
            session={portalSession}
            onLeave={leavePortalZoom}
            onMeetingMissing={() => {
              void retryHostAfterMissingMeeting();
            }}
          />
        </div>
      ) : null}

      <div className="border-b border-stone px-3 py-4 sm:px-6">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
          Manual mark
        </p>
        <h3 className="font-display text-lg text-pine">Mark a student</h3>
        <input
          value={studentQuery}
          onChange={(e) => setStudentQuery(e.target.value)}
          placeholder="Search name or email…"
          className={`mt-2 ${fieldClass}`}
        />
        {searching ? (
          <p className="mt-2 text-xs text-ink/45">Searching…</p>
        ) : hits.length > 0 ? (
          <ul className="mt-2 max-h-40 divide-y divide-stone overflow-y-auto border border-stone">
            {hits.map((hit) => (
              <li
                key={hit.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{hit.name || hit.email}</p>
                  <p className="truncate text-xs text-ink/50">{hit.email}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      onManual(hit.id, true);
                      setStudentQuery("");
                      setHits([]);
                    }}
                    className="border border-pine/30 px-2 py-1 text-xs text-pine"
                  >
                    Present
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      onManual(hit.id, false);
                      setStudentQuery("");
                      setHits([]);
                    }}
                    className="border border-stone px-2 py-1 text-xs text-ink/60"
                  >
                    Absent
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : studentQuery.trim().length >= 2 ? (
          <p className="mt-2 text-xs text-ink/45">No matching students in scope.</p>
        ) : null}
      </div>

      {rollup ? (
        <ClassAttendancePanel
          rollup={rollup}
          classTitle={item.title}
          lastSyncedAt={item.last_synced_at}
        />
      ) : (
      <div className="px-3 py-4 sm:px-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
              Roster
            </p>
            <h3 className="font-display text-lg text-pine">Attendance</h3>
          </div>
          <p className="text-xs text-ink/50">
            {roster.filter((r) => r.present).length} present ·{" "}
            {roster.filter((r) => !r.user_id).length} unmatched
          </p>
        </div>
        {roster.length === 0 ? (
          <p className="border border-dashed border-stone px-4 py-8 text-center text-sm text-ink/50">
            No marks yet. Share the check-in code, mark students manually, or
            sync Zoom after the meeting.
          </p>
        ) : (
          <ul className="max-h-[min(50vh,28rem)] divide-y divide-stone overflow-y-auto border-y border-stone">
            {roster.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {row.student_name || row.zoom_display_name || "Unknown"}
                  </p>
                  <p className="truncate text-xs text-ink/50">
                    {row.matched_email}
                    {!row.user_id ? " · unmatched" : ""} · {row.source}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-xs font-medium uppercase tracking-[0.1em] ${
                      row.present ? "text-celadon" : "text-ink/40"
                    }`}
                  >
                    {row.present ? "Present" : "Absent"}
                  </p>
                  {row.source === "zoom" ? (
                    <p className="text-xs tabular-nums text-ink/50">
                      {formatDuration(row.duration_seconds)} /{" "}
                      {formatDuration(row.required_seconds)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
      <DeskConfirmModal
        open={confirmSync}
        onClose={() => !pending && setConfirmSync(false)}
        onConfirm={() => {
          setConfirmSync(false);
          onSync();
        }}
        eyebrow="Sync Zoom"
        title="Sync attendance from Zoom?"
        body={
          <>
            The meeting must have fully ended on Zoom first. Students count as
            present when they stayed for at least{" "}
            {item.attendance_threshold_percent}% of the class length (
            {formatDurationMinutes(item.duration_minutes)} scheduled).
          </>
        }
        confirmLabel="Sync now"
        busy={pending && Boolean(busyLabel?.startsWith("Syncing"))}
        busyLabel={busyLabel ?? "Syncing Zoom…"}
      />
      <DeskConfirmModal
        open={confirmEndLive}
        onClose={() => !endingLive && setConfirmEndLive(false)}
        onConfirm={() => void endLiveMeetings()}
        eyebrow="End live Zoom"
        title="End live Zoom meetings?"
        body={
          <>
            This ends meetings that are <strong>live right now</strong> on the
            school Zoom host account. Leaving the portal player does not end the
            meeting. To remove a scheduled class from the Zoom calendar, use{" "}
            <strong>Delete</strong> on this desk.
          </>
        }
        confirmLabel="End meetings"
        destructive
        busy={endingLive}
        busyLabel="Ending live Zoom meetings…"
      />
    </div>
  );
}

export function ClassesInsight({
  zoomReady,
  national,
}: {
  zoomReady: boolean;
  national: boolean;
}) {
  const sections = [
    {
      title: "Audience",
      body: national
        ? "Schedule for everyone (UK-wide), one parish, or one batch. Parish desks only see and manage classes for their own parish — not national “everyone” sessions."
        : "You schedule for your parish or one of its batches. National “everyone” classes are managed on the national desk; your students still see them in the portal.",
    },
    {
      title: "In-portal Zoom",
      body: "Admins can Host in portal and students can Join in portal when Meeting SDK keys are set. Host in Zoom app / Join Zoom always remain available as fallbacks.",
    },
    {
      title: "Class emails",
      body: "When scheduling, tick Send students an email, review the confirmation modal, then send. Each student gets a personalised invite with time, portal link, and Zoom join details. Physical check-in codes stay on the desk — share them in the room, not by email.",
    },
    {
      title: "Check-in code & manual marks",
      body: "Codes and admin marks write straight onto each student’s Records scorecard for that class. Parish desks can only mark students enrolled in their parish.",
    },
    {
      title: "Zoom API",
      body: zoomReady
        ? "Zoom meeting create, sync, and in-portal host are configured on this server."
        : "Zoom meeting create / sync is not configured yet. Check-in codes and manual marks still work. Ask a national admin to finish Zoom setup if you need sync.",
    },
  ];

  return (
    <div className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-3 py-4 sm:px-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Live hall
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] text-pine">
          Insight
        </h2>
        <p className="mt-1.5 max-w-xl text-sm text-ink/60">
          Schedule → email / code / in-portal Zoom → attendance on Records.
        </p>
      </div>
      <ol className="divide-y divide-stone">
        {sections.map((section, index) => (
          <li
            key={section.title}
            className="grid gap-1.5 px-3 py-3.5 sm:grid-cols-[2rem_1fr] sm:gap-4 sm:px-5"
          >
            <p className="font-display text-lg tabular-nums text-celadon/80">
              {String(index + 1).padStart(2, "0")}
            </p>
            <div>
              <h3 className="text-sm font-medium text-ink">{section.title}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink/65">
                {section.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
