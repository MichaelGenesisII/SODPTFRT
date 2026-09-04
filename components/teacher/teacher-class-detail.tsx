"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  confirmTeacherDelivered,
  markTeacherAttendance,
  type TeacherClassDetail,
  type TeacherRegisterRow,
} from "@/app/teacher/classes/actions";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  audienceLabel,
  classSessionPhase,
  classSessionPhaseLabel,
  formatClassDateTime,
  formatClassScheduleRange,
  formatDurationMinutes,
  type ClassAudience,
} from "@/lib/classes/types";
import {
  TEACHING_DELIVERY_STATUS_META,
  type TeachingDeliveryStatus,
} from "@/lib/teacher/types";

export function TeacherClassDetailClient({
  initial,
}: {
  initial: TeacherClassDetail;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [detail, setDetail] = useState(initial);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [registerQuery, setRegisterQuery] = useState("");
  const [registerTab, setRegisterTab] = useState<"all" | "present" | "absent">(
    "all",
  );
  const [clock, setClock] = useState(() => Date.now());
  const busy = pending || Boolean(busyLabel);

  useEffect(() => {
    setDetail(initial);
  }, [initial]);

  useEffect(() => {
    const tick = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  const deliveryStatus = (detail.delivery?.status ??
    "scheduled") as TeachingDeliveryStatus;
  const statusMeta = TEACHING_DELIVERY_STATUS_META[deliveryStatus];
  const canConfirm =
    deliveryStatus === "scheduled" ||
    (!detail.delivery && Boolean(detail.klass.primary_teacher_id));
  const phase = classSessionPhase(detail.klass, new Date(clock));
  const phaseLabel = classSessionPhaseLabel(phase);
  const audience = audienceLabel(
    (detail.klass.audience as ClassAudience) || "everyone",
    detail.klass.parish_name,
    detail.klass.batch_name,
    detail.klass.cohort_name,
    detail.klass.year,
  );

  const presentCount = detail.register.attended.length;
  const absentCount = detail.register.absent.length;
  const expected = detail.register.expected_total;
  const presentPct =
    expected > 0 ? Math.round((presentCount / expected) * 100) : 0;

  const filteredRows = useMemo(() => {
    const q = registerQuery.trim().toLowerCase();
    const match = (row: TeacherRegisterRow) =>
      !q || row.name.toLowerCase().includes(q);

    if (registerTab === "present") {
      return detail.register.attended.filter(match);
    }
    if (registerTab === "absent") {
      return detail.register.absent.filter(match);
    }
    return [
      ...detail.register.attended.filter(match),
      ...detail.register.absent.filter(match),
    ].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [detail.register, registerQuery, registerTab]);

  function run(
    action: () => Promise<{ ok: boolean; message: string }>,
    label: string,
    onOk?: () => void,
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          success(result.message, "Classes");
          onOk?.();
          router.refresh();
        } else {
          error(result.message, "Classes");
        }
      } catch {
        error("Something went wrong. Please try again.", "Classes");
      } finally {
        setBusyLabel(null);
        setConfirmOpen(false);
      }
    });
  }

  function toggleAttendance(userId: string, present: boolean) {
    run(
      async () => {
        const result = await markTeacherAttendance({
          classId: detail.klass.id,
          userId,
          present,
        });
        if (result.ok) {
          setDetail((prev) => {
            const row = [
              ...prev.register.attended,
              ...prev.register.absent,
            ].find((r) => r.user_id === userId);
            if (!row) return prev;
            const nextRow = { ...row, present, source: "manual" as const };
            const attended = prev.register.attended.filter(
              (r) => r.user_id !== userId,
            );
            const absent = prev.register.absent.filter(
              (r) => r.user_id !== userId,
            );
            if (present) attended.push(nextRow);
            else absent.push(nextRow);
            attended.sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
            );
            absent.sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
            );
            return {
              ...prev,
              register: { ...prev.register, attended, absent },
            };
          });
        }
        return result;
      },
      present ? "Marking present…" : "Marking absent…",
    );
  }

  return (
    <div className="relative space-y-6">
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />

      <div>
        <Link
          href="/teacher/classes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-pine"
        >
          <span aria-hidden>←</span> Classes
        </Link>
      </div>

      <section className="relative overflow-hidden border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.14),_transparent_55%)]"
          aria-hidden
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Class file
            </p>
            <span className="border border-stone px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/50">
              {phaseLabel}
            </span>
            <span className="border border-pine/25 bg-pine/[0.04] px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-pine">
              {statusMeta?.label ?? deliveryStatus}
            </span>
          </div>
          <h1 className="mt-2 font-display text-[clamp(1.55rem,4.5vw,2.25rem)] tracking-[-0.02em] text-pine">
            {detail.klass.title}
          </h1>
          {detail.klass.description?.trim() ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/65">
              {detail.klass.description.trim()}
            </p>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="border border-stone/80 bg-white/70 px-3.5 py-3">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                Schedule
              </p>
              <p className="mt-1.5 text-sm font-medium text-ink">
                {formatClassScheduleRange(
                  detail.klass.scheduled_start,
                  detail.klass.scheduled_end,
                )}
              </p>
              <p className="mt-1 text-xs text-ink/50">
                Starts {formatClassDateTime(detail.klass.scheduled_start)}
                {" · "}
                {formatDurationMinutes(detail.klass.duration_minutes)} planned
              </p>
            </div>
            <div className="border border-stone/80 bg-white/70 px-3.5 py-3">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                Audience
              </p>
              <p className="mt-1.5 text-sm font-medium text-ink">{audience}</p>
              {detail.klass.programme_month != null ? (
                <p className="mt-1 text-xs text-ink/50">
                  Programme month {detail.klass.programme_month}
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink/50">
                  Attendance register for this session
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {(detail.klass.zoom_join_url ||
        detail.klass.zoom_passcode ||
        detail.klass.attendance_code) && (
        <section className="border border-stone/80 bg-white/55 px-5 py-5 sm:px-6">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Session tools
          </p>
          <h2 className="mt-1 font-display text-lg text-pine">Join & check-in</h2>
          <div className="mt-4 space-y-3">
            {detail.klass.zoom_join_url ? (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={detail.klass.zoom_join_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
                >
                  Open Zoom join link
                </a>
                {detail.klass.zoom_passcode ? (
                  <span className="border border-stone bg-mist/60 px-3 py-2 text-sm text-ink/70">
                    Passcode{" "}
                    <span className="font-mono font-medium text-pine">
                      {detail.klass.zoom_passcode}
                    </span>
                  </span>
                ) : null}
              </div>
            ) : null}
            {detail.klass.attendance_code ? (
              <div className="border border-pine/20 bg-pine/[0.04] px-3.5 py-3">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Check-in code
                </p>
                <p className="mt-1.5 font-mono text-2xl tracking-[0.12em] text-pine">
                  {detail.klass.attendance_code}
                </p>
                <p className="mt-1 text-xs text-ink/50">
                  Students can use this code on the portal when the desk has
                  published it.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {canConfirm ? (
        <section className="border border-pine/25 bg-pine/[0.04] px-5 py-5 sm:px-6">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Delivery
          </p>
          <h2 className="mt-1 font-display text-lg text-pine">
            Confirm you taught this class
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
            Mark the session when teaching is complete. Pay stays with the
            national desk — you will not see amounts here.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
            className="mt-4 inline-flex min-h-11 items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
          >
            I taught this class
          </button>
        </section>
      ) : deliveryStatus === "delivered" || deliveryStatus === "covered" ? (
        <section className="border border-stone/80 bg-white/55 px-5 py-4 sm:px-6">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Delivery
          </p>
          <p className="mt-1 font-display text-lg text-pine">
            Marked as {statusMeta.label.toLowerCase()}
          </p>
          <p className="mt-1 text-sm text-ink/55">
            Thank you. The desk can see this confirmation on the class file.
          </p>
        </section>
      ) : deliveryStatus === "cancelled" || deliveryStatus === "no_show" ? (
        <section className="border border-stone/80 bg-white/50 px-5 py-4 text-sm text-ink/60 sm:px-6">
          This class was closed by the desk as{" "}
          <span className="font-medium text-ink">{statusMeta.label}</span>.
        </section>
      ) : null}

      <section className="border border-stone/80 bg-white/55 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Register
            </p>
            <h2 className="mt-1 font-display text-xl text-pine">Attendance</h2>
            <p className="mt-1 text-sm text-ink/55">
              Names only — mark present or absent for this session.
            </p>
          </div>
          <p className="text-sm tabular-nums text-ink/50">
            {presentCount} present · {absentCount} absent · {expected} expected
          </p>
        </div>

        <div className="mt-4 h-2 overflow-hidden bg-stone/60">
          <div
            className="h-full bg-pine transition-[width] duration-300"
            style={{ width: `${presentPct}%` }}
            aria-hidden
          />
        </div>
        <p className="mt-1.5 text-xs tabular-nums text-ink/45">
          {presentPct}% marked present
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search register</span>
            <input
              type="search"
              value={registerQuery}
              onChange={(e) => setRegisterQuery(e.target.value)}
              placeholder="Search by name…"
              className="w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine"
            />
          </label>
          <div className="flex shrink-0 gap-1 border border-stone bg-mist/40 p-1">
            {(
              [
                { id: "all" as const, label: "All" },
                { id: "present" as const, label: "Present" },
                { id: "absent" as const, label: "Absent" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRegisterTab(tab.id)}
                className={`px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] transition-colors ${
                  registerTab === tab.id
                    ? "bg-pine text-mist"
                    : "text-ink/55 hover:text-pine"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 border border-stone/80 bg-white/70">
          {filteredRows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink/45">
              {expected === 0
                ? "No students on this register yet."
                : registerQuery.trim()
                  ? "No names match your search."
                  : registerTab === "present"
                    ? "Nobody marked present yet."
                    : registerTab === "absent"
                      ? "Nobody marked absent."
                      : "Register is empty."}
            </p>
          ) : (
            <ul className="divide-y divide-stone">
              {filteredRows.map((row) => (
                <li
                  key={row.user_id}
                  className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {row.name}
                    </p>
                    <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.1em] text-ink/40">
                      {row.present ? "Present" : "Absent"}
                      {row.source ? ` · ${sourceLabel(row.source)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleAttendance(row.user_id, !row.present)}
                    className={`shrink-0 border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                      row.present
                        ? "border-stone text-ink/55 hover:border-ink/40 hover:text-ink"
                        : "border-pine/30 text-pine hover:border-pine hover:bg-pine/[0.04]"
                    }`}
                  >
                    {row.present ? "Mark absent" : "Mark present"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <DeskConfirmModal
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={() =>
          run(
            () => confirmTeacherDelivered(detail.klass.id),
            "Confirming…",
            () => {
              const now = new Date().toISOString();
              setDetail((prev) => ({
                ...prev,
                delivery: {
                  id: prev.delivery?.id ?? "local",
                  class_id: prev.klass.id,
                  teacher_id: prev.klass.primary_teacher_id ?? "",
                  status: "delivered",
                  confirmed_at: now,
                  confirmed_by: prev.klass.primary_teacher_id ?? null,
                  notes: prev.delivery?.notes ?? null,
                  created_at: prev.delivery?.created_at ?? now,
                  updated_at: now,
                },
              }));
            },
          )
        }
        eyebrow="Teaching"
        title="Confirm you taught this class?"
        body="This records delivery for the national desk. You will not see pay amounts here."
        confirmLabel="Confirm taught"
        busy={busy}
        busyLabel={busyLabel ?? "Working…"}
      />
    </div>
  );
}

function sourceLabel(source: string): string {
  if (source === "zoom") return "Zoom";
  if (source === "code") return "Code";
  if (source === "manual") return "Manual";
  return source;
}
