"use client";

import Link from "next/link";
import type { StudentCertificateMeta } from "@/lib/student/certificates";

type Props = {
  meta: StudentCertificateMeta;
  downloadUrl: string | null;
  loadError?: string | null;
};

function formatIssued(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function StudentCertificatesClient({
  meta,
  downloadUrl,
  loadError,
}: Props) {
  const issued = formatIssued(meta.uploadedAt);
  const fileLabel = meta.originalName?.trim() || "Course certificate";
  const isPdf = (meta.mime || "").includes("pdf");

  if (loadError) {
    return (
      <p className="border border-red-800/30 bg-red-50 px-4 py-3 text-sm text-red-900">
        {loadError}
      </p>
    );
  }

  if (!meta.available || !downloadUrl) {
    return (
      <div className="relative overflow-hidden border border-dashed border-stone bg-gradient-to-br from-mist via-white to-pine/[0.04] px-5 py-10 sm:px-8 sm:py-14">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full border border-pine/10"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-6 h-32 w-32 rounded-full border border-celadon/20"
          aria-hidden
        />
        <div className="relative mx-auto max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center border border-pine/20 bg-white/80 font-display text-2xl tracking-wide text-pine/40">
            ✦
          </div>
          <h2 className="mt-5 font-display text-2xl tracking-[-0.02em] text-pine sm:text-[1.75rem]">
            Certificate not available
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink/65">
            Your course certificate has not been issued yet. When the desk
            uploads it, it will appear here for download.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/55">
            If you believe it should already be ready, contact the Listening
            Desk in Support.
          </p>
          <Link
            href="/student/support"
            className="mt-6 inline-flex border border-pine/30 bg-pine px-4 py-2.5 text-sm font-medium tracking-wide text-mist transition-colors hover:bg-pine/90"
          >
            Contact admin in Support
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-pine/20 bg-gradient-to-br from-[#f7faf8] via-white to-[#f3efe4]">
      <div className="border-b border-pine/10 bg-pine px-5 py-4 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-celadon">
          School of Disciples
        </p>
        <h2 className="mt-1 font-display text-xl tracking-[-0.02em] text-mist sm:text-2xl">
          Your certificate
        </h2>
      </div>

      <div className="px-5 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Ready to download
            </p>
            <p className="mt-2 truncate font-display text-xl text-pine sm:text-2xl">
              {fileLabel}
            </p>
            <p className="mt-2 text-sm text-ink/60">
              {isPdf ? "PDF document" : "Image file"}
              {issued ? ` · Issued ${issued}` : ""}
            </p>
          </div>

          <div
            className="mx-auto flex h-24 w-24 shrink-0 flex-col items-center justify-center border border-[#c5a35a]/60 bg-white/80 shadow-[inset_0_0_0_1px_rgba(197,163,90,0.25)] sm:mx-0"
            aria-hidden
          >
            <span className="font-display text-xs tracking-[0.14em] text-[#8a7350]">
              SOD
            </span>
            <span className="mt-1 text-[0.55rem] uppercase tracking-[0.18em] text-pine/50">
              Certified
            </span>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={downloadUrl}
            download={fileLabel}
            className="inline-flex border border-pine bg-pine px-5 py-2.5 text-sm font-medium tracking-wide text-mist transition-colors hover:bg-pine/90"
          >
            Download certificate
          </a>
          <Link
            href="/student/records"
            className="inline-flex border border-stone px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-pine/30 hover:text-pine"
          >
            View records
          </Link>
        </div>

        <p className="mt-6 max-w-lg text-xs leading-relaxed text-ink/45">
          Keep a personal copy. If the link stops working, refresh this page or
          ask Support — the desk can re-issue the file.
        </p>
      </div>
    </div>
  );
}
