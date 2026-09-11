"use client";

import { useCallback, useState, useTransition } from "react";
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
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import type { RecordBundle } from "@/lib/exams/records";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";

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
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bundle, setBundle] = useState(initialBundle);
  const busy = pending || Boolean(busyLabel) || refreshing;

  const studentName =
    bundle.record.student_name?.trim() ||
    bundle.record.student_email?.trim() ||
    "this student";

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

  function run(
    action: () => Promise<RecordActionResult>,
    label: string,
    options?: { refresh?: boolean; announce?: boolean },
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          if (options?.announce) {
            await deskSuccess({ text: next.message });
          }
          if (options?.refresh !== false) {
            await reload();
          }
        } else {
          await deskError({ text: next.message });
        }
      } catch (err) {
        console.error("[record/detail]", err);
        await deskError({
          text: "Something went wrong. Please try again.",
        });
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function requestEmailScorecard() {
    if (busy) return;
    const email = bundle.record.student_email?.trim();
    if (!email) {
      await deskError({
        text: "This student has no email on their profile.",
      });
      return;
    }
    const ok = await deskConfirm({
      title: "Send the formal scorecard?",
      text: `Only ${studentName} (${email}) will receive it. Delivery uses the portal email service.`,
      confirmLabel: "Send email",
    });
    if (!ok) return;
    run(() => emailStudentScorecard(recordId), "Emailing scorecard…", {
      refresh: false,
      announce: true,
    });
  }

  async function requestDeleteSession(id: string) {
    if (busy) return;
    const session = bundle.sessions.find((s) => s.id === id);
    const label = session?.label || session?.session_date || "this session";
    const ok = await deskConfirm({
      title: "Remove this attendance session?",
      text: `“${label}” will be deleted from ${studentName}’s scorecard. This cannot be undone.`,
      confirmLabel: "Remove session",
      danger: true,
    });
    if (!ok) return;
    run(() => deleteAttendanceSession(id), "Removing session…", {
      announce: true,
    });
  }

  async function requestDeleteEntry(id: string) {
    if (busy) return;
    const entry = bundle.entries.find((e) => e.id === id);
    const label = entry?.label || "this score";
    const ok = await deskConfirm({
      title: "Remove this exam score?",
      text: `“${label}” will be deleted from ${studentName}’s scorecard. This cannot be undone.`,
      confirmLabel: "Remove score",
      danger: true,
    });
    if (!ok) return;
    run(() => deleteRecordEntry(id), "Removing score…", { announce: true });
  }

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
          active={busy && !refreshing}
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
          onEmailScorecard={() => void requestEmailScorecard()}
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
          onDeleteSession={(id) => void requestDeleteSession(id)}
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
          onDeleteEntry={(id) => void requestDeleteEntry(id)}
        />
      </section>
    </div>
  );
}
