import { formatAttachmentSize } from "@/lib/desk-attachments";
import type { AnnouncementAttachmentView } from "@/lib/announcements";

type Tone = "pine" | "mist" | "parchment";

/**
 * Corner cue that a notice carries files — sits on the notice card,
 * not an expand/collapse control.
 */
export function NoticeFilesMark({
  count,
  tone = "pine",
  className = "",
}: {
  count: number;
  tone?: Tone;
  className?: string;
}) {
  if (count <= 0) return null;

  const surface =
    tone === "mist"
      ? "border-mist/35 bg-pine text-mist shadow-[0_6px_18px_-8px_rgba(0,0,0,0.45)]"
      : tone === "parchment"
        ? "border-[#c4a574]/55 bg-[#efe8dc] text-[#6b4f2a] shadow-[0_6px_18px_-10px_rgba(107,79,42,0.35)]"
        : "border-pine/25 bg-mist text-pine shadow-[0_6px_18px_-10px_rgba(20,53,44,0.35)]";

  const label = count === 1 ? "1 attached file" : `${count} attached files`;

  return (
    <div
      className={`pointer-events-none absolute right-0 top-0 z-[1] ${className}`}
      aria-label={`This notice has ${label}`}
      title={label}
    >
      <div
        className={`relative flex items-center gap-2 border-b border-l px-3.5 py-2.5 sm:gap-2.5 sm:px-4 sm:py-3 ${surface}`}
        style={{
          clipPath: "polygon(0 0, 100% 0, 100% 100%, 10% 100%)",
          paddingLeft: "1.35rem",
        }}
      >
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 sm:h-[1.15rem] sm:w-[1.15rem]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden
        >
          <path
            d="M12 4.5v7.75a2.75 2.75 0 1 1-5.5 0V6a1.75 1.75 0 1 1 3.5 0v5.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="flex flex-col leading-none">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] sm:text-[0.75rem]">
            {count > 9 ? "9+" : count}
          </span>
          <span className="mt-0.5 text-[0.55rem] font-medium uppercase tracking-[0.12em] opacity-70 sm:text-[0.6rem]">
            {count === 1 ? "file" : "files"}
          </span>
        </span>
      </div>
    </div>
  );
}

function linkClass(tone: Tone) {
  if (tone === "mist") {
    return "text-mist/75 underline-offset-2 transition-colors hover:text-mist hover:underline";
  }
  if (tone === "parchment") {
    return "text-[#6b4f2a]/80 underline-offset-2 transition-colors hover:text-[#6b4f2a] hover:underline";
  }
  return "text-pine/75 underline-offset-2 transition-colors hover:text-pine hover:underline";
}

function metaClass(tone: Tone) {
  if (tone === "mist") return "text-mist/45";
  if (tone === "parchment") return "text-ink/40";
  return "text-ink/40";
}

function nameClass(tone: Tone) {
  if (tone === "mist") return "text-mist/85";
  if (tone === "parchment") return "text-[#6b4f2a]/90";
  return "text-ink/70";
}

/**
 * Quiet file rows under a notice — no auto preview, no dropdown.
 * Filename left; View / Download as plain text links bottom-right.
 */
export function NoticeAttachmentList({
  files,
  tone = "pine",
  className = "",
  onExternalNavigate,
}: {
  files?: AnnouncementAttachmentView[];
  tone?: Tone;
  className?: string;
  /** When set, external view/download links ask the host before opening. */
  onExternalNavigate?: (payload: {
    href: string;
    action: "view" | "download";
    fileName: string;
  }) => void;
}) {
  if (!files?.length) return null;

  const link = linkClass(tone);
  const meta = metaClass(tone);
  const name = nameClass(tone);
  const rule =
    tone === "mist"
      ? "border-mist/15"
      : tone === "parchment"
        ? "border-[#c4a574]/25"
        : "border-stone/80";

  return (
    <ul className={`mt-4 space-y-2 border-t pt-3 ${rule} ${className}`}>
      {files.map((file) => {
        const access = file.access ?? "both";
        const canView = (access === "view" || access === "both") && file.url;
        const canDownload =
          (access === "download" || access === "both") && file.downloadUrl;

        return (
          <li
            key={file.id}
            className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1"
          >
            <div className="min-w-0 flex-1">
              <p className={`truncate text-xs font-medium ${name}`}>
                {file.name}
              </p>
              <p className={`text-[0.6rem] tabular-nums ${meta}`}>
                {formatAttachmentSize(file.byteSize)}
              </p>
            </div>
            <p className="shrink-0 text-right text-xs">
              {canView ? (
                onExternalNavigate ? (
                  <button
                    type="button"
                    onClick={() =>
                      onExternalNavigate({
                        href: file.url!,
                        action: "view",
                        fileName: file.name,
                      })
                    }
                    className={link}
                  >
                    View
                  </button>
                ) : (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={link}
                  >
                    View
                  </a>
                )
              ) : null}
              {canView && canDownload ? (
                <span className={`mx-1.5 ${meta}`} aria-hidden>
                  ·
                </span>
              ) : null}
              {canDownload ? (
                onExternalNavigate ? (
                  <button
                    type="button"
                    onClick={() =>
                      onExternalNavigate({
                        href: file.downloadUrl!,
                        action: "download",
                        fileName: file.name,
                      })
                    }
                    className={link}
                  >
                    Download
                  </button>
                ) : (
                  <a
                    href={file.downloadUrl}
                    className={link}
                    download={file.name}
                  >
                    Download
                  </a>
                )
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
