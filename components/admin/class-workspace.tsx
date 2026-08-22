"use client";

import { useEffect, useState } from "react";
import {
  endActiveZoomMeetings,
  getInPortalHostSession,
  type ClassStudentOption,
} from "@/app/admin/classes/actions";
import { InPortalZoom } from "@/components/classes/in-portal-zoom";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  audienceLabel,
  formatDuration,
  type ZoomClass,
  type ZoomClassAttendance,
} from "@/lib/classes/types";
import type { InPortalZoomSession } from "@/lib/zoom/types";

const fieldClass =
  "w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

export function ClassWorkspace({
  item,
  roster,
  pending,
  busyLabel,
  zoomReady,
  meetingSdkReady,
  onBack,
  onSync,
  onRegenCode,
  onManual,
  onSearchStudents,
  onStatus,
  onDelete,
}: {
  item: ZoomClass;
  roster: ZoomClassAttendance[];
  pending: boolean;
  busyLabel: string | null;
  zoomReady: boolean;
  meetingSdkReady: boolean;
  onBack: () => void;
  onSync: () => void;
  onRegenCode: () => void;
  onManual: (userId: string, present: boolean) => void;
  onSearchStudents: (query: string) => Promise<ClassStudentOption[]>;
  onStatus: (status: ZoomClass["status"]) => void;
  onDelete: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [studentQuery, setStudentQuery] = useState("");
  const [hits, setHits] = useState<ClassStudentOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [portalSession, setPortalSession] =
    useState<InPortalZoomSession | null>(null);
  const [hosting, setHosting] = useState(false);
  const [endingLive, setEndingLive] = useState(false);

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

  async function startInPortalHost() {
    setHosting(true);
    const next = await getInPortalHostSession(item.id);
    setHosting(false);
    if (!next.ok) {
      toastError(next.message, "In-portal Zoom");
      return;
    }
    setPortalSession(next.session);
  }

  async function endLiveMeetings() {
    const confirmed = window.confirm(
      "End all live Zoom meetings on the school host account? Everyone still in those meetings will be disconnected.",
    );
    if (!confirmed) return;

    setEndingLive(true);
    setPortalSession(null);
    try {
      const result = await endActiveZoomMeetings({ classId: item.id });
      if (!result.ok) {
        toastError(result.message, "End Zoom");
        return;
      }
      success(result.message, "End Zoom");
    } finally {
      setEndingLive(false);
    }
  }

  return (
    <div
      className="relative animate-panel-in"
      aria-busy={pending || hosting || endingLive}
    >
      <DeskLoaderOverlay
        active={hosting || endingLive}
        label={
          endingLive ? "Ending live Zoom meetings…" : "Opening host session…"
        }
      />
      <header className="border-b border-stone px-3 py-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
        >
          <span aria-hidden>←</span> Directory
        </button>
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
        <p className="mt-1 text-sm text-ink/55">
          {new Date(item.scheduled_start).toLocaleString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · {item.duration_minutes} min
        </p>

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
            Share with students on site — they enter it under Classes to mark
            present on their Records.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {item.zoom_meeting_id ? (
            <button
              type="button"
              disabled={pending || hosting || !meetingSdkReady}
              onClick={() => void startInPortalHost()}
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
              onClick={onSync}
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
              onClick={() => void endLiveMeetings()}
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
            onLeave={() => setPortalSession(null)}
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
