"use client";

import { useCallback, useState, useTransition } from "react";
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
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import type { ClassAttendanceRollup } from "@/lib/admin/class-roll";
import type { ZoomClass } from "@/lib/classes/types";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";
import {
  TEACHING_DELIVERY_STATUSES,
  TEACHING_DELIVERY_STATUS_META,
  teacherDisplayName,
  type TeacherProfile,
} from "@/lib/teacher/types";

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

  function run(
    action: () => Promise<ClassActionResult>,
    then?: () => void,
    label = "Working…",
    options?: { skipReload?: boolean; quiet?: boolean },
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          if (!options?.quiet) {
            await deskSuccess({ text: next.message });
          }
          if (options?.skipReload) {
            then?.();
            return;
          }
          then?.();
          await reload();
        } else {
          await deskError({ text: next.message });
        }
      } catch (err) {
        console.error("[class/detail]", err);
        await deskError({ text: "Something went wrong. Please try again." });
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function requestDelete() {
    if (busy) return;
    const ok = await deskConfirm({
      title: "Remove this class?",
      text: `“${item.title}” and its attendance rows will be permanently deleted${
        item.zoom_meeting_id
          ? ", including the scheduled Zoom meeting on the host account"
          : ""
      }. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    run(
      () => deleteZoomClass(item.id),
      () => router.replace(backHref),
      "Removing class…",
      { skipReload: true, quiet: true },
    );
  }

  async function requestRegenCode() {
    if (busy) return;
    if (item.attendance_code) {
      const ok = await deskConfirm({
        title: "Regenerate the check-in code?",
        text: `The current code ${item.attendance_code} will stop working. Anyone still using it will need the new code.`,
        confirmLabel: "Regenerate code",
      });
      if (!ok) return;
    }
    run(
      () => regenerateClassAttendanceCode(item.id),
      undefined,
      "Updating check-in code…",
    );
  }

  async function requestMarkLive() {
    if (busy) return;
    const ok = await deskConfirm({
      title: "Mark this class live?",
      text: `“${item.title}” will show as live for staff and students. You can still sync Zoom and take attendance after.`,
      confirmLabel: "Mark live",
    });
    if (!ok) return;
    run(() => setZoomClassStatus(item.id, "live"), undefined, "Updating status…");
  }

  async function requestConfirmTaught() {
    if (busy) return;
    const ok = await deskConfirm({
      title: "Confirm this class was taught?",
      text: `This marks the class as taught for ${
        item.primary_teacher_name ?? "the assigned teacher"
      }. It updates their teaching record and counts for Finance.`,
      confirmLabel: "Confirm taught",
    });
    if (!ok) return;
    run(
      () =>
        setClassTeachingDelivery({
          classId: item.id,
          status: "delivered",
        }),
      () => setDeliveryStatus("delivered"),
      "Confirming taught…",
    );
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
              !item.primary_teacher_id ||
              (item.teaching_delivery_status ?? "scheduled") === "delivered" ||
              (item.teaching_delivery_status ?? "scheduled") === "covered"
            }
            onClick={() => void requestConfirmTaught()}
            className="bg-pine px-3 py-2 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-50"
          >
            Confirm taught
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
          Only the desk confirms taught. Finance counts delivered or covered
          classes.
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
          onRegenCode={() => void requestRegenCode()}
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
              { quiet: true },
            )
          }
          onSearchStudents={(q) => searchClassStudents(item.id, q)}
          onStatus={(status) => {
            if (status === "live") {
              void requestMarkLive();
              return;
            }
            run(
              () => setZoomClassStatus(item.id, status),
              undefined,
              "Updating status…",
            );
          }}
          onDelete={() => void requestDelete()}
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
    </div>
  );
}
