import Link from "next/link";
import { NoticeAttachmentList, NoticeFilesMark } from "@/components/notices/notice-attachments";
import {
  formatAnnouncementDate,
  MAX_GENERAL_ANNOUNCEMENTS,
  staticAnnouncements,
  type Announcement,
} from "@/lib/announcements";
import { fetchGeneralAnnouncements } from "@/lib/announcements-server";

function isExternalHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

function AnnouncementLink({
  href,
  label,
  tone = "pine",
}: {
  href: string;
  label: string;
  tone?: "pine" | "mist";
}) {
  const className =
    tone === "mist"
      ? "mt-4 inline-flex items-center gap-2 text-sm font-medium text-mist underline decoration-mist/35 underline-offset-4 transition-colors duration-300 hover:decoration-mist"
      : "mt-4 inline-flex items-center gap-2 text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 transition-colors duration-300 hover:text-celadon hover:decoration-celadon";

  const content = (
    <>
      {label}
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </>
  );

  if (isExternalHref(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`group ${className}`}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={`group ${className}`}>
      {content}
    </Link>
  );
}

function LiveNotice({ item, index }: { item: Announcement; index: number }) {
  const dateLabel = formatAnnouncementDate(item.publishedAt);
  const fileCount = item.attachments?.length ?? 0;

  return (
    <article
      className="animate-fade-rise group relative flex flex-col border-t border-mist/15 pt-6 first:border-t-0 first:pt-0 sm:border-t-0 sm:border-l sm:border-mist/15 sm:pt-0 sm:pl-6 first:sm:border-l-0 first:sm:pl-0"
      style={{ animationDelay: `${0.08 + index * 0.1}s` }}
    >
      <NoticeFilesMark count={fileCount} tone="mist" className="-right-1 top-0 sm:top-0" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-display text-sm tabular-nums text-celadon">
          {String(index + 1).padStart(2, "0")}
        </span>
        {dateLabel ? (
          <time
            dateTime={item.publishedAt}
            className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-mist/50"
          >
            {dateLabel}
          </time>
        ) : null}
      </div>
      <h3 className="mt-3 font-display text-[clamp(1.2rem,2.5vw,1.45rem)] leading-snug tracking-[-0.02em] text-mist">
        {item.title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-mist/70">
        {item.body}
      </p>
      <NoticeAttachmentList
        files={item.attachments}
        tone="mist"
      />
      {item.href && item.hrefLabel ? (
        <AnnouncementLink href={item.href} label={item.hrefLabel} tone="mist" />
      ) : null}
    </article>
  );
}

function PinnedStep({ item, index }: { item: Announcement; index: number }) {
  return (
    <li
      className="animate-fade-rise relative min-w-0"
      style={{ animationDelay: `${0.12 + index * 0.1}s` }}
    >
      <NoticeFilesMark
        count={item.attachments?.length ?? 0}
        className="-right-1"
      />
      <div className="flex items-baseline gap-3">
        <span
          className="font-display text-3xl leading-none tracking-[-0.03em] text-celadon/70 tabular-nums"
          aria-hidden
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div
          className="animate-draw-line hidden h-px flex-1 bg-stone sm:block"
          aria-hidden
        />
      </div>
      <h3 className="mt-4 font-display text-xl leading-snug tracking-[-0.02em] text-pine sm:text-[1.35rem]">
        {item.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink/65 sm:text-[0.95rem]">
        {item.body}
      </p>
      <NoticeAttachmentList files={item.attachments} />
      {item.href && item.hrefLabel ? (
        <AnnouncementLink href={item.href} label={item.hrefLabel} />
      ) : null}
    </li>
  );
}

export async function AnnouncementsSection() {
  const live = await fetchGeneralAnnouncements(MAX_GENERAL_ANNOUNCEMENTS);
  const pinned = staticAnnouncements;
  const hasLive = live.length > 0;

  return (
    <section
      id="announcements"
      aria-labelledby="announcements-heading"
      className="relative overflow-hidden border-t border-stone bg-mist"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(95,143,122,0.14),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(20,53,44,0.05),_transparent_45%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-20 lg:px-12 lg:py-24">
        <header className="max-w-2xl">
          <p className="animate-fade-rise text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Public square
          </p>
          <h2
            id="announcements-heading"
            className="animate-fade-rise-delay-1 mt-3 font-display text-[clamp(1.85rem,4vw,2.75rem)] leading-[0.98] tracking-[-0.02em] text-pine"
          >
            What&apos;s along the way
          </h2>
          <p className="animate-fade-rise-delay-2 mt-4 max-w-lg text-base leading-relaxed text-ink/70">
            General notices for everyone visiting the School — plus steady
            guidance for enrolment and the student portal.
          </p>
          <div
            className="animate-draw-line mt-6 h-px w-24 bg-celadon"
            aria-hidden
          />
        </header>

        {/* Live notices — atmospheric pine band */}
        <div className="animate-fade-rise-delay-2 mt-12 sm:mt-14">
          <div className="grain relative overflow-hidden bg-pine text-mist">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.35),_transparent_55%),linear-gradient(180deg,transparent_0%,rgba(8,22,18,0.35)_100%)]"
              aria-hidden
            />
            <div className="relative px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-mist/15 pb-5">
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
                    Live · for everyone
                  </p>
                  <p className="mt-1 text-sm text-mist/65">
                    {hasLive
                      ? `${live.length} public notice${live.length === 1 ? "" : "s"}`
                      : "No public notices posted right now"}
                  </p>
                </div>
                {hasLive ? (
                  <span
                    className="inline-flex items-center gap-2 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-mist/55"
                    aria-hidden
                  >
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-celadon" />
                    Updated
                  </span>
                ) : null}
              </div>

              {hasLive ? (
                <div
                  className={`mt-7 grid gap-8 ${
                    live.length === 1
                      ? "sm:grid-cols-1"
                      : live.length === 2
                        ? "sm:grid-cols-2"
                        : "sm:grid-cols-3"
                  }`}
                >
                  {live.map((item, index) => (
                    <LiveNotice key={item.id} item={item} index={index} />
                  ))}
                </div>
              ) : (
                <div className="mt-8 max-w-md py-2">
                  <p className="font-display text-2xl tracking-[-0.02em] text-mist">
                    The board is quiet
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-mist/65">
                    When administrators publish a notice, it will appear here —
                    short, clear, and easy to scan.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pinned guidance — open path, no card chrome */}
        <div className="mt-14 sm:mt-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-ink/45">
                Pinned guidance
              </p>
              <p className="mt-1 text-sm text-ink/60">
                Always here for enrolment and the portal
              </p>
            </div>
          </div>

          <ol className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8 lg:gap-12">
            {pinned.map((item, index) => (
              <PinnedStep key={item.id} item={item} index={index} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
