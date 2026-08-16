"use client";

import Link from "next/link";
import type { GalleryPhoto } from "@/app/student/photos/actions";
import { PhotoUploadCard } from "@/components/student/photo-upload-card";
import { useRefreshOnVisible } from "@/components/student/use-refresh-on-visible";

type GalleryProps = {
  scope: "batch" | "parish";
  parishName: string | null;
  batchLabel: string | null;
  hasBatch: boolean;
  photos: GalleryPhoto[];
  loadError: string | null;
  graduationPaid: boolean;
  ownSelfieUploaded: boolean;
  ownSelfieUrl: string | null;
  ownTakenDown: boolean;
  ownModerationNote: string | null;
};

export function StudentGallery({
  scope,
  parishName,
  batchLabel,
  hasBatch,
  photos,
  loadError,
  graduationPaid,
  ownSelfieUploaded,
  ownSelfieUrl,
  ownTakenDown,
  ownModerationNote,
}: GalleryProps) {
  useRefreshOnVisible();

  const title =
    scope === "batch"
      ? batchLabel
        ? `Batch · ${batchLabel}`
        : "Your batch"
      : parishName
        ? `Parish · ${parishName}`
        : "Your parish";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6">
      <section className="animate-fade-rise relative overflow-hidden border border-stone bg-mist">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.16),_transparent_50%),linear-gradient(135deg,_rgba(20,53,44,0.04),_transparent_60%)]"
          aria-hidden
        />
        <div className="relative px-4 py-5 sm:px-8 sm:py-9">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Faces of the School
          </p>
          <h1 className="mt-2 max-w-xl font-display text-[clamp(1.75rem,5.5vw,2.6rem)] tracking-[-0.02em] text-pine">
            Gallery
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink/65 sm:mt-3">
            Graduation selfies from your{" "}
            {scope === "batch" ? "batch" : "parish"} — manage your own portrait
            anytime, and browse classmates.
          </p>

          <nav
            className="mt-5 grid grid-cols-2 border border-stone/80 bg-white/40 sm:mt-6 sm:flex sm:gap-1 sm:border-0 sm:border-b sm:bg-transparent"
            aria-label="Gallery scope"
          >
            <ScopeTab
              href="/student/gallery?scope=batch"
              active={scope === "batch"}
              label="Batch"
              hint={batchLabel ?? undefined}
              disabled={!hasBatch}
            />
            <ScopeTab
              href="/student/gallery?scope=parish"
              active={scope === "parish"}
              label="Parish"
              hint={parishName ?? undefined}
            />
          </nav>
        </div>
      </section>

      <section className="border border-stone bg-mist px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Your portrait
        </p>
        <h2 className="mt-1.5 font-display text-xl text-pine sm:text-2xl">
          Graduation selfie
        </h2>
        {!graduationPaid ? (
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Available after you pay the graduation fee.{" "}
            <Link
              href="/student/payments"
              className="inline-flex min-h-10 items-center font-medium text-pine underline decoration-pine/30 underline-offset-4"
            >
              Open payments
            </Link>
          </p>
        ) : (
          <div className="mt-4">
            <PhotoUploadCard
              kind="graduation_selfie"
              required={!ownSelfieUploaded || ownTakenDown}
              alreadyUploaded={ownSelfieUploaded && !ownTakenDown}
              previewUrl={ownSelfieUrl}
              takenDown={ownTakenDown}
              moderationNote={ownModerationNote}
            />
          </div>
        )}
      </section>

      {loadError ? (
        <p
          className="border border-red-800/30 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </p>
      ) : (
        <section className="animate-panel-in">
          <div className="mb-3 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-2">
            <div className="min-w-0">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-ink/40">
                Showing
              </p>
              <h2 className="mt-1 break-words font-display text-lg text-pine sm:text-xl">
                {title}
              </h2>
            </div>
            <p className="shrink-0 text-sm tabular-nums text-ink/45">
              {photos.length} {photos.length === 1 ? "portrait" : "portraits"}
            </p>
          </div>

          {photos.length === 0 ? (
            <p className="border border-dashed border-stone px-4 py-10 text-center text-sm leading-relaxed text-ink/50 sm:py-12">
              No graduation selfies in this view yet. Check back as classmates
              complete their uploads.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {photos.map((photo, index) => (
                <li
                  key={photo.userId}
                  className="group relative overflow-hidden border border-stone bg-stone/20"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="aspect-[3/4] overflow-hidden bg-pine/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.imageUrl}
                      alt={`Graduation selfie of ${photo.displayName}`}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-pine/90 px-2 py-2 sm:bg-pine/85 sm:px-3 sm:py-2.5">
                    <p className="truncate font-display text-sm leading-snug text-mist sm:text-base">
                      {photo.displayName}
                      {photo.isSelf ? " · you" : ""}
                    </p>
                    <p className="mt-0.5 truncate text-[0.6rem] uppercase tracking-[0.08em] text-mist/65 sm:text-[0.65rem] sm:tracking-[0.1em]">
                      {scope === "batch"
                        ? photo.parishName || "Parish"
                        : photo.batchLabel || "Batch"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ScopeTab({
  href,
  active,
  label,
  hint,
  disabled,
}: {
  href: string;
  active: boolean;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="relative flex min-h-12 cursor-not-allowed items-center justify-center px-3 py-3 text-sm font-medium text-ink/30 sm:min-h-0 sm:justify-start sm:px-3 sm:py-2">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`relative flex min-h-12 items-center justify-center px-3 py-3 text-sm font-medium tracking-wide transition-colors sm:min-h-0 sm:shrink-0 sm:justify-start sm:px-3 sm:py-2 ${
        active
          ? "bg-mist text-pine sm:bg-transparent"
          : "text-ink/50 hover:text-ink/80"
      }`}
    >
      <span className="inline-flex max-w-full items-center gap-1.5">
        {label}
        {hint ? (
          <span className="hidden max-w-[9rem] truncate text-[0.65rem] text-ink/40 sm:inline md:max-w-[12rem]">
            {hint}
          </span>
        ) : null}
      </span>
      <span
        className={`absolute inset-x-3 bottom-0 h-0.5 bg-celadon transition-opacity sm:inset-x-2 ${
          active ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden
      />
    </Link>
  );
}
