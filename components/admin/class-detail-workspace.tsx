"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  assignClassTeacher,
  deleteZoomClass,
  getAdminClassById,
  getClassAttendanceRollup,
  markManualAttendance,
  regenerateClassAttendanceCode,
  setClassCheckinCodeVisibility,
  setClassTeachingDelivery,
  searchClassStudents,
  setZoomClassStatus,
  syncZoomClassAttendance,
  updateClassJoinDetails,
  type ClassActionResult,
} from "@/app/admin/classes/actions";
import { ClassWorkspace } from "@/components/admin/class-workspace";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import type { ClassAttendanceRollup } from "@/lib/admin/class-roll";
import type { ZoomClass } from "@/lib/classes/types";
import {
  TEACHING_DELIVERY_STATUSES,
  TEACHING_DELIVERY_STATUS_META,
  teacherDisplayName,
  type TeacherProfile,
} from "@/lib/teacher/types";

type PendingConfirm =
  | { kind: "delete" }
  | { kind: "regen" }
  | { kind: "markLive" };

type ClassDetailWorkspaceProps = {
  initialClass: ZoomClass;
  initialRollup: ClassAttendanceRollup;
  teachers: Pick<TeacherProfile, "id" | "email" | "full_name">[];
  backHref: string;
  zoomReady: boolean;
  meetingSdkReady: boolean;
};

