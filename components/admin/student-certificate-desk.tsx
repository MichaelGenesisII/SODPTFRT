"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteStudentCertificate,
  getAdminStudentCertificate,
  uploadStudentCertificate,
} from "@/app/admin/students/certificate-actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import type { StudentCertificateMeta } from "@/lib/student/certificates";

type Props = {
  studentId: string;
  studentName?: string;
  compact?: boolean;
};

type PendingConfirm =
  | { kind: "delete" }
  | { kind: "replace"; file: File };

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
  const { success, error } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<StudentCertificateMeta | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

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

  useEffect(() => {
    if (!pendingConfirm) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending && !busyLabel) {
        setPendingConfirm(null);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingConfirm, pending, busyLabel]);

  function applyResult(
    result: Awaited<ReturnType<typeof uploadStudentCertificate>>,
  ) {
    if (!result.ok) {
      error(result.message, "Certificate");
      return;
    }
    success(result.message, "Certificate");
    setMeta(result.meta ?? null);
    setDownloadUrl(result.downloadUrl ?? null);
    setPendingConfirm(null);
  }

  function uploadFile(file: File) {
    const formData = new FormData();
    formData.set("file", file);
    setBusyLabel("Uploading certificate…");
    startTransition(async () => {
      try {
        applyResult(await uploadStudentCertificate(studentId, formData));
        if (inputRef.current) inputRef.current.value = "";
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function onPickFile(file: File | null) {
    if (!file) return;
    if (meta?.available) {
      setPendingConfirm({ kind: "replace", file });
      return;
    }
    uploadFile(file);
  }

  function runDelete() {
    setBusyLabel("Removing certificate…");
    startTransition(async () => {
      try {
        applyResult(await deleteStudentCertificate(studentId));
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm || pending || busyLabel) return;
    if (pendingConfirm.kind === "delete") {
      runDelete();
      return;
    }
    uploadFile(pendingConfirm.file);
  }

  const uploadedLabel = formatUploadedAt(meta?.uploadedAt);
  const modalBusy = pending || Boolean(busyLabel);

  const confirmCopy =
    pendingConfirm?.kind === "delete"
      ? {
          eyebrow: "Remove certificate",
          title: "Remove this certificate?",
          body: (
            <>
              <span className="font-medium text-ink">{label}</span> will no
              longer be able to download it from Certificates or the scorecard
              email link.
            </>
          ),
          confirmLabel: "Remove certificate",
          destructive: true,
        }
      : pendingConfirm?.kind === "replace"
        ? {
            eyebrow: "Replace certificate",
            title: "Replace the file on file?",
            body: (
              <>
                The current certificate for{" "}
                <span className="font-medium text-ink">{label}</span> will be
                replaced with{" "}
                <span className="font-medium text-ink">
                  {pendingConfirm.file.name}
                </span>
                .
              </>
            ),
            confirmLabel: "Replace file",
            destructive: false,
          }
        : null;

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
        active={Boolean(busyLabel) && !pendingConfirm}
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
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
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
            onClick={() => setPendingConfirm({ kind: "delete" })}
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

      {pendingConfirm && confirmCopy ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !modalBusy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="certificate-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={modalBusy}
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
              id="certificate-confirm-title"
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
                disabled={modalBusy}
                onClick={() => {
                  setPendingConfirm(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalBusy}
                onClick={confirmPendingAction}
                className={`inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center px-4 py-2.5 text-sm font-medium text-mist transition-colors disabled:opacity-60 ${
                  confirmCopy.destructive
                    ? "bg-[#5c2a2a] hover:bg-red-900"
                    : "bg-pine hover:bg-celadon"
                }`}
              >
                {modalBusy ? (
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
