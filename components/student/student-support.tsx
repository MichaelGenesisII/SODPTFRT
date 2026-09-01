"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createStudentConversation,
  deleteStudentConversation,
  replyStudentConversation,
} from "@/app/student/support/actions";
import {
  SupportChatComposer,
  SupportChatPane,
  SupportChatTranscript,
  type SupportChatMessage,
} from "@/components/support/chat-thread";
import { useStudentSupportLive } from "@/components/student/support-live";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  formatTicketRelative,
  formatTicketWhen,
  isActiveTicket,
  latestTicketActivityAt,
  latestTicketSnippet,
  MESSAGE_MAX,
  NOTE_MAX,
  STATUS_META,
  SUPPORT_TOPICS,
  type TicketWithMeta,
} from "@/lib/tickets";
import type { StudentProfile } from "@/lib/student/types";
import { studentDisplayName } from "@/lib/student/types";
import { WhatsAppChatLink } from "@/components/support/whatsapp-chat-link";

type Panel = "inbox" | "compose";

type PendingConfirm =
  | { kind: "compose"; topic: string; message: string }
  | { kind: "delete"; ticket: TicketWithMeta };

const SUPPORT_INBOX_KEY = "sod-student-support-inbox-open";
const SUPPORT_CHAT_KEY = "sod-student-support-chat-open";
/** Split layout from large tablets up. */
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

