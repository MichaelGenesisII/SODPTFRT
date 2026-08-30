"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteZoomClass,
  getAdminClassById,
  getClassAttendanceRollup,
  markManualAttendance,
  regenerateClassAttendanceCode,
  setClassCheckinCodeVisibility,
  searchClassStudents,
  setZoomClassStatus,
  syncZoomClassAttendance,
  type ClassActionResult,
} from "@/app/admin/classes/actions";
import { ClassWorkspace } from "@/components/admin/class-workspace";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import type { ClassAttendanceRollup } from "@/lib/admin/class-roll";
import type { ZoomClass } from "@/lib/classes/types";

type PendingConfirm =
  | { kind: "delete" }
  | { kind: "regen" }
  | { kind: "markLive" };

type ClassDetailWorkspaceProps = {
  initialClass: ZoomClass;
  initialRollup: ClassAttendanceRollup;
  backHref: string;
  zoomReady: boolean;
  meetingSdkReady: boolean;
};

export function ClassDetailWorkspace({
  initialClass,
  initialRollup,
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
      if (nextClass) setItem(nextClass);
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
          // Navigate away before closing modal so delete never leaves the
          // details desk stuck on a removed class.
          if (options?.skipReload) then?.();
          success(next.message, "Classes");
          setPendingConfirm(null);
          if (!options?.skipReload) await reload();
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
