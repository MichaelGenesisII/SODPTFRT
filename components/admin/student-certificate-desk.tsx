"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteStudentCertificate,
  getAdminStudentCertificate,
  uploadStudentCertificate,
} from "@/app/admin/students/certificate-actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import type { StudentCertificateMeta } from "@/lib/student/certificates";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";

type Props = {
  studentId: string;
  studentName?: string;
  compact?: boolean;
};

function formatUploadedAt(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function StudentCertificateDesk({
  studentId,
  studentName,
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<StudentCertificateMeta | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const label = studentName?.trim() || "this student";
  const busy = pending || loading || Boolean(busyLabel);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getAdminStudentCertificate(studentId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setMeta(null);
        setDownloadUrl(null);
        return;
      }
      setMeta(result.meta ?? null);
      setDownloadUrl(result.downloadUrl ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function applyResult(
    result: Awaited<ReturnType<typeof uploadStudentCertificate>>,
  ) {
    if (!result.ok) {
      await deskError({ text: result.message });
      return;
    }
    await deskSuccess({ text: result.message });
    setMeta(result.meta ?? null);
    setDownloadUrl(result.downloadUrl ?? null);
  }

  function uploadFile(file: File) {
    const formData = new FormData();
    formData.set("file", file);
    setBusyLabel("Uploading certificate…");
    startTransition(async () => {
      try {
        await applyResult(await uploadStudentCertificate(studentId, formData));
        if (inputRef.current) inputRef.current.value = "";
      } catch (err) {
        console.error("[students/certificate]", err);
        await deskError({
          text: "Something went wrong. Please try again.",
        });
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    if (meta?.available) {
      const ok = await deskConfirm({
        title: "Replace the file on file?",
        text: `The current certificate for ${label} will be replaced with ${file.name}.`,
        confirmLabel: "Replace file",
      });
      if (!ok) {
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }
    uploadFile(file);
  }

  async function requestDelete() {
    if (busy) return;
    const ok = await deskConfirm({
      title: "Remove this certificate?",
      text: `${label} will no longer be able to download it from Certificates or the scorecard email link.`,
      confirmLabel: "Remove certificate",
      danger: true,
    });
    if (!ok) return;
    setBusyLabel("Removing certificate…");
    startTransition(async () => {
      try {
        await applyResult(await deleteStudentCertificate(studentId));
      } catch (err) {
        console.error("[students/certificate]", err);
        await deskError({
          text: "Something went wrong. Please try again.",
        });
      } finally {
        setBusyLabel(null);
      }
    });
  }

  const uploadedLabel = formatUploadedAt(meta?.uploadedAt);

  return (
    <div
      className={
        compact
          ? "relative border border-stone bg-white/60 px-3 py-3"
          : "relative border border-stone bg-mist/30 px-4 py-4"
      }
      aria-busy={busy}
    >
      <DeskLoaderOverlay
        active={Boolean(busyLabel)}
        label={busyLabel ?? "Working…"}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Certificate
          </p>
          {!compact ? (
            <h3 className="mt-1 font-display text-xl text-pine">
              Course certificate
            </h3>
          ) : null}
          <p
            className={`text-sm leading-relaxed text-ink/60 ${compact ? "mt-1" : "mt-2"}`}
          >
            Upload a PDF or image. Students download it from Certificates, and
            it is linked from the scorecard email when on file.
          </p>
        </div>
        <span
          className={`shrink-0 border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] ${
            meta?.available
              ? "border-pine/30 bg-pine/5 text-pine"
              : "border-stone text-ink/45"
          }`}
        >
          {loading ? "…" : meta?.available ? "On file" : "Not issued"}
        </span>
      </div>

      {meta?.available ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/70">
          <span className="min-w-0 truncate font-medium text-pine">
            {meta.originalName || "certificate"}
          </span>
          {uploadedLabel ? (
            <span className="text-ink/45">Issued {uploadedLabel}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          className="sr-only"
          disabled={busy}
          onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-[2rem] min-w-[8.5rem] items-center justify-center border border-pine/30 bg-white/80 px-3 py-1.5 text-sm font-medium text-pine disabled:opacity-50"
        >
          {pending && busyLabel?.startsWith("Uploading") ? (
            <DeskLoader label={busyLabel} />
          ) : meta?.available ? (
            "Replace file"
          ) : (
            "Upload certificate"
          )}
        </button>
        {meta?.available && downloadUrl ? (
          <a
            href={downloadUrl}
            download={meta.originalName || "certificate"}
            className="border border-stone px-3 py-1.5 text-sm font-medium text-ink/70 hover:border-pine/30 hover:text-pine"
          >
            Preview / download
          </a>
        ) : null}
        {meta?.available ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void requestDelete()}
            className="inline-flex min-h-[2rem] min-w-[5rem] items-center justify-center border border-red-800/20 px-3 py-1.5 text-sm font-medium text-red-900/80 disabled:opacity-50"
          >
            {pending && busyLabel?.startsWith("Removing") ? (
              <DeskLoader label={busyLabel} />
            ) : (
              "Remove"
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