export function StudentSupportDesk({
  profile,
  conversations,
}: {
  profile: StudentProfile;
  conversations: TicketWithMeta[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const { markTicketRead } = useStudentSupportLive();
  const isDesktop = useIsDesktop();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [panel, setPanel] = useState<Panel>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>(SUPPORT_TOPICS[0]);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const [inboxOpen, setInboxOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  /** Mobile: chat takes the full stage after a thread is opened. */
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  /** Hold selection across the post-create refresh before the new id is in `conversations`. */
  const pendingSelectRef = useRef<string | null>(null);

  useEffect(() => {
    const inbox = window.localStorage.getItem(SUPPORT_INBOX_KEY);
    const chat = window.localStorage.getItem(SUPPORT_CHAT_KEY);
    if (inbox === "0") setInboxOpen(false);
    if (inbox === "1") setInboxOpen(true);
    if (chat === "1") setChatOpen(true);
    if (chat === "0") setChatOpen(false);
  }, []);

  // Keep selection valid; on desktop optionally seed the first thread (chat stays closed).
  useEffect(() => {
    const pendingId = pendingSelectRef.current;
    if (pendingId) {
      if (conversations.some((item) => item.id === pendingId)) {
        pendingSelectRef.current = null;
        setSelectedId(pendingId);
      }
      // Wait for the new conversation to land — do not remap to another thread.
      return;
    }

    if (selectedId && conversations.some((item) => item.id === selectedId)) {
      return;
    }
    if (isDesktop) {
      setSelectedId(conversations[0]?.id ?? null);
    } else if (
      selectedId &&
      !conversations.some((item) => item.id === selectedId)
    ) {
      setSelectedId(null);
      setMobileChatOpen(false);
    }
  }, [conversations, selectedId, isDesktop]);

  useEffect(() => {
    if (!isDesktop) return;
    if (!selectedId) return;
    void markTicketRead(selectedId);
  }, [selectedId, markTicketRead, isDesktop]);

  useEffect(() => {
    if (isDesktop || !mobileChatOpen || !selectedId) return;
    void markTicketRead(selectedId);
  }, [mobileChatOpen, selectedId, markTicketRead, isDesktop]);

  useEffect(() => {
    if (isDesktop || !mobileChatOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isDesktop, mobileChatOpen]);

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const chatMessages = useMemo<SupportChatMessage[]>(() => {
    if (!selected) return [];
    const opening: SupportChatMessage = {
      id: `${selected.id}-opening`,
      body: selected.message,
      createdAt: selected.created_at,
      author: "You",
      side: "mine",
      badge: "Opening note",
    };
    const followUps = (selected.notes ?? [])
      .filter((note) => note.is_internal !== true)
      .map(
        (note): SupportChatMessage => ({
          id: note.id,
          body: note.body,
          createdAt: note.created_at,
          author: note.from_student
            ? "You"
            : note.author_name || "Listening Desk",
          side: note.from_student ? "mine" : "theirs",
          tone: note.delivery_channel === "email" ? "email" : "portal",
          subject: note.email_subject,
          badge: note.delivery_channel === "email" ? "Email" : null,
        }),
      );
    return [opening, ...followUps];
  }, [selected]);

  const activeCount = conversations.filter((item) =>
    isActiveTicket(item.status),
  ).length;

  function toggleInbox() {
    setInboxOpen((value) => {
      const next = !value;
      window.localStorage.setItem(SUPPORT_INBOX_KEY, next ? "1" : "0");
      return next;
    });
  }

  function toggleChat() {
    setChatOpen((value) => {
      const next = !value;
      window.localStorage.setItem(SUPPORT_CHAT_KEY, next ? "1" : "0");
      return next;
    });
  }

  function selectConversation(id: string) {
    setSelectedId(id);
    setPanel("inbox");
    if (isDesktop) {
      setChatOpen(true);
      window.localStorage.setItem(SUPPORT_CHAT_KEY, "1");
    } else {
      setMobileChatOpen(true);
    }
  }

  function backToInbox() {
    setMobileChatOpen(false);
  }

  function submitCompose(topicValue: string, messageValue: string) {
    setBusyLabel("Opening conversation…");
    startTransition(async () => {
      try {
        const result = await createStudentConversation(topicValue, messageValue);
        if (!result.ok) {
          error(result.message);
          return;
        }
        success(result.message, "Conversation opened");
        setMessage("");
        setPanel("inbox");
        setPendingConfirm(null);
        if (result.ticketId) {
          pendingSelectRef.current = result.ticketId;
          setSelectedId(result.ticketId);
          if (isDesktop) {
            setChatOpen(true);
            window.localStorage.setItem(SUPPORT_CHAT_KEY, "1");
          } else {
            setMobileChatOpen(true);
          }
        }
        router.refresh();
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function onCompose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 10) return;
    setPendingConfirm({ kind: "compose", topic, message: trimmed });
  }
  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;

    if (pendingConfirm.kind === "compose") {
      submitCompose(pendingConfirm.topic, pendingConfirm.message);
      return;
    }

    setBusyLabel("Removing conversation…");
    startTransition(async () => {
      try {
        const result = await deleteStudentConversation(pendingConfirm.ticket.id);
        if (!result.ok) {
          error(result.message);
          return;
        }
        success(result.message);
        setPendingConfirm(null);
        setSelectedId(null);
        setMobileChatOpen(false);
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function onReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusyLabel("Sending message…");
    startTransition(async () => {
      try {
        const result = await replyStudentConversation(selected.id, reply);
        if (!result.ok) {
          error(result.message);
          return;
        }
        success(result.message);
        setReply("");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  const showDesktopInbox = inboxOpen;
  const showDesktopChat = chatOpen;

  const inboxList = (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-stone bg-mist/50">
      <div className="flex items-center justify-between gap-3 border-b border-stone px-4 py-3">
        <p className="text-sm text-ink/55">
          {conversations.length === 0
            ? "No conversations yet"
            : `${conversations.length} in your inbox`}
        </p>
        <button
          type="button"
          onClick={() => setPanel("compose")}
          className="shrink-0 text-xs font-medium text-pine underline decoration-pine/30 underline-offset-4 lg:hidden"
        >
          New
        </button>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-stone overflow-y-auto overscroll-contain">
        {conversations.length === 0 ? (
          <li className="px-5 py-12 text-center">
            <p className="font-display text-xl text-pine">Nothing here yet</p>
            <p className="mt-2 text-sm text-ink/55">
              Start a conversation when you need the Listening Desk.
            </p>
            <button
              type="button"
              onClick={() => setPanel("compose")}
              className="mt-5 bg-pine px-4 py-2.5 text-sm font-medium text-mist"
            >
              New conversation
            </button>
          </li>
        ) : (
          conversations.map((item) => {
            const active = isDesktop && item.id === selected?.id && chatOpen;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => selectConversation(item.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors active:bg-stone/50 ${
                    active ? "bg-pine text-mist" : "hover:bg-stone/40"
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center text-xs font-semibold ${
                      active ? "bg-mist/15 text-mist" : "bg-pine/10 text-pine"
                    }`}
                    aria-hidden
                  >
                    {item.topic.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {item.topic}
                      </span>
                      <span
                        className={`shrink-0 text-[0.65rem] tabular-nums ${
                          active ? "text-mist/55" : "text-ink/40"
                        }`}
                      >
                        {formatTicketRelative(latestTicketActivityAt(item))}
                      </span>
                    </span>
                    <span
                      className={`mt-0.5 block truncate font-mono text-[0.65rem] ${
                        active ? "text-mist/55" : "text-ink/40"
                      }`}
                    >
                      {item.reference} · {STATUS_META[item.status].path}
                    </span>
                    <span
                      className={`mt-1 line-clamp-2 text-xs leading-relaxed ${
                        active ? "text-mist/70" : "text-ink/55"
                      }`}
                    >
                      {latestTicketSnippet(item)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );

  const chatPane = (
    <section
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden border border-stone bg-mist lg:border"
      aria-busy={busy && Boolean(selected)}
    >
      <DeskLoaderOverlay
        active={
          busy &&
          Boolean(selected) &&
          (Boolean(busyLabel?.startsWith("Sending")) ||
            Boolean(busyLabel?.startsWith("Removing")))
        }
        label={busyLabel ?? "Working…"}
      />
      {!selected ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Chat
          </p>
          <p className="mt-3 font-display text-2xl text-pine">
            Choose a conversation
          </p>
          <p className="mt-2 max-w-sm text-sm text-ink/60">
            Pick a thread from the inbox, or open a new one.
          </p>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-stone bg-mist px-3 py-3 sm:px-5 sm:py-3.5">
            <div className="flex items-start gap-2 sm:gap-3">
              {!isDesktop ? (
                <button
                  type="button"
                  onClick={backToInbox}
                  className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center border border-stone text-pine"
                  aria-label="Back to inbox"
                >
                  <BackIcon />
                </button>
              ) : null}
              <span
                className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center bg-pine text-xs font-semibold tracking-wide text-mist sm:inline-flex"
                aria-hidden
              >
                LD
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg text-pine sm:text-xl">
                      {selected.topic}
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-ink/50">
                      Listening Desk · {selected.reference}
                    </p>
                    <p className="mt-1 hidden text-[0.65rem] text-ink/40 sm:block">
                      Opened {formatTicketWhen(selected.created_at)} · updated{" "}
                      {formatTicketRelative(selected.updated_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-pine">
                      <span className="h-1.5 w-1.5 bg-celadon" aria-hidden />
                      {STATUS_META[selected.status].label}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setPendingConfirm({ kind: "delete", ticket: selected })
                      }
                      className="text-[0.7rem] font-medium text-red-800 underline decoration-red-800/30 underline-offset-4 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <SupportChatPane
            className="min-h-0 flex-1 border-0"
            heightClass={
              isDesktop ? "min-h-0" : "min-h-0 max-h-none"
            }
            footer={
              <SupportChatComposer
                value={reply}
                onChange={setReply}
                onSubmit={onReply}
                pending={busy}
                disabled={!isActiveTicket(selected.status)}
                maxLength={NOTE_MAX}
                placeholder="Message the Listening Desk…"
                settledHint="This conversation is settled. Open a new one if you need more help."
              />
            }
          >
            <SupportChatTranscript
              messages={chatMessages}
              emptyLabel="Conversation is empty"
              emptyHint="Your opening note will appear here."
            />
          </SupportChatPane>
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6" data-tour="student-support-desk">
      {/* Page chrome — compact on mobile, fuller on desktop */}
      <section className="animate-fade-rise">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon sm:text-[0.7rem]">
              Listening Desk
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.65rem,4vw,2.7rem)] tracking-[-0.02em] text-pine">
              Support
            </h1>
            <p className="mt-1.5 hidden max-w-xl text-sm leading-relaxed text-ink/65 sm:mt-2 sm:block sm:text-base">
              Chat with the School from inside your portal. Public support notes
              with this email are imported here. Delete any conversation anytime.
              Something broken?{" "}
              <Link href="/student/report-bug" className="font-medium text-pine underline">
                Report a bug
              </Link>
              . Prefer WhatsApp? <WhatsAppChatLink className="inline-flex items-center gap-1 font-medium text-pine underline decoration-pine/30 underline-offset-4" />
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setPanel(panel === "compose" ? "inbox" : "compose")
            }
            className="hidden shrink-0 bg-pine px-4 py-2.5 text-sm font-medium tracking-wide text-mist transition-colors hover:bg-celadon sm:inline-flex lg:px-5 lg:py-3"
          >
            {panel === "compose" ? "Back to inbox" : "New conversation"}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-px overflow-hidden border border-stone bg-stone">
        <Stat label="Threads" value={conversations.length} />
        <Stat label="Open" value={activeCount} />
        <Stat
          label={isDesktop ? "Signed in as" : "You"}
          value={isDesktop ? studentDisplayName(profile) : profile.first_name}
          text
        />
      </section>

      {panel === "compose" ? (
        <form
          onSubmit={onCompose}
          className="relative animate-panel-in border border-stone bg-mist/70 px-4 py-5 sm:px-7 sm:py-6"
          aria-busy={busy && Boolean(busyLabel?.startsWith("Opening"))}
        >
          <DeskLoaderOverlay
            active={busy && Boolean(busyLabel?.startsWith("Opening"))}
            label={busyLabel ?? "Opening conversation…"}
          />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Start a thread
              </p>
              <h2 className="mt-1 font-display text-xl text-pine sm:text-2xl">
                What do you need help with?
              </h2>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPanel("inbox")}
              className="shrink-0 border border-stone px-3 py-2 text-xs font-medium text-pine disabled:opacity-50 sm:hidden"
            >
              Cancel
            </button>
          </div>

          <label className="mt-5 block sm:mt-6">
            <span className="mb-2 block text-sm font-medium text-ink">Topic</span>
            <select
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              disabled={busy}
              className="w-full border border-stone bg-white/70 px-4 py-3 text-sm outline-none focus:border-pine disabled:opacity-50"
            >
              {SUPPORT_TOPICS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block sm:mt-5">
            <span className="mb-2 block text-sm font-medium text-ink">
              Message
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={isDesktop ? 6 : 5}
              maxLength={MESSAGE_MAX}
              disabled={busy}
              placeholder="Share enough detail for the desk to help you…"
              className="w-full border border-stone bg-white/70 px-4 py-3 text-sm outline-none focus:border-pine disabled:opacity-50"
            />
            <span className="mt-1 block text-xs text-ink/45">
              {message.length}/{MESSAGE_MAX}
            </span>
          </label>

          <button
            type="submit"
            disabled={busy || message.trim().length < 10}
            className="mt-4 inline-flex min-h-[2.75rem] min-w-[10rem] w-full items-center justify-center bg-pine px-5 py-3 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-50 sm:mt-5 sm:w-auto"
          >
            {busy && busyLabel?.startsWith("Opening") ? (
              <DeskLoader label={busyLabel} tone="mist" />
            ) : (
              "Open conversation"
            )}
          </button>
        </form>
      ) : isDesktop ? (
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <PanelToggle
              pressed={inboxOpen}
              onClick={toggleInbox}
              label={inboxOpen ? "Hide conversations" : "Show conversations"}
              side="left"
              count={conversations.length}
              name="Conversations"
            />
            <PanelToggle
              pressed={chatOpen}
              onClick={toggleChat}
              label={chatOpen ? "Hide chat" : "Show chat"}
              side="right"
              name="Chat"
            />
          </div>

          <div className="flex min-h-[min(72vh,42rem)] items-stretch gap-4">
            <div
              className={`min-w-0 transition-[flex,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                showDesktopInbox
                  ? showDesktopChat
                    ? "w-auto flex-[0_0_22rem] xl:flex-[0_0_24rem]"
                    : "w-full flex-1"
                  : "w-12 flex-none"
              }`}
            >
              {showDesktopInbox ? (
                <div className="flex h-full flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                      Conversations
                    </p>
                    <button
                      type="button"
                      onClick={toggleInbox}
                      className="inline-flex h-8 items-center gap-1.5 border border-stone px-2.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/55 transition-colors hover:border-pine/40 hover:text-pine"
                      aria-label="Hide conversations"
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
                  count={conversations.length}
                  side="left"
                  onExpand={toggleInbox}
                  hint={selected ? selected.topic : "Your threads"}
                />
              )}
            </div>

            <div
              className={`min-w-0 transition-[flex,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                showDesktopChat ? "flex-1" : "w-12 flex-none"
              }`}
            >
              {showDesktopChat ? (
                <div className="flex h-full flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                      Conversation
                    </p>
                    <button
                      type="button"
                      onClick={toggleChat}
                      className="inline-flex h-8 items-center gap-1.5 border border-stone px-2.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/55 transition-colors hover:border-pine/40 hover:text-pine"
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
            <div className="border border-dashed border-pine/25 bg-pine/[0.03] px-6 py-10 text-center">
              <p className="font-display text-2xl text-pine">Quiet focus</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink/55">
                Both panes are tucked away. Bring back your conversations or the
                chat when you are ready.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={toggleInbox}
                  className="bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon"
                >
                  Show conversations
                </button>
                <button
                  type="button"
                  onClick={toggleChat}
                  className="border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine hover:bg-stone/40"
                >
                  Show chat
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {/* Mobile chat: fixed stage so transcript scrolls and composer stays on screen */}
          {mobileChatOpen && selected ? (
            <div className="fixed inset-x-0 bottom-0 top-[4.25rem] z-30 flex flex-col bg-mist pb-[env(safe-area-inset-bottom)] lg:hidden">
              {chatPane}
            </div>
          ) : (
            <div className="flex min-h-[min(60vh,32rem)] flex-col lg:hidden">
              {inboxList}
            </div>
          )}
        </>
      )}

      <DeskConfirmModal
        open={Boolean(pendingConfirm)}
        onClose={() => !busy && setPendingConfirm(null)}
        onConfirm={confirmPendingAction}
        eyebrow={
          pendingConfirm?.kind === "delete"
            ? "Remove from inbox"
            : "Start a thread"
        }
        title={
          pendingConfirm?.kind === "delete"
            ? `Delete ${pendingConfirm.ticket.reference}?`
            : "Open this conversation?"
        }
        body={
          pendingConfirm?.kind === "delete" ? (
            <>
              This permanently removes{" "}
              <span className="font-medium text-ink">
                {pendingConfirm.ticket.topic}
              </span>{" "}
              from your inbox. The Listening Desk may still have a record on
              their side.
            </>
          ) : pendingConfirm?.kind === "compose" ? (
            <>
              Your note about{" "}
              <span className="font-medium text-ink">
                {pendingConfirm.topic}
              </span>{" "}
              will reach the Listening Desk. You can keep chatting in this
              thread afterward.
            </>
          ) : null
        }
        confirmLabel={
          pendingConfirm?.kind === "delete"
            ? "Delete conversation"
            : "Open conversation"
        }
        destructive={pendingConfirm?.kind === "delete"}
        busy={busy}
        busyLabel={busyLabel ?? "Working…"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  text,
}: {
  label: string;
  value: string | number;
  text?: boolean;
}) {
  return (
    <div className="bg-mist px-3 py-3.5 sm:px-5 sm:py-5">
      <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45 sm:text-[0.65rem]">
        {label}
      </p>
      <p
        className={`mt-2 font-display leading-none text-pine sm:mt-3 ${
          text
            ? "truncate text-lg sm:text-2xl"
            : "text-2xl tabular-nums sm:text-4xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function PanelToggle({
  pressed,
  onClick,
  label,
  side,
  count,
  name,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  side: "left" | "right";
  count?: number;
  name: string;
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
      <span>{name}</span>
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

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M15 5.5 8.5 12 15 18.5"
        stroke="currentColor"
        strokeWidth="1.7"
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
