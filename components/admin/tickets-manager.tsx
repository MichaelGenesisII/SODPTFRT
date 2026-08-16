"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  addTicketNote,
  claimTicket,
  deleteTicket,
  releaseTicket,
  sendTicketEmailReply,
  updateTicketPriority,
  updateTicketStatus,
  type TicketActionResult,
} from "@/app/admin/tickets/actions";
import {
  SupportChatComposer,
  SupportChatPane,
  SupportChatTranscript,
  type SupportChatMessage,
} from "@/components/support/chat-thread";
import { useToast } from "@/components/ui/toast";
import { defaultTicketEmailSubject } from "@/lib/email/subject";
import {
  isNationalAdmin,
  type AdminProfile,
} from "@/lib/admin/profile";
import {
  formatTicketDay,
  formatTicketRelative,
  formatTicketWhen,
  isActiveTicket,
  latestTicketActivityAt,
  latestTicketSnippet,
  NOTE_MAX,
  STATUS_META,
  TICKET_STATUSES,
  type TicketStatus,
  type TicketWithMeta,
} from "@/lib/tickets";

type Lane = "active" | "settled" | "all" | TicketStatus;
type Owner = "all" | "mine" | "unclaimed" | "guests";
type SortKey = "newest" | "oldest" | "urgent";
type DetailTab = "note" | "email" | "margin" | "details";
type PageView = "desk" | "insight";

const LANES: { id: Lane; label: string }[] = [
  { id: "active", label: "On the path" },
  { id: "open", label: "Inbox" },
  { id: "in_progress", label: "Walking" },
  { id: "waiting", label: "Paused" },
  { id: "settled", label: "Settled" },
  { id: "all", label: "All" },
];

const URGENT_TEXT = "text-[#8c3b2f]";
const DESK_INBOX_KEY = "sod-desk-inbox-open";
const DESK_CHAT_KEY = "sod-desk-chat-open";
const DESK_PAGE_SIZE = 8;

