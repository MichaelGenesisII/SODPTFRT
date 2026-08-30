"use client";

import { useState, useTransition, useEffect, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  getInPortalJoinSession,
  markAttendanceWithCode,
  updateStudentZoomEmail,
} from "@/app/student/classes/actions";
import { InPortalZoom } from "@/components/classes/in-portal-zoom";
import { useRefreshOnVisible } from "@/components/student/use-refresh-on-visible";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  audienceLabel,
  formatDuration,
  type ZoomClass,
  type ZoomClassAttendance,
} from "@/lib/classes/types";
import type { StudentProfile } from "@/lib/student/types";
import type { InPortalZoomSession } from "@/lib/zoom/types";
import {
  SOD_STUDENT_TOUR_TAB_EVENT,
  type StudentTourTabPayload,
} from "@/lib/student/portal-tour-steps";

type AttendanceSnap = Pick<
  ZoomClassAttendance,
  "class_id" | "present" | "duration_seconds" | "required_seconds" | "source"
>;

type ClassesTab = "upcoming" | "checkin" | "seat" | "past";

export function StudentClassesRefresh({ children }: { children: ReactNode }) {
  useRefreshOnVisible();
  return <>{children}</>;
}

export function StudentClassesClient({
  profile,
  classes,
  attendance,
  meetingSdkReady,
}: {
  profile: StudentProfile;
  classes: ZoomClass[];
  attendance: AttendanceSnap[];
  meetingSdkReady: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [tab, setTab] = useState<ClassesTab>("upcoming");
  const [zoomEmail, setZoomEmail] = useState(profile.zoom_email ?? "");
  const [checkInCode, setCheckInCode] = useState("");
  const [portalSession, setPortalSession] =
    useState<InPortalZoomSession | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [confirmCheckInOpen, setConfirmCheckInOpen] = useState(false);

  useEffect(() => {
    function onTourTab(event: Event) {
      const detail = (event as CustomEvent<StudentTourTabPayload>).detail;
      if (detail?.page !== "classes") return;
      setTab(detail.tab);
    }
    window.addEventListener(SOD_STUDENT_TOUR_TAB_EVENT, onTourTab);
    return () =>
      window.removeEventListener(SOD_STUDENT_TOUR_TAB_EVENT, onTourTab);
  }, []);

  const attendanceMap = new Map(attendance.map((a) => [a.class_id, a]));
  const upcoming = classes.filter((c) => c.status !== "ended");
  const past = classes.filter((c) => c.status === "ended");
  const presentCount = attendance.filter((a) => a.present).length;

  const tabs: { id: ClassesTab; label: string; hint?: string }[] = [
    {
      id: "upcoming",
      label: "Upcoming",
      hint: upcoming.length ? String(upcoming.length) : undefined,
    },
    { id: "checkin", label: "Check-in" },
    { id: "seat", label: "Zoom seat" },
    {
      id: "past",
      label: "Past",
      hint: past.length ? String(past.length) : undefined,
    },
  ];

  function saveZoomEmail(event: FormEvent) {
    event.preventDefault();
    setBusyLabel("Saving Zoom seat…");
    startTransition(async () => {
      try {
        const next = await updateStudentZoomEmail(zoomEmail);
        if (next.ok) {
          success(next.message, "Zoom seat");
          router.refresh();
        } else {
          error(next.message, "Zoom seat");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function runCheckIn() {
    setBusyLabel("Checking you in…");
    startTransition(async () => {
      try {
        const next = await markAttendanceWithCode(checkInCode);
        if (next.ok) {
          success(next.message, "Check-in");
          setCheckInCode("");
          setConfirmCheckInOpen(false);
          setTab("upcoming");
          router.refresh();
        } else {
          error(next.message, "Check-in");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    if (checkInCode.trim().length < 4) return;
    setConfirmCheckInOpen(true);
  }

  async function joinInPortal(classId: string) {
    setJoiningId(classId);
    setBusyLabel("Joining class…");
    try {
      const next = await getInPortalJoinSession(classId);
      if (!next.ok) {
        error(next.message, "In-portal Zoom");
        return;
      }
      setPortalSession(next.session);
    } finally {
      setJoiningId(null);
      setBusyLabel(null);
    }
  }

  return (
    <div className="relative space-y-4 sm:space-y-5" aria-busy={busy}>
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      {portalSession ? (
        <section className="animate-panel-in border border-stone bg-mist">
          <div className="flex items-start justify-between gap-3 border-b border-stone px-3 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
                Live now
              </p>
              <h2 className="mt-1 font-display text-lg text-pine sm:text-xl">
                In-portal Zoom
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setPortalSession(null)}
              className="min-h-10 shrink-0 border border-stone px-3 py-2 text-xs text-ink/65 hover:border-pine/40 hover:text-pine"
            >
              Hide player
            </button>
          </div>
          <div className="p-2 sm:p-4">
            <InPortalZoom
              session={portalSession}
              onLeave={() => setPortalSession(null)}
            />
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-3 gap-px border border-stone bg-stone sm:gap-0 sm:bg-mist/50">
        <MiniStat label="Upcoming" value={String(upcoming.length)} />
        <MiniStat label="Present" value={String(presentCount)} />
        <MiniStat label="Past" value={String(past.length)} />
      </div>

      <nav
        className="grid grid-cols-2 border border-stone bg-mist/40 sm:flex sm:gap-1 sm:overflow-x-auto sm:border-0 sm:border-b sm:bg-transparent sm:pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Classes sections"
        data-tour="student-classes-tabs"
      >
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative min-h-12 px-2 py-3 text-center text-sm font-medium tracking-wide transition-colors sm:min-h-0 sm:shrink-0 sm:px-3 sm:py-2 sm:text-left ${
                active
                  ? "bg-mist text-pine sm:bg-transparent"
                  : "text-ink/50 hover:text-ink/80"
              }`}
            >
              <span className="inline-flex flex-wrap items-center justify-center gap-1 sm:justify-start sm:gap-1.5">
                {item.label}
                {item.hint ? (
                  <span className="tabular-nums text-[0.65rem] text-ink/40">
                    {item.hint}
                  </span>
                ) : null}
              </span>
              <span
                className={`absolute inset-x-3 bottom-0 h-0.5 bg-celadon transition-opacity sm:inset-x-2 ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      {tab === "upcoming" ? (
        <Panel
          eyebrow="Coming up"
          title="Scheduled classes"
          body="Join in the portal or the Zoom app. Open a class for passcode and notes."
        >
          {upcoming.length === 0 ? (
            <Empty>No upcoming classes in your scope yet.</Empty>
          ) : (
            <ul className="divide-y divide-stone border-y border-stone">
              {upcoming.map((item) => (
                <ClassRow
                  key={item.id}
                  item={item}
                  snap={attendanceMap.get(item.id)}
                  meetingSdkReady={meetingSdkReady}
                  joining={joiningId === item.id}
                  open={openClassId === item.id}
                  onToggle={() =>
                    setOpenClassId((id) => (id === item.id ? null : item.id))
                  }
                  onJoinPortal={() => void joinInPortal(item.id)}
                />
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === "checkin" ? (
        <Panel
          eyebrow="Physical or hybrid"
          title="Check in with a code"
          body="Your facilitator shares a code in the room. Enter it here to mark present on Records — the code is not shown online unless the desk allows it on the class."
        >
          <form
            onSubmit={submitCode}
            className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <label className="block text-sm font-medium text-ink">
              Class code
              <input
                value={checkInCode}
                onChange={(e) => setCheckInCode(e.target.value.toUpperCase())}
                placeholder="e.g. K7M2PQ"
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 w-full border border-stone bg-white/70 px-3 py-3 font-mono text-sm tracking-[0.18em] outline-none focus:border-pine sm:py-2"
              />
            </label>
            <button
              type="submit"
              disabled={busy || checkInCode.trim().length < 4}
              className="min-h-11 w-full bg-pine px-4 py-2.5 text-sm font-medium text-mist disabled:opacity-60 sm:w-auto"
            >
              {busy && busyLabel?.startsWith("Checking")
                ? "Checking…"
                : "Mark present"}
            </button>
          </form>
        </Panel>
      ) : null}

      {tab === "seat" ? (
        <Panel
          eyebrow="Your Zoom seat"
          title="How we recognise you online"
          body={`Join with ${profile.email}, or add a secondary Zoom email. Online present needs ≥90% of class length.`}
        >
          <form
            onSubmit={saveZoomEmail}
            className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <label className="block text-sm font-medium text-ink">
              Optional Zoom email
              <input
                type="email"
                value={zoomEmail}
                onChange={(e) => setZoomEmail(e.target.value)}
                placeholder="Address on your Zoom profile"
                className="mt-1.5 w-full border border-stone bg-white/70 px-3 py-3 text-sm outline-none focus:border-pine sm:py-2"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 w-full border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine disabled:opacity-60 sm:w-auto"
            >
              {busy && busyLabel?.startsWith("Saving") ? "Saving…" : "Save seat"}
            </button>
          </form>
        </Panel>
      ) : null}

      {tab === "past" ? (
        <Panel
          eyebrow="Past sessions"
          title="Your attendance"
          body="Ended classes and how you were marked."
        >
          {past.length === 0 ? (
            <Empty>No past classes yet.</Empty>
          ) : (
            <ul className="divide-y divide-stone border-y border-stone">
              {past.map((item) => (
                <ClassRow
                  key={item.id}
                  item={item}
                  snap={attendanceMap.get(item.id)}
                  meetingSdkReady={meetingSdkReady}
                  open={openClassId === item.id}
                  onToggle={() =>
                    setOpenClassId((id) => (id === item.id ? null : item.id))
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      <DeskConfirmModal
        open={confirmCheckInOpen}
        onClose={() => !busy && setConfirmCheckInOpen(false)}
        onConfirm={runCheckIn}
        eyebrow="Physical check-in"
        title="Mark present with this code?"
        body={
          <>
            This records you as present for the matching class and updates your
            Records attendance. Make sure the code came from your facilitator in
            the room.
            <span className="mt-3 block font-mono text-sm tracking-[0.18em] text-ink">
              {checkInCode.trim().toUpperCase()}
            </span>
          </>
        }
        confirmLabel="Mark present"
        busy={busy}
        busyLabel={busyLabel ?? "Checking you in…"}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-mist/80 px-2.5 py-3 sm:bg-transparent sm:px-4 sm:py-3">
      <p className="text-[0.58rem] uppercase tracking-[0.1em] text-ink/40 sm:text-[0.6rem] sm:tracking-[0.12em]">
        {label}
      </p>
      <p className="mt-0.5 font-display text-lg tabular-nums text-pine sm:text-xl">
        {value}
      </p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 font-display text-xl text-pine sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
          {body}
        </p>
      </div>
      <div className="px-3 py-3 sm:px-5 sm:py-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border border-dashed border-stone px-4 py-8 text-center text-sm text-ink/50">
      {children}
    </p>
  );
}

function ClassRow({
  item,
  snap,
  meetingSdkReady,
  joining,
  open,
  onToggle,
  onJoinPortal,
}: {
  item: ZoomClass;
  snap?: AttendanceSnap;
  meetingSdkReady: boolean;
  joining?: boolean;
  open: boolean;
  onToggle: () => void;
  onJoinPortal?: () => void;
}) {
  const when = new Date(item.scheduled_start).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const canJoin = item.status !== "ended" && Boolean(item.zoom_meeting_id);
  const hasExtra = Boolean(
    item.description || item.zoom_passcode || item.student_checkin_code,
  );
  const showActions = item.status !== "ended" && (canJoin || item.zoom_join_url);

  let statusLine = "Join when the session opens";
  if (snap) {
    statusLine =
      (snap.present ? "Marked present" : "Marked absent") +
      (snap.source === "zoom"
        ? ` · stayed ${formatDuration(snap.duration_seconds)} (need ${formatDuration(snap.required_seconds)})`
        : ` · via ${snap.source}`);
  } else if (item.status === "ended") {
    statusLine = "No mark yet";
  }

  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <p className="text-[0.6rem] uppercase tracking-[0.12em] text-celadon">
            {item.status} · {item.duration_minutes} min
          </p>
          <h3 className="mt-1 break-words font-display text-base text-pine sm:text-lg">
            {item.title}
          </h3>
          <p className="mt-0.5 text-sm text-ink/55">{when}</p>
          <p className="mt-1.5 break-words text-xs leading-relaxed text-ink/45">
            {statusLine}
          </p>
          {hasExtra ? (
            <p className="mt-1.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-pine/70">
              {open ? "Hide details" : "Show details"}
            </p>
          ) : null}
        </button>

        {showActions ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-col sm:gap-1.5">
            {canJoin ? (
              <button
                type="button"
                disabled={!meetingSdkReady || joining}
                onClick={onJoinPortal}
                className="inline-flex min-h-11 items-center justify-center bg-pine px-3 py-2 text-sm font-medium text-mist disabled:opacity-40 sm:min-h-0"
                title={
                  meetingSdkReady
                    ? "Join inside the Classes page"
                    : "In-portal Zoom is not configured yet"
                }
              >
                {joining ? "Opening…" : "Join"}
              </button>
            ) : (
              <span className="hidden sm:block" aria-hidden />
            )}
            {item.zoom_join_url ? (
              <a
                href={item.zoom_join_url}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex min-h-11 items-center justify-center border border-pine/30 px-3 py-2 text-sm font-medium text-pine sm:min-h-0 ${
                  canJoin ? "" : "col-span-2"
                }`}
              >
                Zoom app
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {open && hasExtra ? (
        <div className="mt-3 border border-stone bg-white/50 px-3 py-3 text-sm text-ink/65">
          <p className="text-[0.6rem] uppercase tracking-[0.12em] text-ink/40">
            {audienceLabel(
              item.audience,
              item.parish_name,
              item.batch_name,
              item.cohort_name,
              item.year,
            )}
          </p>
          {item.description ? (
            <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
              {item.description}
            </p>
          ) : null}
          {item.zoom_passcode ? (
            <p className="mt-2 break-all font-mono text-xs text-ink/50">
              Passcode {item.zoom_passcode}
            </p>
          ) : null}
          {item.student_checkin_code ? (
            <p className="mt-2 font-mono text-sm tracking-[0.18em] text-pine">
              Check-in code {item.student_checkin_code}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
