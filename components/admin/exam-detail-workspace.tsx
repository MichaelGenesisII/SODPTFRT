"use client";

import { useCallback, useState, useTransition } from "react";
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
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import type { AdminProfile } from "@/lib/admin/profile";
import {
  type Exam,
  type ExamAudience,
  type ExamQuestion,
} from "@/lib/exams/types";
import type { Batch, Parish } from "@/lib/parishes";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";

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
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState(initialDetail);
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

  function run(
    action: () => Promise<ExamActionResult>,
    options?: {
      then?: () => void;
      label?: string;
      quiet?: boolean;
      skipReload?: boolean;
    },
  ) {
    setBusyLabel(options?.label ?? "Working…");
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          if (!options?.quiet) await deskSuccess({ text: next.message });
          options?.then?.();
          if (!options?.skipReload) await reload();
        } else {
          await deskError({ text: next.message });
        }
      } catch (err) {
        console.error("[exam/detail]", err);
        await deskError({
          text: "Something went wrong. Please try again.",
        });
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
      () => undefined,
      async () => {
        await deskError({
          text: "Clipboard is unavailable in this browser.",
        });
      },
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
          await deskSuccess({ text: next.message });
          await reload();
        } else {
          await deskError({ text: next.message });
        }
      } catch (err) {
        console.error("[exam/detail/import]", err);
        await deskError({
          text: "Something went wrong. Please try again.",
        });
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function requestStatus(status: "published" | "closed" | "draft") {
    if (busy) return;
    if (status === "published") {
      const ok = await deskConfirm({
        title: "Publish this exam?",
        text: `“${detail.exam.title}” will become available to its audience. Students (or open link visitors) can start taking it.`,
        confirmLabel: "Publish",
      });
      if (!ok) return;
      run(() => setExamStatus(detail.exam.id, "published"), {
        label: "Publishing…",
      });
      return;
    }
    if (status === "closed") {
      const ok = await deskConfirm({
        title: "Close this exam?",
        text: `“${detail.exam.title}” will stop accepting new attempts. Existing work stays on file.`,
        confirmLabel: "Close exam",
      });
      if (!ok) return;
      run(() => setExamStatus(detail.exam.id, "closed"), {
        label: "Closing…",
      });
      return;
    }
    const ok = await deskConfirm({
      title: "Move this exam back to draft?",
      text: `“${detail.exam.title}” will no longer be available to take until you publish again.`,
      confirmLabel: "Move to draft",
    });
    if (!ok) return;
    run(() => setExamStatus(detail.exam.id, "draft"), {
      label: "Updating status…",
    });
  }

  async function requestDelete() {
    if (busy) return;
    const ok = await deskConfirm({
      title: "Delete this exam?",
      text: `“${detail.exam.title}” and all attempts will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    run(() => deleteExam(detail.exam.id), {
      label: "Deleting exam…",
      then: () => router.push(backHref),
      skipReload: true,
    });
  }

  async function requestDeleteQuestion(id: string) {
    if (busy) return;
    const question = detail.questions.find((q) => q.id === id);
    const prompt = question?.prompt ?? "";
    const preview =
      prompt.length > 120 ? `${prompt.slice(0, 120)}…` : prompt;
    const ok = await deskConfirm({
      title: "Remove this question?",
      text: preview
        ? `This removes “${preview}” from the bank. Existing attempts that already include it are not rewritten.`
        : "This removes the question from the bank. Existing attempts that already include it are not rewritten.",
      confirmLabel: "Remove question",
      danger: true,
    });
    if (!ok) return;
    run(() => deleteQuestion(id, detail.exam.id), {
      label: "Removing question…",
      quiet: true,
    });
  }

  async function requestImport(file: File) {
    if (busy) return;
    if (detail.questions.length > 0) {
      const ok = await deskConfirm({
        title: "Append imported questions?",
        text: `This exam already has ${detail.questions.length} question${
          detail.questions.length === 1 ? "" : "s"
        }. Importing ${file.name} will add more to the bank (it does not replace existing ones).`,
        confirmLabel: "Import and append",
      });
      if (!ok) return;
    }
    startImport(file);
  }

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
          active={busy && !refreshing}
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
            run(() => updateExamMeta(detail.exam.id, values), {
              label: "Saving details…",
            })
          }
          onStatus={(status) => {
            if (
              status === "published" ||
              status === "closed" ||
              status === "draft"
            ) {
              void requestStatus(status);
              return;
            }
            run(() => setExamStatus(detail.exam.id, status), {
              label: "Updating status…",
            });
          }}
          onDelete={() => void requestDelete()}
          onCopyLink={() => copyLink(detail.exam.slug, detail.exam.audience)}
          onImport={(file) => void requestImport(file)}
          onUpsertQuestion={(payload) =>
            run(
              () => upsertQuestion({ ...payload, exam_id: detail.exam.id }),
              {
                label: "Saving question…",
                quiet: true,
              },
            )
          }
          onDeleteQuestion={(id) => void requestDeleteQuestion(id)}
        />
      </section>
    </div>
  );
}