export function ClassDetailWorkspace({
  initialClass,
  initialRollup,
  teachers,
  backHref,
  zoomReady,
  meetingSdkReady,
}: ClassDetailWorkspaceProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [item, setItem] = useState(initialClass);
  const [rollup, setRollup] = useState(initialRollup);
  const [teacherId, setTeacherId] = useState(
    initialClass.primary_teacher_id ?? "",
  );
  const [notifyTeacher, setNotifyTeacher] = useState(true);
  const [deliveryStatus, setDeliveryStatus] = useState(
    initialClass.teaching_delivery_status ?? "scheduled",
  );
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const busy = pending || Boolean(busyLabel) || refreshing;

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextClass, nextRollup] = await Promise.all([
        getAdminClassById(item.id),
        getClassAttendanceRollup(item.id),
      ]);
      if (nextClass) {
        setItem(nextClass);
        setTeacherId(nextClass.primary_teacher_id ?? "");
        setDeliveryStatus(nextClass.teaching_delivery_status ?? "scheduled");
      }
      if (nextRollup) setRollup(nextRollup);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [item.id, router]);

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

  function run(
    action: () => Promise<ClassActionResult>,
    then?: () => void,
    label = "Working…",
    options?: { skipReload?: boolean },
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          if (options?.skipReload) {
            then?.();
            setPendingConfirm(null);
            success(next.message, "Classes");
            return;
          }
          success(next.message, "Classes");
          setPendingConfirm(null);
          await reload();
        } else {
          error(next.message, "Classes");
        }
      } catch (err) {
        console.error("[class/detail]", err);
        error("Something went wrong. Please try again.", "Classes");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    switch (pendingConfirm.kind) {
      case "delete":
        run(
          () => deleteZoomClass(item.id),
          () => router.replace(backHref),
          "Removing class…",
          { skipReload: true },
        );
        return;
      case "regen":
        run(
          () => regenerateClassAttendanceCode(item.id),
          undefined,
          "Updating check-in code…",
        );
        return;
      case "markLive":
        run(
          () => setZoomClassStatus(item.id, "live"),
          undefined,
          "Updating status…",
        );
    }
  }

  return (
    <div className="space-y-3">
      <Link
        href={backHref}
        className="hidden items-center gap-1.5 text-sm font-medium text-pine lg:inline-flex"
      >
        <span aria-hidden>←</span> Back to Classes
      </Link>

      <section className="relative border border-stone bg-mist/30 p-4 sm:p-5">
        <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Teaching
        </p>
        <h2 className="mt-1 font-display text-lg text-pine">
          Assigned teacher & delivery
        </h2>

        {item.primary_teacher_id && item.primary_teacher_name ? (
          <div className="mt-4 flex items-center gap-4 border border-pine/20 bg-white/70 px-4 py-3.5">
            {item.primary_teacher_avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.primary_teacher_avatar_url}
                alt=""
                className="size-14 shrink-0 rounded-full object-cover ring-2 ring-pine/15"
              />
            ) : (
              <span
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-pine/10 font-display text-lg text-pine"
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
            <div className="min-w-0 flex-1">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Featured teacher
              </p>
              <p className="mt-1 truncate font-display text-xl text-pine">
                {item.primary_teacher_name}
              </p>
              {item.primary_teacher_email ? (
                <p className="mt-0.5 truncate text-sm text-ink/55">
                  {item.primary_teacher_email}
                </p>
              ) : null}
              <p className="mt-1.5 text-xs text-ink/45">
                Delivery ·{" "}
                {TEACHING_DELIVERY_STATUS_META[
                  item.teaching_delivery_status &&
                  item.teaching_delivery_status in TEACHING_DELIVERY_STATUS_META
                    ? (item.teaching_delivery_status as keyof typeof TEACHING_DELIVERY_STATUS_META)
                    : "scheduled"
                ].label}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 border border-dashed border-stone bg-white/40 px-4 py-3.5 text-sm text-ink/55">
            No teacher assigned yet. Choose one below so this class appears on
            their schedule.
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Teacher
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="mt-1.5 w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine"
              disabled={busy}
            >
              <option value="">Needs teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacherDisplayName(teacher)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Delivery status
            <select
              value={deliveryStatus}
              onChange={(e) => setDeliveryStatus(e.target.value)}
              className="mt-1.5 w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine"
              disabled={busy}
            >
              {TEACHING_DELIVERY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TEACHING_DELIVERY_STATUS_META[status].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {teacherId && teacherId !== (item.primary_teacher_id ?? "") ? (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifyTeacher}
              onChange={(e) => setNotifyTeacher(e.target.checked)}
              className="mt-1"
              disabled={busy}
            />
            <span>
              Email the teacher about this class
              <span className="mt-0.5 block text-xs text-ink/50">
                Sends schedule details and a link to their teacher portal.
              </span>
            </span>
          </label>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || teacherId === (item.primary_teacher_id ?? "")}
            onClick={() =>
              run(
                () =>
                  assignClassTeacher({
                    classId: item.id,
                    teacherId: teacherId || null,
                    notify_teacher: Boolean(teacherId) && notifyTeacher,
                  }),
                undefined,
                "Saving teacher…",
              )
            }
            className="border border-pine/30 px-3 py-2 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
          >
            Save teacher
          </button>
          <button
            type="button"
            disabled={
              busy ||
              deliveryStatus === (item.teaching_delivery_status ?? "scheduled")
            }
            onClick={() =>
              run(
                () =>
                  setClassTeachingDelivery({
                    classId: item.id,
                    status: deliveryStatus,
                  }),
                undefined,
                "Updating delivery…",
              )
            }
            className="border border-pine/30 px-3 py-2 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
          >
            Save delivery status
          </button>
        </div>
        <p className="mt-2 text-xs text-ink/50">
          Payable for Finance later: delivered or covered only.
        </p>
      </section>

      <section className="relative border border-stone bg-mist/30">
        <ClassWorkspace
          item={item}
          roster={[]}
          rollup={rollup}
          pending={busy}
          busyLabel={busyLabel}
          refreshing={refreshing}
          zoomReady={zoomReady}
          meetingSdkReady={meetingSdkReady}
          backHref={backHref}
          onRefresh={() => void reload()}
          onSync={() =>
            run(() => syncZoomClassAttendance(item.id), undefined, "Syncing Zoom…")
          }
          onRegenCode={() => {
            if (item.attendance_code) {
              setPendingConfirm({ kind: "regen" });
              return;
            }
            run(
              () => regenerateClassAttendanceCode(item.id),
              undefined,
              "Updating check-in code…",
            );
          }}
          onSetCheckinCodeVisible={(show) =>
            run(
              () => setClassCheckinCodeVisibility(item.id, show),
              undefined,
              show ? "Publishing code…" : "Hiding code…",
            )
          }
          onManual={(userId, present) =>
            run(
              () =>
                markManualAttendance({
                  classId: item.id,
                  userId,
                  present,
                }),
              undefined,
              "Updating attendance…",
            )
          }
          onSearchStudents={(q) => searchClassStudents(item.id, q)}
          onStatus={(status) => {
            if (status === "live") {
              setPendingConfirm({ kind: "markLive" });
              return;
            }
            run(
              () => setZoomClassStatus(item.id, status),
              undefined,
              "Updating status…",
            );
          }}
          onDelete={() => setPendingConfirm({ kind: "delete" })}
          onUpdateJoinLink={(details) =>
            run(
              () => updateClassJoinDetails(item.id, details),
              undefined,
              "Updating join link…",
            )
          }
          onClassZoomUpdated={(zoom) =>
            setItem((prev) => ({
              ...prev,
              zoom_meeting_id: zoom.zoom_meeting_id,
              zoom_meeting_uuid: zoom.zoom_meeting_uuid,
              zoom_join_url: zoom.zoom_join_url,
              zoom_start_url: zoom.zoom_start_url,
              zoom_passcode: zoom.zoom_passcode,
            }))
          }
        />
      </section>

      {pendingConfirm ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="class-confirm-title"
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
                      eyebrow: "Delete class",
                      title: "Remove this class?",
                      body: (
                        <>
                          “{item.title}” and its attendance rows will be
                          permanently deleted
                          {item.zoom_meeting_id
                            ? ", including the scheduled Zoom meeting on the host account"
                            : ""}
                          . This cannot be undone.
                        </>
                      ),
                      confirmLabel: "Delete permanently",
                      destructive: true,
                    }
                  : pendingConfirm.kind === "regen"
                    ? {
                        eyebrow: "Check-in code",
                        title: "Regenerate the check-in code?",
                        body: (
                          <>
                            The current code{" "}
                            <span className="font-mono font-medium text-ink">
                              {item.attendance_code}
                            </span>{" "}
                            will stop working. Anyone still using it will need
                            the new code.
                          </>
                        ),
                        confirmLabel: "Regenerate code",
                        destructive: false,
                      }
                    : {
                        eyebrow: "Class status",
                        title: "Mark this class live?",
                        body: (
                          <>
                            “{item.title}” will show as live for staff and
                            students. You can still sync Zoom and take
                            attendance after.
                          </>
                        ),
                        confirmLabel: "Mark live",
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
                    id="class-confirm-title"
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
