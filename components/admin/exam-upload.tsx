"use client";

import { useRef, useState, useTransition } from "react";
import {
  createExamFromQuestionFile,
  importQuestionsToExam,
  type ExamActionResult,
} from "@/app/admin/exams/actions";
import { useToast } from "@/components/ui/toast";
import type { Exam } from "@/lib/exams/types";

type Props = {
  exams: Exam[];
  onOpenedExam: (examId: string) => void;
  onOpenSamples?: () => void;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file."));
        return;
      }
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export function ExamUpload({ exams, onOpenedExam, onOpenSamples }: Props) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [targetExamId, setTargetExamId] = useState<string>("");
  const [examTitle, setExamTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const drafts = exams.filter((e) => e.status === "draft");

  function run(
    action: () => Promise<ExamActionResult & { imported?: number }>,
  ) {
    startTransition(async () => {
      const next = await action();
      if (next.ok) {
        success(next.message, "Exams");
        if (next.examId) onOpenedExam(next.examId);
      } else {
        error(next.message, "Exams");
      }
    });
  }

  async function handleFiles(files: FileList | File[] | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      if (targetExamId) {
        run(() => importQuestionsToExam(targetExamId, file.name, base64));
      } else {
        run(() =>
          createExamFromQuestionFile(file.name, base64, {
            title: examTitle.trim() || undefined,
          }),
        );
      }
    } catch (e) {
      error(e instanceof Error ? e.message : "Could not read file.", "Exams");
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="border border-stone bg-mist">
        <div className="border-b border-stone px-3 py-4 sm:px-5">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
            Bring it back
          </p>
          <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
            Upload paper
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
            Drop a completed spreadsheet, CSV, JSON, or text file. We parse
            questions and answers into a draft exam — the file is never stored.
            Need a starter?{" "}
            {onOpenSamples ? (
              <button
                type="button"
                onClick={onOpenSamples}
                className="font-medium text-pine underline"
              >
                Download from Samples
              </button>
            ) : (
              "Open Samples"
            )}
            .
          </p>
        </div>

        <div className="grid gap-4 px-3 py-4 sm:grid-cols-[1fr_minmax(0,18rem)] sm:gap-5 sm:px-5 sm:py-5">
          <div className="space-y-3">
            <label className="block text-sm">
              New exam title{" "}
              <span className="text-ink/40">(optional)</span>
              <input
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                disabled={Boolean(targetExamId) || pending}
                placeholder="Defaults from file name or JSON title"
                className="mt-1 w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50"
              />
            </label>
            <label className="block text-sm">
              Or append to a draft
              <select
                value={targetExamId}
                onChange={(e) => setTargetExamId(e.target.value)}
                disabled={pending}
                className="mt-1 w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine"
              >
                <option value="">Create new draft from file</option>
                {drafts.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.title} ({exam.question_count ?? 0}q)
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs leading-relaxed text-ink/50">
              After upload, Compose opens so you can review questions, set
              duration and pass mark, then publish.
            </p>
          </div>

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex min-h-[11rem] cursor-pointer flex-col items-center justify-center border border-dashed px-4 py-8 text-center transition-colors sm:min-h-[12rem] ${
              dragOver
                ? "border-pine bg-pine/5"
                : "border-stone bg-white/50 hover:border-pine/50"
            } ${pending ? "pointer-events-none opacity-60" : ""}`}
          >
            <p className="text-sm font-medium text-pine">
              {pending ? "Parsing…" : "Drop file or browse"}
            </p>
            <p className="mt-1 text-[0.7rem] text-ink/45">
              .xlsx · .csv · .json · .txt
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json,.txt"
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