function DeskStatTile({
  label,
  shortLabel,
  value,
  hint,
}: {
  label: string;
  shortLabel?: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-stone/50 bg-white px-2 py-2.5 text-center shadow-[0_10px_24px_-12px_rgba(20,53,44,0.32),0_2px_6px_-3px_rgba(20,53,44,0.1)] sm:flex-row sm:items-center sm:gap-3.5 sm:px-0 sm:py-3.5 sm:pl-3.5 sm:pr-4 sm:text-left sm:shadow-[0_12px_30px_-12px_rgba(20,53,44,0.35),0_2px_8px_-4px_rgba(20,53,44,0.12)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine sm:h-12 sm:w-12">
        <span className="font-display text-[1.25rem] leading-none tracking-[-0.03em] text-mist tabular-nums sm:text-[1.55rem]">
          {value}
        </span>
      </div>
      <div className="min-w-0 sm:flex-1 sm:border-l sm:border-stone/70 sm:pl-3.5">
        <p className="truncate text-[0.7rem] font-medium leading-tight text-pine sm:text-sm">
          <span className="sm:hidden">{shortLabel ?? label}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="mt-0.5 hidden truncate text-xs leading-snug text-ink/50 sm:block">
          {hint}
        </p>
      </div>
    </div>
  );
}

function statusDotClass(status: TicketStatus) {
  switch (status) {
    case "open":
      return "bg-celadon";
    case "in_progress":
      return "bg-pine";
    case "waiting":
      return "bg-ink/35";
    case "resolved":
      return "bg-pine/45";
    case "closed":
      return "bg-ink/20";
  }
}

const DESKTOP_QUERY = "(min-width: 1024px)";

function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

const emptySubscribe = () => () => {};

/** True only after hydration, so relative stamps don't mismatch the server. */
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function TicketsManager({
  tickets,
  profile,
}: {
  tickets: TicketWithMeta[];
  profile: AdminProfile;
}) {
  const currentAdminId = profile.id;
  const national = isNationalAdmin(profile);
  const router = useRouter();
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const isDesktop = useIsDesktop();
  const mounted = useMounted();

  const [pageView, setPageView] = useState<PageView>("desk");
  const [lane, setLane] = useState<Lane>("active");
  const [owner, setOwner] = useState<Owner>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [topicFilter, setTopicFilter] = useState("all");
  const [parishFilter, setParishFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [refineOpen, setRefineOpen] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<DetailTab>("note");
  const [noteDraft, setNoteDraft] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [inboxOpen, setInboxOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TicketWithMeta | null>(
    null,
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    const inbox = window.localStorage.getItem(DESK_INBOX_KEY);
    const chat = window.localStorage.getItem(DESK_CHAT_KEY);
    if (inbox === "0") setInboxOpen(false);
    if (inbox === "1") setInboxOpen(true);
    if (chat === "1") setChatOpen(true);
    if (chat === "0") setChatOpen(false);
  }, []);

  const topics = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.topic))).sort(),
    [tickets],
  );

  const parishOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const ticket of tickets) {
      if (ticket.parish_id && ticket.parish_name) {
        map.set(ticket.parish_id, ticket.parish_name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets]);

  const counts = useMemo(() => {
    const base: Record<Lane, number> = {
      active: 0,
      settled: 0,
      all: tickets.length,
      open: 0,
      in_progress: 0,
      waiting: 0,
      resolved: 0,
      closed: 0,
    };
    for (const ticket of tickets) {
      base[ticket.status] += 1;
      if (isActiveTicket(ticket.status)) base.active += 1;
      else base.settled += 1;
    }
    return base;
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const rows = tickets.filter((ticket) => {
      if (lane === "active" && !isActiveTicket(ticket.status)) return false;
      if (lane === "settled" && isActiveTicket(ticket.status)) return false;
      if (
        lane !== "active" &&
        lane !== "settled" &&
        lane !== "all" &&
        ticket.status !== lane
      ) {
        return false;
      }
      if (owner === "mine" && ticket.assigned_to !== currentAdminId) {
        return false;
      }
      if (owner === "unclaimed" && ticket.assigned_to) return false;
      if (owner === "guests" && ticket.user_id) return false;
      if (topicFilter !== "all" && ticket.topic !== topicFilter) return false;
      if (parishFilter === "unlinked" && ticket.parish_id) return false;
      if (
        parishFilter !== "all" &&
        parishFilter !== "unlinked" &&
        ticket.parish_id !== parishFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        ticket.reference.toLowerCase().includes(q) ||
        ticket.name.toLowerCase().includes(q) ||
        ticket.email.toLowerCase().includes(q) ||
        ticket.message.toLowerCase().includes(q) ||
        ticket.topic.toLowerCase().includes(q) ||
        (ticket.parish_name ?? "").toLowerCase().includes(q) ||
        (ticket.batch_label ?? "").toLowerCase().includes(q)
      );
    });

    return rows.sort((a, b) => {
      if (sort === "urgent") {
        const weight = (t: TicketWithMeta) => (t.priority === "high" ? 0 : 1);
        const diff = weight(a) - weight(b);
        if (diff !== 0) return diff;
      }
      const at = new Date(a.created_at).getTime();
      const bt = new Date(b.created_at).getTime();
      return sort === "oldest" ? at - bt : bt - at;
    });
  }, [
    tickets,
    lane,
    owner,
    topicFilter,
    parishFilter,
    query,
    sort,
    currentAdminId,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / DESK_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * DESK_PAGE_SIZE;
  const pageTickets = filtered.slice(pageStart, pageStart + DESK_PAGE_SIZE);
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + DESK_PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [lane, owner, sort, topicFilter, parishFilter, query]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Keep the visible page in sync when ↑↓ / j/k moves selection across pages.
  useEffect(() => {
    if (!selectedId) return;
    const index = filtered.findIndex((t) => t.id === selectedId);
    if (index < 0) return;
    const needed = Math.floor(index / DESK_PAGE_SIZE) + 1;
    setPage((prev) => (prev === needed ? prev : needed));
  }, [selectedId, filtered]);

  // Desktop always keeps a note open beside the list; mobile opens on demand.
  const selected = useMemo(() => {
    const chosen = selectedId
      ? (tickets.find((t) => t.id === selectedId) ?? null)
      : null;
    if (chosen) return chosen;
    return isDesktop ? (filtered[0] ?? null) : null;
  }, [tickets, selectedId, filtered, isDesktop]);

  // Reset the reading state when a different note comes into view.
  const [lastReadId, setLastReadId] = useState<string | null>(null);
  if (lastReadId !== (selected?.id ?? null)) {
    setLastReadId(selected?.id ?? null);
    setNoteDraft("");
    setEmailSubject(
      selected
        ? defaultTicketEmailSubject(selected.topic, selected.reference)
        : "",
    );
    setEmailMessage("");
    setTab(selected && !selected.user_id ? "email" : "note");
  }

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  useEffect(() => {
    const locked = (sheetOpen && !isDesktop) || Boolean(pendingDelete);
    if (!locked) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheetOpen, isDesktop, pendingDelete]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (pendingDelete) setPendingDelete(null);
        else if (sheetOpen) closeSheet();
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      ) {
        return;
      }
      if (pendingDelete || filtered.length === 0) return;

      const isDown = event.key === "ArrowDown" || event.key === "j";
      const isUp = event.key === "ArrowUp" || event.key === "k";
      if (!isDown && !isUp) return;

      event.preventDefault();
      const index = filtered.findIndex((t) => t.id === selected?.id);
      const nextIndex = isDown
        ? Math.min(filtered.length - 1, index + 1)
        : Math.max(0, index === -1 ? 0 : index - 1);
      setSelectedId(filtered[nextIndex]?.id ?? null);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selected, pendingDelete, sheetOpen, closeSheet]);

  function run(
    action: () => Promise<TicketActionResult>,
    options?: { quiet?: boolean },
  ) {
    startTransition(async () => {
      const next = await action();
      if (next.ok) {
        if (!options?.quiet) success(next.message, "Desk");
        router.refresh();
      } else {
        error(next.message, "Desk");
      }
    });
  }

  function openTicket(id: string) {
    setSelectedId(id);
    if (!isDesktop) setSheetOpen(true);
    else {
      setChatOpen(true);
      window.localStorage.setItem(DESK_CHAT_KEY, "1");
    }
  }

  function goToPage(next: number) {
    setPage(Math.min(totalPages, Math.max(1, next)));
  }

  function onSubmitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const body = noteDraft.trim();
    if (!body) return;
    const isInternal = tab === "margin";
    run(async () => {
      const result = await addTicketNote(selected.id, body, isInternal);
      if (result.ok) setNoteDraft("");
      return result;
    });
  }

  function onSubmitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const subject = emailSubject.trim();
    const message = emailMessage.trim();
    if (!subject || !message) return;
    run(async () => {
      const result = await sendTicketEmailReply(selected.id, subject, message);
      if (result.ok) {
        setEmailMessage("");
        setEmailSubject(
          defaultTicketEmailSubject(selected.topic, selected.reference),
        );
      }
      return result;
    });
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      info(`${label} copied to clipboard.`, "Desk");
    } catch {
      error("Clipboard is unavailable in this browser.", "Desk");
    }
  }

  function toggleInbox() {
    setInboxOpen((value) => {
      const next = !value;
      window.localStorage.setItem(DESK_INBOX_KEY, next ? "1" : "0");
      return next;
    });
  }

  function toggleChat() {
    setChatOpen((value) => {
      const next = !value;
      window.localStorage.setItem(DESK_CHAT_KEY, next ? "1" : "0");
      return next;
    });
  }

  const activeFilters =
    (owner !== "all" ? 1 : 0) +
    (topicFilter !== "all" ? 1 : 0) +
    (parishFilter !== "all" ? 1 : 0) +
    (query.trim() ? 1 : 0) +
    (sort !== "newest" ? 1 : 0);

  const detail = selected ? (
    <TicketDetail
      ticket={selected}
      currentAdminId={currentAdminId}
      pending={pending}
      tab={tab}
      onTab={setTab}
      noteDraft={noteDraft}
      onNoteDraft={setNoteDraft}
      onSubmitNote={onSubmitNote}
      emailSubject={emailSubject}
      onEmailSubject={setEmailSubject}
      emailMessage={emailMessage}
      onEmailMessage={setEmailMessage}
      onSubmitEmail={onSubmitEmail}
      onStatus={(status) => run(() => updateTicketStatus(selected.id, status))}
      onPriority={() =>
        run(() =>
          updateTicketPriority(
            selected.id,
            selected.priority === "high" ? "normal" : "high",
          ),
        )
      }
      onClaim={() => run(() => claimTicket(selected.id))}
      onRelease={() => run(() => releaseTicket(selected.id))}
      onDelete={() => setPendingDelete(selected)}
      onCopy={copyValue}
      variant={isDesktop ? "desktop" : "sheet"}
    />
  ) : null;

  const inboxList =
    filtered.length === 0 ? (
      <div className="flex flex-1 items-center justify-center border border-dashed border-stone px-4 py-10 text-center">
        <div>
          <p className="font-display text-lg text-pine">Quiet desk</p>
          <p className="mt-1.5 text-sm text-ink/55">No notes match this view.</p>
        </div>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col border border-stone bg-mist/40">
        <ul className="min-h-0 flex-1 divide-y divide-stone overflow-y-auto overscroll-contain">
          {owner === "guests"
            ? groupTicketsByEmail(pageTickets).flatMap((group) => [
                <li
                  key={`email-${group.email}`}
                  className="sticky top-0 z-10 border-b border-stone bg-stone/70 px-3 py-2 backdrop-blur"
                >
                  <p className="truncate text-[0.58rem] font-medium uppercase tracking-[0.14em] text-celadon">
                    Guest email
                  </p>
                  <p className="truncate text-sm font-medium text-pine">
                    {group.email}
                  </p>
                  <p className="text-[0.7rem] text-ink/50">
                    {group.tickets.length} conversation
                    {group.tickets.length === 1 ? "" : "s"}
                    {" on this page"}
                  </p>
                </li>,
                ...group.tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    active={
                      isDesktop && selected?.id === ticket.id && chatOpen
                    }
                    mine={ticket.assigned_to === currentAdminId}
                    showRelative={mounted}
                    showParish={national}
                    onOpen={() => openTicket(ticket.id)}
                  />
                )),
              ])
            : pageTickets.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  active={isDesktop && selected?.id === ticket.id && chatOpen}
                  mine={ticket.assigned_to === currentAdminId}
                  showRelative={mounted}
                  showParish={national}
                  onOpen={() => openTicket(ticket.id)}
                />
              ))}
        </ul>
        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone px-3 py-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className="border border-pine/25 px-2.5 py-1.5 text-xs font-medium text-pine transition-colors hover:border-pine disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <p className="text-xs text-ink/60">
              Page{" "}
              <span className="font-medium text-ink">{currentPage}</span> of{" "}
              {totalPages}
            </p>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="border border-pine/25 px-2.5 py-1.5 text-xs font-medium text-pine transition-colors hover:border-pine disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    );

  const chatPane =
    isDesktop && selected && detail ? (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {detail}
      </div>
    ) : (
      <div className="flex min-h-56 flex-1 items-center justify-center border border-dashed border-stone px-5 py-12 text-center">
        <div>
          <p className="font-display text-xl text-pine">Open a note</p>
          <p className="mt-1.5 text-sm text-ink/55">
            Choose a correspondence from the list.
          </p>
        </div>
      </div>
    );

  const showDesktopInbox = inboxOpen;
  const showDesktopChat = chatOpen;

  return (
    <div className="space-y-3 sm:space-y-4">
      <section className="grid grid-cols-2 gap-2 sm:gap-3.5">
        <DeskStatTile
          label="Inbox"
          value={counts.open}
          hint="Waiting to be claimed"
        />
        <DeskStatTile
          label="Settled"
          value={counts.settled}
          hint="Resolved or filed"
        />
      </section>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
        aria-label="Listening Desk views"
      >
        {(
          [
            { id: "desk" as const, label: "Desk" },
            { id: "insight" as const, label: "Insight" },
          ] as const
        ).map((tab) => {
          const active = pageView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPageView(tab.id)}
              className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                active ? "text-pine" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              {tab.label}
              <span
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      {pageView === "insight" ? (
        <DeskInsightGuide national={national} />
      ) : (
        <>
      {/* Command rail */}
      <div className="sticky top-[4.3rem] z-30 -mx-4 border-b border-stone bg-mist/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-mist/80 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="flex items-center gap-2">
          <div className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {LANES.map((item) => {
              const active = lane === item.id;
              const count = counts[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLane(item.id)}
                  aria-pressed={active}
                  className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium tracking-wide transition-colors ${
                    active
                      ? "bg-pine text-mist"
                      : "border border-stone text-ink/60 hover:border-pine/40 hover:text-pine"
                  }`}
                >
                  {item.id === "open" && counts.open > 0 ? (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${active ? "bg-celadon" : "bg-celadon animate-pulse-soft"}`}
                      aria-hidden
                    />
                  ) : null}
                  {item.label}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setRefineOpen((v) => !v)}
            aria-expanded={refineOpen}
            className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              refineOpen || activeFilters > 0
                ? "border border-pine/40 bg-pine/5 text-pine"
                : "border border-stone text-ink/60 hover:border-pine/40 hover:text-pine"
            }`}
          >
            Refine
            {activeFilters > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center bg-celadon px-1 text-[0.6rem] font-semibold tabular-nums text-pine">
                {activeFilters}
              </span>
            ) : null}
          </button>
        </div>

        {refineOpen ? (
          <div className="animate-disclose mt-2 grid gap-2 border border-stone bg-white/60 p-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, parish, SOD-…"
              className="border border-stone bg-white/70 px-2.5 py-1.5 text-sm outline-none focus:border-pine sm:col-span-2 lg:col-span-2"
              aria-label="Search tickets"
            />
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="border border-stone bg-white/70 px-2.5 py-1.5 text-sm outline-none focus:border-pine"
              aria-label="Filter by topic"
            >
              <option value="all">All topics</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
            {national ? (
              <select
                value={parishFilter}
                onChange={(e) => setParishFilter(e.target.value)}
                className="border border-stone bg-white/70 px-2.5 py-1.5 text-sm outline-none focus:border-pine"
                aria-label="Filter by parish"
              >
                <option value="all">All parishes</option>
                <option value="unlinked">Unlinked guests</option>
                {parishOptions.map((parish) => (
                  <option key={parish.id} value={parish.id}>
                    {parish.name}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value as Owner)}
              className="border border-stone bg-white/70 px-2.5 py-1.5 text-sm outline-none focus:border-pine"
              aria-label="Filter by owner"
            >
              <option value="all">Anyone</option>
              <option value="mine">Mine</option>
              <option value="unclaimed">Unclaimed</option>
              <option value="guests">By email (guests)</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="border border-stone bg-white/70 px-2.5 py-1.5 text-sm outline-none focus:border-pine"
              aria-label="Sort tickets"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="urgent">Urgent first</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTopicFilter("all");
                setParishFilter("all");
                setOwner("all");
                setSort("newest");
              }}
              className="border border-stone px-2.5 py-1.5 text-sm text-ink/60 transition-colors hover:border-pine/40 hover:text-pine"
            >
              Clear refinements
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink/50">
          {filtered.length === 0
            ? "No notes shown"
            : `Showing ${rangeFrom}–${rangeTo} of ${filtered.length}`}
          {counts.open > 0 ? ` · ${counts.open} new in the inbox` : ""}
          {!national ? " · your parish only" : null}
          <span className="hidden lg:inline"> · ↑ ↓ to move between notes</span>
        </p>
        <div className="hidden items-center gap-2 lg:flex">
          <PanelToggle
            pressed={showDesktopInbox}
            onClick={toggleInbox}
            label={showDesktopInbox ? "Hide inbox" : "Show inbox"}
            side="left"
            count={filtered.length}
          />
          <PanelToggle
            pressed={showDesktopChat}
            onClick={toggleChat}
            label={showDesktopChat ? "Hide chat" : "Show chat"}
            side="right"
          />
        </div>
      </div>

      {/* Desktop split */}
      <div className="hidden min-h-[min(68vh,38rem)] gap-3 lg:flex lg:items-stretch">
        <div
          className={`min-w-0 transition-[flex,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            showDesktopInbox
              ? showDesktopChat
                ? "w-auto flex-[0_0_20rem] xl:flex-[0_0_22rem]"
                : "w-full flex-1"
              : "w-12 flex-none"
          }`}
        >
          {showDesktopInbox ? (
            <div className="flex h-full flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Inbox
                </p>
                <button
                  type="button"
                  onClick={toggleInbox}
                  className="inline-flex h-7 items-center gap-1.5 border border-stone px-2 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/55 transition-colors hover:border-pine/40 hover:text-pine"
                  aria-label="Hide inbox"
                >
                  Hide
                  <CollapseChevron side="left" />
                </button>
              </div>
              {inboxList}
            </div>
          ) : (
            <CollapsedRail
              label="Inbox"
              count={filtered.length}
              side="left"
              onExpand={toggleInbox}
              hint={selected ? selected.name : "Browse notes"}
            />
          )}
        </div>

        <div
          className={`min-w-0 transition-[flex,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            showDesktopChat ? "flex-1" : "w-12 flex-none"
          }`}
        >
          {showDesktopChat ? (
            <div className="flex h-full flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Conversation
                </p>
                <button
                  type="button"
                  onClick={toggleChat}
                  className="inline-flex h-7 items-center gap-1.5 border border-stone px-2 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/55 transition-colors hover:border-pine/40 hover:text-pine"
                  aria-label="Hide chat"
                >
                  Hide
                  <CollapseChevron side="right" />
                </button>
              </div>
              {chatPane}
            </div>
          ) : (
            <CollapsedRail
              label="Chat"
              side="right"
              onExpand={toggleChat}
              hint={selected ? selected.reference : "Open a thread"}
            />
          )}
        </div>
      </div>

      {!showDesktopInbox && !showDesktopChat ? (
        <div className="hidden border border-dashed border-pine/25 bg-pine/[0.03] px-5 py-8 text-center lg:block">
          <p className="font-display text-xl text-pine">Focus stage</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink/55">
            Both panes are tucked away. Reveal the inbox to pick a note, or the
            chat to keep writing.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={toggleInbox}
              className="bg-pine px-3.5 py-2 text-sm font-medium text-mist transition-colors hover:bg-celadon"
            >
              Show inbox
            </button>
            <button
              type="button"
              onClick={toggleChat}
              className="border border-pine/30 px-3.5 py-2 text-sm font-medium text-pine transition-colors hover:border-pine hover:bg-stone/40"
            >
              Show chat
            </button>
          </div>
        </div>
      ) : null}

      {/* Mobile inbox (master list) */}
      <div className="flex min-h-[min(55vh,28rem)] flex-col lg:hidden">
        {inboxList}
      </div>

      {/* Mobile chat sheet — fixed stage so transcript scrolls and composer stays visible */}
      {sheetOpen && selected && !isDesktop ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-mist pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-stone px-3 py-2.5">
            <button
              type="button"
              onClick={closeSheet}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-stone text-pine"
              aria-label="Back to inbox"
            >
              <span aria-hidden>←</span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm text-pine">
                {selected.name}
              </p>
              <p className="truncate font-mono text-[0.6rem] text-ink/45">
                {selected.reference} · {selected.topic}
                {selected.parish_name ? ` · ${selected.parish_name}` : ""}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-pine">
              <span
                className={`h-1.5 w-1.5 rounded-full ${statusDotClass(selected.status)}`}
                aria-hidden
              />
              {STATUS_META[selected.status].label}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {detail}
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 p-4 backdrop-blur-[2px] sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-ticket-title"
            className="animate-sheet-up w-full max-w-md border border-stone bg-mist p-5 shadow-xl sm:p-6"
          >
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Remove from desk
            </p>
            <h3
              id="delete-ticket-title"
              className="mt-1.5 font-display text-xl text-pine sm:text-2xl"
            >
              Delete {pendingDelete.reference}?
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
              This permanently removes the note from {pendingDelete.name} and
              any staff margin notes.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="border border-stone px-3.5 py-2 text-sm text-ink/70"
              >
                Keep
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const id = pendingDelete.id;
                  run(async () => {
                    const result = await deleteTicket(id);
                    if (result.ok) {
                      setPendingDelete(null);
                      setSheetOpen(false);
                      if (selectedId === id) setSelectedId(null);
                    }
                    return result;
                  });
                }}
                className="bg-[#3a1f1f] px-3.5 py-2 text-sm font-medium text-red-50 disabled:opacity-60"
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}

function groupTicketsByEmail(tickets: TicketWithMeta[]) {
  const map = new Map<string, TicketWithMeta[]>();
  for (const ticket of tickets) {
    const key = ticket.email.trim().toLowerCase();
    const list = map.get(key) ?? [];
    list.push(ticket);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([email, groupTickets]) => ({ email, tickets: groupTickets }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

function TicketRow({
  ticket,
  active,
  mine,
  showRelative,
  showParish,
  onOpen,
}: {
  ticket: TicketWithMeta;
  active: boolean;
  mine: boolean;
  showRelative: boolean;
  showParish: boolean;
  onOpen: () => void;
}) {
  const unread = ticket.status === "open";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={`group relative flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
          active ? "bg-pine text-mist" : "hover:bg-white/60"
        }`}
      >
        <span
          className={`absolute inset-y-0 left-0 w-0.5 transition-opacity ${
            active ? "bg-celadon opacity-100" : "bg-celadon opacity-0"
          }`}
          aria-hidden
        />
        <span
          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
            active ? "bg-celadon" : statusDotClass(ticket.status)
          }`}
          aria-hidden
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={`truncate text-sm leading-tight ${unread ? "font-semibold" : "font-medium"} ${
                active ? "text-mist" : "text-ink"
              }`}
            >
              {ticket.name}
            </span>
            <span
              className={`shrink-0 text-[0.65rem] tabular-nums ${
                active ? "text-mist/60" : "text-ink/45"
              }`}
            >
              {showRelative
                ? formatTicketRelative(latestTicketActivityAt(ticket))
                : formatTicketDay(latestTicketActivityAt(ticket))}
            </span>
          </span>

          <span
            className={`mt-0.5 block truncate text-[0.7rem] ${
              active ? "text-mist/70" : "text-ink/55"
            }`}
          >
            {latestTicketSnippet(ticket)}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              className={`text-[0.58rem] uppercase tracking-[0.12em] ${
                active ? "text-celadon" : "text-celadon/90"
              }`}
            >
              {ticket.topic}
            </span>
            <span
              className={`font-mono text-[0.58rem] ${
                active ? "text-mist/50" : "text-ink/35"
              }`}
            >
              {ticket.reference}
            </span>
            {showParish && ticket.parish_name ? (
              <span
                className={`text-[0.58rem] uppercase tracking-[0.1em] ${
                  active ? "text-mist/65" : "text-ink/45"
                }`}
              >
                {ticket.parish_name}
              </span>
            ) : null}
            {ticket.batch_label ? (
              <span
                className={`text-[0.58rem] uppercase tracking-[0.1em] ${
                  active ? "text-mist/55" : "text-ink/40"
                }`}
              >
                {ticket.batch_label}
              </span>
            ) : null}
            {ticket.priority === "high" ? (
              <span
                className={`text-[0.58rem] font-semibold uppercase tracking-[0.12em] ${
                  active ? "text-celadon" : URGENT_TEXT
                }`}
              >
                Urgent
              </span>
            ) : null}
            {mine ? (
              <span
                className={`text-[0.58rem] uppercase tracking-[0.12em] ${
                  active ? "text-mist/70" : "text-pine/70"
                }`}
              >
                Mine
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function TicketDetail({
  ticket,
  currentAdminId,
  pending,
  tab,
  onTab,
  noteDraft,
  onNoteDraft,
  onSubmitNote,
  emailSubject,
  onEmailSubject,
  emailMessage,
  onEmailMessage,
  onSubmitEmail,
  onStatus,
  onPriority,
  onClaim,
  onRelease,
  onDelete,
  onCopy,
  variant = "desktop",
}: {
  ticket: TicketWithMeta;
  currentAdminId: string;
  pending: boolean;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  noteDraft: string;
  onNoteDraft: (value: string) => void;
  onSubmitNote: (event: FormEvent<HTMLFormElement>) => void;
  emailSubject: string;
  onEmailSubject: (value: string) => void;
  emailMessage: string;
  onEmailMessage: (value: string) => void;
  onSubmitEmail: (event: FormEvent<HTMLFormElement>) => void;
  onStatus: (status: TicketStatus) => void;
  onPriority: () => void;
  onClaim: () => void;
  onRelease: () => void;
  onDelete: () => void;
  onCopy: (value: string, label: string) => void;
  variant?: "desktop" | "sheet";
}) {
  const portalOwned = Boolean(ticket.user_id);
  const intakePortal = ticket.intake_source === "portal";
  const channelLabel = intakePortal
    ? "Student portal"
    : portalOwned
      ? "Public form · linked account"
      : "Public / guest form";
  const channelBadge = intakePortal
    ? "Portal"
    : portalOwned
      ? "Linked"
      : "Guest";
  const mine = ticket.assigned_to === currentAdminId;
  const sheet = variant === "sheet";
  const chatHeightClass = "min-h-0";
  const chatPaneClass = "min-h-0 flex-1 border-0";

  const threadMessages = useMemo<SupportChatMessage[]>(() => {
    const notes = ticket.notes ?? [];
    const shared = notes.filter((note) => note.is_internal === false);
    const opening: SupportChatMessage = {
      id: `${ticket.id}-opening`,
      body: ticket.message,
      createdAt: ticket.created_at,
      author: ticket.name,
      side: "theirs",
      badge: channelBadge,
    };

    const followUps = shared.map(
      (note): SupportChatMessage => ({
        id: note.id,
        body: note.body,
        createdAt: note.created_at,
        author: note.from_student
          ? note.author_name || ticket.name
          : note.author_name || note.author_email || "Listening Desk",
        side: note.from_student ? "theirs" : "mine",
        tone: note.delivery_channel === "email" ? "email" : "portal",
        subject: note.email_subject,
        badge: note.from_student
          ? portalOwned
            ? "Student"
            : "Guest"
          : note.delivery_channel === "email"
            ? "Email"
            : "Desk",
      }),
    );

    return [opening, ...followUps];
  }, [ticket, portalOwned, channelBadge]);

  const emailNotes = useMemo(
    () => (ticket.notes ?? []).filter((note) => note.delivery_channel === "email"),
    [ticket.notes],
  );

  const emailMessages = useMemo<SupportChatMessage[]>(
    () =>
      emailNotes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.created_at,
        author: note.author_name || note.author_email || "You",
        side: "mine" as const,
        tone: "email" as const,
        subject: note.email_subject,
        badge: "Sent email",
      })),
    [emailNotes],
  );

  const marginNotes = useMemo(
    () =>
      (ticket.notes ?? []).filter(
        (note) =>
          note.is_internal !== false && note.delivery_channel !== "email",
      ),
    [ticket.notes],
  );

  const marginMessages = useMemo<SupportChatMessage[]>(
    () =>
      marginNotes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.created_at,
        author: note.author_name || note.author_email || "Staff",
        side: "mine" as const,
        tone: "margin" as const,
        badge: "Internal",
      })),
    [marginNotes],
  );

  const tabs: { id: DetailTab; label: string; badge?: number }[] = [
    { id: "note", label: portalOwned ? "Thread" : "Note" },
    { id: "email", label: "Email", badge: emailNotes.length || undefined },
    { id: "margin", label: "Margin", badge: marginNotes.length },
    { id: "details", label: "Details" },
  ];

  return (
    <article
      aria-busy={pending}
      className={`animate-panel-in relative flex min-h-0 flex-col bg-mist/70 ${
        sheet ? "h-full border-0" : "h-full border border-stone"
      }`}
    >
      <header
        className={`shrink-0 border-b border-stone ${
          sheet ? "hidden" : "px-3 py-3 sm:px-5 sm:py-3.5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <div className="min-w-0">
            {(ticket.parish_name || ticket.batch_label) && (
              <p className="text-[0.65rem] font-medium tracking-wide text-celadon">
                {[
                  ticket.parish_name
                    ? `Parish: ${ticket.parish_name}`
                    : null,
                  ticket.batch_label ? `Batch: ${ticket.batch_label}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <p className="font-mono text-[0.7rem] tracking-wide text-ink/45">
              {ticket.reference}
            </p>
            <h2 className="mt-0.5 font-display text-xl leading-tight tracking-[-0.02em] text-pine sm:text-2xl">
              {ticket.name}
            </h2>
            <p className="mt-0.5 truncate text-xs text-ink/60 sm:text-sm">
              {ticket.email}
            </p>
          </div>
          <div className="flex flex-col items-start gap-0.5 sm:items-end">
            <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-pine">
              <span
                className={`h-1.5 w-1.5 rounded-full ${statusDotClass(ticket.status)}`}
                aria-hidden
              />
              {STATUS_META[ticket.status].path}
            </span>
            <p className="text-[0.7rem] text-ink/45">
              {formatTicketWhen(ticket.created_at)}
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.58rem] font-medium uppercase tracking-[0.16em] text-celadon">
            {ticket.topic}
          </span>
          {portalOwned ? (
            <span className="text-[0.58rem] font-medium uppercase tracking-[0.14em] text-pine">
              {channelBadge}
            </span>
          ) : (
            <span className="text-[0.58rem] font-medium uppercase tracking-[0.14em] text-ink/45">
              Guest
            </span>
          )}
          {ticket.priority === "high" ? (
            <span
              className={`text-[0.58rem] font-semibold uppercase tracking-[0.14em] ${URGENT_TEXT}`}
            >
              Urgent
            </span>
          ) : null}
        </div>
      </header>

      {/* Path stepper */}
      <div
        className={`shrink-0 border-b border-stone bg-black/[0.02] ${
          sheet ? "px-3 py-2" : "px-3 py-2.5 sm:px-5"
        }`}
      >
        <p className="text-[0.55rem] font-medium uppercase tracking-[0.16em] text-ink/40">
          Move along the path
        </p>
        <div className="-mx-1 mt-1.5 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TICKET_STATUSES.map((status) => {
            const current = ticket.status === status;
            return (
              <button
                key={status}
                type="button"
                disabled={pending || current}
                onClick={() => onStatus(status)}
                title={STATUS_META[status].hint}
                className={`shrink-0 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  current
                    ? "bg-pine text-mist"
                    : "border border-stone bg-white/60 text-ink/65 hover:border-pine/40 hover:text-pine disabled:opacity-50"
                }`}
              >
                {STATUS_META[status].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary actions */}
      <div
        className={`flex shrink-0 flex-wrap gap-1.5 border-b border-stone ${
          sheet ? "px-3 py-2" : "px-3 py-2.5 sm:px-5"
        }`}
      >
        {mine ? (
          <button
            type="button"
            disabled={pending}
            onClick={onRelease}
            className="flex-1 border border-stone px-3 py-2.5 text-sm text-ink/70 transition-colors hover:border-pine/40 hover:text-pine disabled:opacity-50 sm:flex-none"
          >
            Release
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={onClaim}
            className="flex-1 border border-pine/30 bg-pine/5 px-3 py-2.5 text-sm font-medium text-pine transition-colors hover:bg-pine hover:text-mist disabled:opacity-50 sm:flex-none"
          >
            Claim
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onPriority}
          aria-pressed={ticket.priority === "high"}
          className={`flex-1 border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 sm:flex-none ${
            ticket.priority === "high"
              ? "border-pine bg-pine text-mist"
              : "border-stone text-ink/70 hover:border-pine/40 hover:text-pine"
          }`}
        >
          {ticket.priority === "high" ? "Urgent" : "Mark urgent"}
        </button>
        <a
          href={`mailto:${ticket.email}?subject=${encodeURIComponent(`Re: ${ticket.reference} — School of Disciples`)}`}
          className="flex-1 bg-pine px-3 py-2.5 text-center text-sm font-medium text-mist transition-colors hover:bg-celadon sm:flex-none"
        >
          Reply by email
        </a>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-stone">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            aria-selected={tab === item.id}
            role="tab"
            className={`relative flex-1 px-3 py-3 text-sm font-medium transition-colors ${
              tab === item.id
                ? "text-pine"
                : "text-ink/50 hover:text-pine/80"
            }`}
          >
            {item.label}
            {item.badge ? (
              <span className="ml-1.5 tabular-nums text-xs text-ink/40">
                {item.badge}
              </span>
            ) : null}
            <span
              className={`absolute inset-x-0 bottom-0 h-0.5 transition-opacity ${
                tab === item.id ? "bg-celadon opacity-100" : "opacity-0"
              }`}
              aria-hidden
            />
          </button>
        ))}
      </div>

      {tab === "note" ? (
        <div className="animate-disclose flex min-h-0 flex-1 flex-col">
          <SupportChatPane
            className={chatPaneClass}
            heightClass={chatHeightClass}
            footer={
              portalOwned ? (
                <SupportChatComposer
                  value={noteDraft}
                  onChange={onNoteDraft}
                  onSubmit={onSubmitNote}
                  pending={pending}
                  maxLength={NOTE_MAX}
                  placeholder="Reply in the student portal chat…"
                  submitLabel="Send reply"
                />
              ) : (
                <div className="px-4 py-3 text-center text-xs leading-relaxed text-ink/50">
                  Guest notes are answered by email. Open the Email tab to send
                  a branded NoReply reply.
                </div>
              )
            }
          >
            <SupportChatTranscript
              messages={threadMessages}
              emptyLabel="No thread yet"
              emptyHint="The opening note will appear here."
            />
          </SupportChatPane>
        </div>
      ) : null}

      {tab === "email" ? (
        <div className="animate-disclose flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 border-b border-stone px-3 py-2.5 text-xs leading-relaxed text-ink/50 sm:px-5 sm:py-3">
            Send a branded{" "}
            <strong className="font-medium text-ink/70">NoReply</strong> email
            to <span className="font-medium text-pine">{ticket.email}</span>.
            Only edit the subject and message — layout and instructions are
            templated.
          </p>

          <SupportChatPane
            className={chatPaneClass}
            heightClass={chatHeightClass}
            footer={
              <form onSubmit={onSubmitEmail} className="space-y-3 px-3 py-3 sm:px-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    Subject
                  </span>
                  <input
                    value={emailSubject}
                    onChange={(e) => onEmailSubject(e.target.value)}
                    maxLength={180}
                    className="w-full border border-stone bg-white/85 px-3 py-2.5 text-sm outline-none focus:border-pine"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    Message
                  </span>
                  <textarea
                    value={emailMessage}
                    onChange={(e) => onEmailMessage(e.target.value)}
                    maxLength={5000}
                    rows={sheet ? 3 : 4}
                    placeholder="Write the body of your reply. Greeting and NoReply footer are added automatically…"
                    className="w-full resize-y border border-stone bg-white/85 px-3 py-2.5 text-sm outline-none focus:border-pine"
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-ink/45">
                    {emailMessage.length}/5000 · delivers via sod_portal_be
                  </p>
                  <button
                    type="submit"
                    disabled={
                      pending ||
                      emailSubject.trim().length < 3 ||
                      emailMessage.trim().length < 10
                    }
                    className="inline-flex items-center gap-2 bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-50"
                  >
                    {pending ? "Sending…" : "Send NoReply email"}
                  </button>
                </div>
              </form>
            }
          >
            <SupportChatTranscript
              messages={emailMessages}
              emptyLabel="No emails sent yet"
              emptyHint="Sent NoReply mail will land here like outbound chat."
            />
          </SupportChatPane>
        </div>
      ) : null}

      {tab === "margin" ? (
        <div className="animate-disclose flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 border-b border-stone px-3 py-2.5 text-xs text-ink/50 sm:px-5 sm:py-3">
            Internal notes stay on the desk — never shown in the student
            portal.
          </p>

          <SupportChatPane
            className={chatPaneClass}
            heightClass={chatHeightClass}
            footer={
              <SupportChatComposer
                value={noteDraft}
                onChange={onNoteDraft}
                onSubmit={onSubmitNote}
                pending={pending}
                maxLength={NOTE_MAX}
                placeholder="Jot a margin note for the team…"
                submitLabel="Save note"
              />
            }
          >
            <SupportChatTranscript
              messages={marginMessages}
              emptyLabel="No staff notes yet"
              emptyHint="Keep private desk context here."
            />
          </SupportChatPane>
        </div>
      ) : null}

      {tab === "details" ? (
        <div className="animate-disclose min-h-0 flex-1 overflow-y-auto px-3 py-3.5 sm:px-5 sm:py-4">
          <dl className="divide-y divide-stone border border-stone bg-white/40">
            <Row label="Parish">
              {ticket.parish_name ?? "Unlinked — no matching enrolment"}
            </Row>
            <Row label="Batch">{ticket.batch_label ?? "—"}</Row>
            <Row label="Channel">{channelLabel}</Row>
            <Row label="Owner">
              {ticket.assigned_to
                ? mine
                  ? "You"
                  : ticket.assignee_name ||
                    ticket.assignee_email ||
                    "Another admin"
                : "Unclaimed"}
            </Row>
            <Row label="Opened">{formatTicketWhen(ticket.created_at)}</Row>
            <Row label="Last touched">{formatTicketWhen(ticket.updated_at)}</Row>
            {ticket.resolved_at ? (
              <Row label="Settled">{formatTicketWhen(ticket.resolved_at)}</Row>
            ) : null}
            <Row label="Status">
              {STATUS_META[ticket.status].label} —{" "}
              {STATUS_META[ticket.status].hint}
            </Row>
          </dl>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onCopy(ticket.email, "Email")}
              className="border border-stone px-3 py-1.5 text-sm text-ink/65 transition-colors hover:border-pine/40 hover:text-pine"
            >
              Copy email
            </button>
            <button
              type="button"
              onClick={() => onCopy(ticket.reference, "Reference")}
              className="border border-stone px-3 py-1.5 text-sm text-ink/65 transition-colors hover:border-pine/40 hover:text-pine"
            >
              Copy reference
            </button>
          </div>

          <div className="mt-5 border border-dashed border-[#8c3b2f]/30 px-3.5 py-3.5">
            <p className="text-sm font-medium text-ink">Remove this note</p>
            <p className="mt-1 text-xs leading-relaxed text-ink/55">
              Deleting is permanent and also removes staff margin notes.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className={`mt-3 border border-[#8c3b2f]/40 px-3 py-2 text-sm font-medium transition-colors hover:bg-[#3a1f1f] hover:text-red-50 disabled:opacity-50 ${URGENT_TEXT}`}
            >
              Delete ticket
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
        {label}
      </dt>
      <dd className="text-sm text-ink/75">{children}</dd>
    </div>
  );
}

