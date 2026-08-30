"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteExam,
  deleteQuestion,
  getAdminExam,
  importQuestionsToExam,
  setExamStatus,
  updateExamMeta,
  upsertQuestion,
  type ExamActionResult,
} from "@/app/admin/exams/actions";
import {
  ExamWorkspace,
  type ExamMetaValues,
} from "@/components/admin/exam-workspace";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import type { AdminProfile } from "@/lib/admin/profile";
import {
  type Exam,
  type ExamAudience,
  type ExamQuestion,
} from "@/lib/exams/types";
import type { Batch, Parish } from "@/lib/parishes";

type PendingConfirm =
  | { kind: "delete" }
  | { kind: "deleteQuestion"; id: string; prompt: string }
  | { kind: "publish" }
  | { kind: "close" }
  | { kind: "draft" }
  | { kind: "import"; file: File };

type ExamDetailWorkspaceProps = {
  initialDetail: { exam: Exam; questions: ExamQuestion[] };
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name" | "region">[];
  batches: Batch[];
  backHref: string;
};

export function ExamDetailWorkspace({
  initialDetail,
  profile,
  parishes,
  batches,
  backHref,
}: ExamDetailWorkspaceProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState(initialDetail);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const busy = pending || Boolean(busyLabel) || refreshing;

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await getAdminExam(detail.exam.id);
      if (next) setDetail(next);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [detail.exam.id, router]);

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
    action: () => Promise<ExamActionResult>,
    then?: () => void,
    label = "Working…",
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          success(next.message, "Exams");
          setPendingConfirm(null);
          then?.();
          await reload();
        } else {
          error(next.message, "Exams");
        }
      } catch (err) {
        console.error("[exam/detail]", err);
        error("Something went wrong. Please try again.", "Exams");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function copyLink(slug: string, audience: ExamAudience) {
    const path =
      audience === "open" ? `/exam/${slug}` : `/student/exams/${slug}`;
    const url = `${window.location.origin}${path}`;
    void navigator.clipboard.writeText(url).then(
      () => success("Link copied.", "Exams"),
      () => error("Could not copy link.", "Exams"),
    );
  }

  function startImport(file: File) {
    const bufPromise = file.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      let binary = "";
      bytes.forEach((b) => {
        binary += String.fromCharCode(b);
      });
      return btoa(binary);
    });

    setBusyLabel("Importing questions…");
    startTransition(async () => {
      try {
        const base64 = await bufPromise;
        const next = await importQuestionsToExam(
          detail.exam.id,
          file.name,
          base64,
        );
        if (next.ok) {
          success(next.message, "Exams");
          setPendingConfirm(null);
          await reload();
        } else {
          error(next.message, "Exams");
        }
      } catch (err) {
        console.error("[exam/detail/import]", err);
        error("Something went wrong. Please try again.", "Exams");
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
          () => deleteExam(detail.exam.id),
          () => router.push(backHref),
          "Deleting exam…",
        );
        return;
      case "deleteQuestion":
        run(
          () => deleteQuestion(pendingConfirm.id, detail.exam.id),
          undefined,
          "Removing question…",
        );
        return;
      case "publish":
        run(
          () => setExamStatus(detail.exam.id, "published"),
          undefined,
          "Publishing…",
        );
        return;
      case "close":
        run(
          () => setExamStatus(detail.exam.id, "closed"),
          undefined,
          "Closing…",
        );
        return;
      case "draft":
        run(
          () => setExamStatus(detail.exam.id, "draft"),
          undefined,
          "Updating status…",
        );
        return;
      case "import":
        startImport(pendingConfirm.file);
    }
  }

  const confirmCopy = (() => {
    if (!pendingConfirm) return null;
    switch (pendingConfirm.kind) {
      case "delete":
        return {
          eyebrow: "Delete exam",
          title: "Delete this exam?",
          body: (
            <>
              “{detail.exam.title}” and all attempts will be permanently
              deleted. This cannot be undone.
            </>
          ),
          confirmLabel: "Delete permanently",
          destructive: true,
        };
      case "deleteQuestion": {
        const preview =
          pendingConfirm.prompt.length > 120
            ? `${pendingConfirm.prompt.slice(0, 120)}…`
            : pendingConfirm.prompt;
        return {
          eyebrow: "Remove question",
          title: "Remove this question?",
          body: (
            <>
              This removes the question from the bank
              {preview ? (
                <>
                  :{" "}
                  <span className="font-medium text-ink">“{preview}”</span>
                </>
              ) : null}
              . Existing attempts that already include it are not rewritten.
            </>
          ),
          confirmLabel: "Remove question",
          destructive: true,
        };
      }
      case "publish":
        return {
          eyebrow: "Publish exam",
          title: "Publish this exam?",
          body: (
            <>
              “{detail.exam.title}” will become available to its audience.
              Students (or open link visitors) can start taking it.
            </>
          ),
          confirmLabel: "Publish",
          destructive: false,
        };
      case "close":
        return {
          eyebrow: "Close exam",
          title: "Close this exam?",
          body: (
            <>
              “{detail.exam.title}” will stop accepting new attempts. Existing
              work stays on file.
            </>
          ),
          confirmLabel: "Close exam",
          destructive: false,
        };
      case "draft":
        return {
          eyebrow: "Return to draft",
          title: "Move this exam back to draft?",
          body: (
            <>
              “{detail.exam.title}” will no longer be available to take until you
              publish again.
            </>
          ),
          confirmLabel: "Move to draft",
          destructive: false,
        };
      case "import":
        return {
          eyebrow: "Import questions",
          title: "Append imported questions?",
          body: (
            <>
              This exam already has {detail.questions.length} question
              {detail.questions.length === 1 ? "" : "s"}. Importing{" "}
              <span className="font-medium text-ink">
                {pendingConfirm.file.name}
              </span>{" "}
              will add more to the bank (it does not replace existing ones).
            </>
          ),
          confirmLabel: "Import and append",
          destructive: false,
        };
    }
  })();

  return (
    <div className="space-y-3">
      <Link
        href={backHref}
        className="hidden items-center gap-1.5 text-sm font-medium text-pine lg:inline-flex"
      >
        <span aria-hidden>←</span> Back to Exams
      </Link>

      <section className="relative border border-stone bg-mist/30">
        <DeskLoaderOverlay
          active={busy && !pendingConfirm && !refreshing}
          label={busyLabel ?? "Working…"}
        />
        <ExamWorkspace
          detail={detail}
          profile={profile}
          parishes={parishes}
          batches={batches}
          pending={busy}
          busyLabel={busyLabel}
          refreshing={refreshing}
          backHref={backHref}
          onRefresh={() => void reload()}
          onSaveMeta={(values: ExamMetaValues) =>
            run(
              () => updateExamMeta(detail.exam.id, values),
              undefined,
              "Saving details…",
            )
          }
          onStatus={(status) => {
            if (status === "published") {
              setPendingConfirm({ kind: "publish" });
              return;
            }
            if (status === "closed") {
              setPendingConfirm({ kind: "close" });
              return;
            }
            if (status === "draft") {
              setPendingConfirm({ kind: "draft" });
              return;
            }
            run(
              () => setExamStatus(detail.exam.id, status),
              undefined,
              "Updating status…",
            );
          }}
          onDelete={() => setPendingConfirm({ kind: "delete" })}
          onCopyLink={() => copyLink(detail.exam.slug, detail.exam.audience)}
          onImport={(file) => {
            if (detail.questions.length > 0) {
              setPendingConfirm({ kind: "import", file });
              return;
            }
            startImport(file);
          }}
          onUpsertQuestion={(payload) =>
            run(
              () => upsertQuestion({ ...payload, exam_id: detail.exam.id }),
              undefined,
              "Saving question…",
            )
          }
          onDeleteQuestion={(id) => {
            const question = detail.questions.find((q) => q.id === id);
            setPendingConfirm({
              kind: "deleteQuestion",
              id,
              prompt: question?.prompt ?? "",
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
            aria-labelledby="exam-confirm-title"
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
              id="exam-confirm-title"
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
