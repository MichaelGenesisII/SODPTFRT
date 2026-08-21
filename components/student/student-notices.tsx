"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  formatAnnouncementDate,
  isSafeAnnouncementHref,
  type Announcement,
} from "@/lib/announcements";
import { formatAttachmentSize } from "@/lib/desk-attachments";

type NoticesTab = "latest" | "earlier";

function isExternalHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

function NoticeLink({
  href,
  label,
  tone = "pine",
}: {
  href: string;
  label: string;
  tone?: "pine" | "mist" | "parchment";
}) {
  if (!isSafeAnnouncementHref(href)) {
    return null;
  }

  const className =
    tone === "mist"
      ? "mt-4 inline-flex min-h-11 items-center border border-mist/35 px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:border-mist/60 hover:bg-mist/[0.06]"
      : tone === "parchment"
        ? "mt-4 inline-flex min-h-11 items-center border border-[#c4a574]/55 bg-[#efe8dc]/50 px-4 py-2.5 text-sm font-medium text-[#6b4f2a] transition-colors hover:border-[#6b4f2a]/50"
        : "mt-4 inline-flex min-h-11 items-center border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine";

  if (isExternalHref(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {label}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

function NoticeAttachments({
  notice,
  tone = "pine",
}: {
  notice: Announcement;
  tone?: "pine" | "mist" | "parchment";
}) {
  if (!notice.attachments?.length) return null;

  const linkClass =
    tone === "mist"
      ? "text-mist/85 underline-offset-2 hover:underline"
      : tone === "parchment"
        ? "text-[#6b4f2a] underline-offset-2 hover:underline"
        : "text-pine underline-offset-2 hover:underline";

  return (
    <ul className="mt-3 space-y-1.5">
      {notice.attachments.map((file) => (
        <li key={file.id}>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 text-sm ${linkClass}`}
          >
            <span>{file.name}</span>
            <span className="text-[0.65rem] opacity-70">
              ({formatAttachmentSize(file.byteSize)})
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function StudentNoticesBoard({ notices }: { notices: Announcement[] }) {
  const featured = notices[0] ?? null;
  const earlier = notices.slice(1);
  const [tab, setTab] = useState<NoticesTab>("latest");
  const [openId, setOpenId] = useState<string | null>(earlier[0]?.id ?? null);

  const tabs: { id: NoticesTab; label: string; hint?: string }[] = [
    { id: "latest", label: "Latest" },
    {
      id: "earlier",
      label: "Earlier",
      hint: earlier.length ? String(earlier.length) : undefined,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 sm:space-y-5">
      <section className="animate-fade-rise border border-[#c4a574]/30 bg-[#f7f1e6] px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-[#6b4f2a]/75">
          Student board
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.75rem,5.5vw,2.5rem)] tracking-[-0.02em] text-pine">
          Notices
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70 sm:mt-1.5">
          Cohort updates inside the portal — one section at a time.
        </p>
      </section>

      <div className="grid grid-cols-3 gap-px border border-stone bg-stone sm:gap-0 sm:border sm:bg-mist/50">
        <MiniStat label="On the board" value={String(notices.length)} />
        <MiniStat
          label="Latest"
          value={
            featured
              ? formatAnnouncementDate(featured.publishedAt) || "Live"
              : "—"
          }
          compact
        />
        <MiniStat label="Earlier" value={String(earlier.length)} />
      </div>

      {notices.length === 0 ? (
        <div className="border border-dashed border-[#c4a574]/40 bg-[#f7f1e6]/50 px-4 py-12 text-center sm:px-6 sm:py-14">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-[#6b4f2a]/70">
            Quiet board
          </p>
          <p className="mt-2 font-display text-xl text-pine sm:text-2xl">
            No student notices right now
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink/60">
            When the School publishes a students-only announcement, it will
            appear here.
          </p>
        </div>
      ) : (
        <>
          <nav
            className="grid grid-cols-2 border border-stone bg-mist/40 sm:flex sm:gap-1 sm:overflow-x-auto sm:border-0 sm:border-b sm:bg-transparent sm:pb-px"
            aria-label="Notices sections"
          >
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`relative min-h-12 px-3 py-3 text-sm font-medium tracking-wide transition-colors sm:min-h-0 sm:shrink-0 sm:px-3 sm:py-2 ${
                    active
                      ? "bg-mist text-pine sm:bg-transparent"
                      : "text-ink/50 hover:text-ink/80"
                  }`}
                >
                  <span className="inline-flex items-center justify-center gap-1.5 sm:justify-start">
                    {item.label}
                    {item.hint ? (
                      <span className="tabular-nums text-[0.65rem] text-ink/40">
                        {item.hint}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`absolute inset-x-3 bottom-0 h-0.5 bg-celadon transition-opacity sm:inset-x-2 ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden
                  />
                </button>
              );
            })}
          </nav>

          {tab === "latest" && featured ? (
            <article className="animate-panel-in relative overflow-hidden border border-[#c4a574]/25 bg-pine text-mist">
              <div className="relative px-4 py-5 sm:px-6 sm:py-8 md:px-8">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                  <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-[#c4a574]">
                    Latest update
                  </p>
                  {formatAnnouncementDate(featured.publishedAt) ? (
                    <time
                      dateTime={featured.publishedAt}
                      className="text-xs tracking-wide text-mist/55"
                    >
                      {formatAnnouncementDate(featured.publishedAt)}
                    </time>
                  ) : null}
                </div>
                <h2 className="mt-3 max-w-3xl break-words font-display text-[clamp(1.35rem,4.5vw,2.1rem)] leading-[1.15] tracking-[-0.02em]">
                  {featured.title}
                </h2>
                <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-sm leading-relaxed text-mist/75 sm:mt-4 sm:text-base">
                  {featured.body}
                </p>
                <NoticeAttachments notice={featured} tone="mist" />
                {featured.href ? (
                  <NoticeLink
                    href={featured.href}
                    label={featured.hrefLabel ?? "Read more"}
                    tone="mist"
                  />
                ) : null}
              </div>
            </article>
          ) : null}

          {tab === "earlier" ? (
            <Panel
              eyebrow="Archive"
              title="Earlier updates"
              body="Open a notice to read the full message."
            >
              {earlier.length === 0 ? (
                <Empty>No earlier notices yet.</Empty>
              ) : (
                <ul className="divide-y divide-[#c4a574]/20 border-y border-[#c4a574]/25">
                  {earlier.map((notice, index) => {
                    const open = openId === notice.id;
                    const dateLabel = formatAnnouncementDate(notice.publishedAt);
                    return (
                      <li key={notice.id} className="py-1 first:pt-0 last:pb-0">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenId((id) =>
                              id === notice.id ? null : notice.id,
                            )
                          }
                          aria-expanded={open}
                          className="flex w-full items-start gap-3 py-3.5 text-left sm:gap-4"
                        >
                          <span className="mt-0.5 hidden w-8 shrink-0 font-display text-xl tabular-nums text-[#c4a574] sm:block">
                            {String(index + 2).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2">
                              <span className="break-words font-display text-base leading-snug text-pine sm:text-lg">
                                <span className="mr-2 inline tabular-nums text-[#c4a574] sm:hidden">
                                  {String(index + 2).padStart(2, "0")}
                                </span>
                                {notice.title}
                              </span>
                              {dateLabel ? (
                                <time
                                  dateTime={notice.publishedAt}
                                  className="shrink-0 text-xs tracking-wide text-ink/45"
                                >
                                  {dateLabel}
                                </time>
                              ) : null}
                            </span>
                            <span className="mt-1.5 block text-[0.65rem] font-medium uppercase tracking-[0.12em] text-pine/70">
                              {open ? "Hide message" : "Show message"}
                            </span>
                          </span>
                        </button>
                        {open ? (
                          <div className="mb-3 border border-[#c4a574]/20 bg-[#f7f1e6]/70 px-3 py-3 sm:ml-12 sm:px-4 sm:py-3.5">
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/65">
                              {notice.body}
                            </p>
                            <NoticeAttachments notice={notice} tone="parchment" />
                            {notice.href ? (
                              <NoticeLink
                                href={notice.href}
                                label={notice.hrefLabel ?? "Read more"}
                                tone="parchment"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="bg-mist/80 px-2.5 py-3 sm:bg-transparent sm:px-4 sm:py-3">
      <p className="text-[0.58rem] uppercase tracking-[0.1em] text-ink/40 sm:text-[0.6rem] sm:tracking-[0.12em]">
        {label}
      </p>
      <p
        className={`mt-0.5 font-display tabular-nums text-pine ${
          compact
            ? "truncate text-sm leading-tight sm:text-lg sm:leading-normal"
            : "text-lg sm:text-xl"
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="animate-panel-in border border-[#c4a574]/25 bg-[#f7f1e6]/60">
      <div className="border-b border-[#c4a574]/20 px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-[#6b4f2a]/70">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 font-display text-xl text-pine sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
          {body}
        </p>
      </div>
      <div className="px-3 py-3 sm:px-5 sm:py-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border border-dashed border-[#c4a574]/35 px-4 py-8 text-center text-sm text-ink/50">
      {children}
    </p>
  );
}
