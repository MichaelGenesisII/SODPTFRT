"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addManualEntry,
  deleteAttendanceSession,
  deleteRecordEntry,
  emailStudentScorecard,
  getRecordBundle,
  setEntryInclude,
  updateScorecardDates,
  upsertAttendanceSession,
  type RecordActionResult,
} from "@/app/admin/records/actions";
import { RecordScorecard } from "@/components/admin/record-workspace";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import type { RecordBundle } from "@/lib/exams/records";

type PendingConfirm =
  | { kind: "email"; email: string }
  | { kind: "deleteSession"; id: string; label: string }
  | { kind: "deleteEntry"; id: string; label: string };

type RecordDetailWorkspaceProps = {
  initialBundle: RecordBundle;
  recordId: string;
  backHref: string;
};

export function RecordDetailWorkspace({
  initialBundle,
  recordId,
  backHref,
}: RecordDetailWorkspaceProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bundle, setBundle] = useState(initialBundle);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const busy = pending || Boolean(busyLabel) || refreshing;

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await getRecordBundle(recordId);
      if (next) setBundle(next);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [recordId, router]);

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
    action: () => Promise<RecordActionResult>,
    label: string,
    options?: { refresh?: boolean },
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          success(next.message, "Records");
          setPendingConfirm(null);
          if (options?.refresh !== false) {
            await reload();
          }
        } else {
          error(next.message, "Records");
        }
      } catch (err) {
        console.error("[record/detail]", err);
        error("Something went wrong. Please try again.", "Records");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    switch (pendingConfirm.kind) {
      case "email":
        run(() => emailStudentScorecard(recordId), "Emailing scorecard…", {
          refresh: false,
        });
        return;
      case "deleteSession":
        run(
          () => deleteAttendanceSession(pendingConfirm.id),
          "Removing session…",
        );
        return;
      case "deleteEntry":
        run(() => deleteRecordEntry(pendingConfirm.id), "Removing score…");
    }
  }

  const studentName =
    bundle.record.student_name?.trim() ||
    bundle.record.student_email?.trim() ||
    "this student";

  const confirmCopy = (() => {
    if (!pendingConfirm) return null;
    switch (pendingConfirm.kind) {
      case "email":
        return {
          eyebrow: "Email scorecard",
          title: "Send the formal scorecard?",
          body: (
            <>
              Only{" "}
              <span className="font-medium text-ink">{studentName}</span> (
              {pendingConfirm.email}) will receive it. Delivery uses the portal
              email service.
            </>
          ),
          confirmLabel: "Send email",
          destructive: false,
        };
      case "deleteSession":
        return {
          eyebrow: "Remove session",
          title: "Remove this attendance session?",
          body: (
            <>
              “{pendingConfirm.label}” will be deleted from{" "}
              <span className="font-medium text-ink">{studentName}</span>’s
              scorecard. This cannot be undone.
            </>
          ),
          confirmLabel: "Remove session",
          destructive: true,
        };
      case "deleteEntry":
        return {
          eyebrow: "Remove score",
          title: "Remove this exam score?",
          body: (
            <>
              “{pendingConfirm.label}” will be deleted from{" "}
              <span className="font-medium text-ink">{studentName}</span>’s
              scorecard. This cannot be undone.
            </>
          ),
          confirmLabel: "Remove score",
          destructive: true,
        };
    }
  })();

  return (
    <div className="space-y-3">
      <Link
        href={backHref}
        className="hidden items-center gap-1.5 text-sm font-medium text-pine lg:inline-flex"
      >
        <span aria-hidden>←</span> Back to Records
      </Link>

      <section className="relative border border-stone bg-mist/30">
        <DeskLoaderOverlay
          active={busy && !pendingConfirm && !refreshing}
          label={busyLabel ?? "Working…"}
        />
        <RecordScorecard
          bundle={bundle}
          pending={busy}
          busyLabel={busyLabel}
          refreshing={refreshing}
          backHref={backHref}
          onBusyLabel={setBusyLabel}
          onRefresh={() => void reload()}
          onEmailScorecard={() => {
            const email = bundle.record.student_email?.trim();
            if (!email) {
              error("This student has no email on their profile.", "Records");
              return;
            }
            setPendingConfirm({ kind: "email", email });
          }}
          onSaveDates={(dates) =>
            run(
              () =>
                updateScorecardDates({
                  recordId,
                  ...dates,
                }),
              "Saving dates…",
            )
          }
          onAttendance={(input) =>
            run(
              () =>
                upsertAttendanceSession({
                  recordId,
                  ...input,
                }),
              "Updating attendance…",
            )
          }
          onDeleteSession={(id) => {
            const session = bundle.sessions.find((s) => s.id === id);
            setPendingConfirm({
              kind: "deleteSession",
              id,
              label: session?.label || session?.session_date || "this session",
            });
          }}
          onAddEntry={(input) =>
            run(
              () =>
                addManualEntry({
                  recordId,
                  ...input,
                }),
              "Adding score…",
            )
          }
          onToggleInclude={(id, include) =>
            run(() => setEntryInclude(id, include), "Updating score…")
          }
          onDeleteEntry={(id) => {
            const entry = bundle.entries.find((e) => e.id === id);
            setPendingConfirm({
              kind: "deleteEntry",
              id,
              label: entry?.label || "this score",
            });
          }}
        />
      </section>

      {pendingConfirm && confirmCopy ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-confirm-title"
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
              id="record-confirm-title"
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