function PanelToggle({
  pressed,
  onClick,
  label,
  side,
  count,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  side: "left" | "right";
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={label}
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] transition-colors ${
        pressed
          ? "border-pine/35 bg-pine/5 text-pine"
          : "border-stone text-ink/45 hover:border-pine/35 hover:text-pine"
      }`}
    >
      {side === "left" ? <CollapseChevron side="left" /> : null}
      <span>{side === "left" ? "Inbox" : "Chat"}</span>
      {typeof count === "number" ? (
        <span className="tabular-nums opacity-70">{count}</span>
      ) : null}
      {side === "right" ? <CollapseChevron side="right" /> : null}
    </button>
  );
}

function CollapseChevron({ side }: { side: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3 w-3 ${side === "right" ? "rotate-180" : ""}`}
      fill="none"
      aria-hidden
    >
      <path
        d="M10 3.5 5.5 8 10 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapsedRail({
  label,
  side,
  onExpand,
  hint,
  count,
}: {
  label: string;
  side: "left" | "right";
  onExpand: () => void;
  hint: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Show ${label.toLowerCase()}`}
      className="group flex h-full min-h-[min(70vh,36rem)] w-12 flex-col items-center gap-4 border border-stone bg-pine text-mist transition-colors hover:bg-celadon"
    >
      <span className="mt-4 inline-flex h-8 w-8 items-center justify-center border border-mist/25 bg-mist/[0.08]">
        <CollapseChevron side={side === "left" ? "right" : "left"} />
      </span>
      <span
        className="flex flex-1 items-center justify-center"
        style={{ writingMode: "vertical-rl" }}
      >
        <span className="rotate-180 text-[0.7rem] font-medium uppercase tracking-[0.22em]">
          {label}
          {typeof count === "number" ? ` · ${count}` : ""}
        </span>
      </span>
      <span
        className="mb-4 max-h-28 overflow-hidden text-[0.6rem] tracking-wide text-mist/55"
        style={{ writingMode: "vertical-rl" }}
      >
        <span className="rotate-180 truncate">{hint}</span>
      </span>
    </button>
  );
}

function DeskInsightGuide({ national }: { national: boolean }) {
  const points = national
    ? [
        {
          title: "Your desk",
          body: "You see every support note across the UK — including guests with no enrolment link.",
        },
        {
          title: "Parish & batch",
          body: "Parish and batch come from the sender’s enrolment. Use Refine to filter by parish. Unlinked guests have no parish tag.",
        },
        {
          title: "Work a note",
          body: "Claim it, reply in-thread or by email, keep a private staff margin. Settled notes leave the active path.",
        },
      ]
    : [
        {
          title: "Your desk",
          body: "You only see notes tied to your parish — students linked by enrolment parish, or unlinked guest emails that match an enrolment at your church. Linked student tickets do not open via email alone. Unlinked public guests stay with the national desk.",
        },
        {
          title: "Parish & batch",
          body: "Scope is automatic from enrolment. Batch is context only; it does not change who can read the ticket.",
        },
        {
          title: "Work a note",
          body: "Claim, reply, or email within your parish inbox. You cannot open notes outside your parish.",
        },
      ];

  return (
    <div className="border border-stone bg-mist">
      <div className="border-b border-stone px-4 py-4 sm:px-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Insight
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          How the Desk works
        </h2>
        <p className="mt-1.5 text-sm text-ink/60">
          Desk:{" "}
          <span className="font-medium text-pine">
            {national ? "National / Master" : "Parish"}
          </span>
        </p>
      </div>
      <ul className="divide-y divide-stone">
        {points.map((point) => (
          <li key={point.title} className="px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-medium text-ink">{point.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              {point.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
