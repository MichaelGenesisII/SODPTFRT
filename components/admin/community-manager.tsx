"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  hideCommunityMessage,
  postDeskCommunityMessage,
  type CommunityAdminActionResult,
} from "@/app/admin/community/actions";
import {
  SupportChatComposer,
  SupportChatPane,
  SupportChatTranscript,
  type SupportChatMessage,
} from "@/components/support/chat-thread";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  COMMUNITY_BODY_MAX,
  LISTENING_DESK_LABEL,
  type CommunityMessage,
} from "@/lib/community/types";
import type { AdminProfile } from "@/lib/admin/profile";
import { isNationalAdmin } from "@/lib/admin/profile";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type CommunityManagerProps = {
  profile: AdminProfile;
  initialMessages: CommunityMessage[];
};

function toChatMessages(
  rows: CommunityMessage[],
  adminId: string,
): SupportChatMessage[] {
  return rows
    .filter((row) => !row.is_hidden)
    .map((row) => {
      const isDesk = row.author_kind === "admin";
      const mine = row.author_user_id === adminId;
      return {
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        author: isDesk
          ? mine
            ? "You"
            : LISTENING_DESK_LABEL
          : row.author_label,
        side: mine ? "mine" : "theirs",
        badge: isDesk && mine ? LISTENING_DESK_LABEL : null,
      };
    });
}

export function CommunityManager({
  profile,
  initialMessages,
}: CommunityManagerProps) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState(initialMessages);
  const [pendingHide, setPendingHide] = useState<SupportChatMessage | null>(
    null,
  );
  const national = isNationalAdmin(profile);

  const visible = useMemo(
    () => toChatMessages(rows, profile.id),
    [rows, profile.id],
  );

  const hiddenCount = rows.filter((row) => row.is_hidden).length;

  const syncRow = useCallback((message: CommunityMessage) => {
    setRows((prev) => {
      const index = prev.findIndex((item) => item.id === message.id);
      if (index < 0) {
        return [...prev, message].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      }
      const next = [...prev];
      next[index] = message;
      return next;
    });
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("community-messages-admin")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
        (payload) => syncRow(payload.new as CommunityMessage),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_messages" },
        (payload) => syncRow(payload.new as CommunityMessage),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [syncRow]);

  useEffect(() => {
    if (!pendingHide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingHide(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pendingHide]);

  function run(
    action: () => Promise<CommunityAdminActionResult>,
    options?: { label?: string },
  ) {
    const label = options?.label ?? "Working…";
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) success(result.message);
        else error(result.message);
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    run(() => postDeskCommunityMessage(body), {
      label: "Posting to Community…",
    });
  }

  function confirmHide() {
    if (!pendingHide || busy) return;
    const id = pendingHide.id;
    run(async () => {
      const result = await hideCommunityMessage(id);
      if (result.ok) setPendingHide(null);
      return result;
    }, { label: "Hiding message…" });
  }

  return (
    <div className="space-y-3">
      <div className="relative" aria-busy={busy}>
        <DeskLoaderOverlay
          active={busy && !pendingHide}
          label={busyLabel ?? "Working…"}
        />
        <SupportChatPane
          heightClass="min-h-[28rem] max-h-[min(78vh,44rem)]"
          footer={
            national ? (
              <div>
                <SupportChatComposer
                  value={draft}
                  onChange={setDraft}
                  onSubmit={onSubmit}
                  pending={busy}
                  maxLength={COMMUNITY_BODY_MAX}
                  placeholder="Post as Listening Desk…"
                  submitLabel="Post"
                  enableEmojiPicker
                  enterToSend
                />
                <p className="border-t border-stone/60 px-4 py-2 text-center text-[0.7rem] text-ink/45">
                  Press and hold a message to hide it from students. Right-click
                  also works on desktop.
                </p>
              </div>
            ) : (
              <div className="px-4 py-4 text-center text-sm text-ink/55">
                National desk posts and moderates this room.
              </div>
            )
          }
        >
          <SupportChatTranscript
            messages={visible}
            emptyLabel="No messages yet"
            emptyHint="Students will appear here when they post."
            onLongPressMessage={
              national
                ? (message) => {
                    if (!busy) setPendingHide(message);
                  }
                : undefined
            }
          />
        </SupportChatPane>
      </div>

      {hiddenCount > 0 && national ? (
        <p className="text-xs text-ink/45">
          {hiddenCount} hidden message{hiddenCount === 1 ? "" : "s"} (removed
          from student view).
        </p>
      ) : null}

      {pendingHide ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            if (!busy) setPendingHide(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-hide-title"
            className="relative w-full max-w-md border border-stone bg-mist p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Hiding message…"}
            />
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Moderate
            </p>
            <h2
              id="community-hide-title"
              className="mt-2 font-display text-xl text-pine"
            >
              Hide this message?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/70">
              Students will no longer see it in Community. Desk posts appear as{" "}
              {LISTENING_DESK_LABEL}.
            </p>
            <blockquote className="mt-4 border-l-2 border-pine/30 pl-3 text-sm text-ink/80">
              <p className="line-clamp-4 whitespace-pre-wrap">
                {pendingHide.body}
              </p>
              <footer className="mt-2 text-[0.7rem] text-ink/45">
                {pendingHide.author === "You"
                  ? LISTENING_DESK_LABEL
                  : pendingHide.author}
              </footer>
            </blockquote>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPendingHide(null)}
                className="border border-stone px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-pine/40 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmHide}
                className="inline-flex min-h-[2.5rem] min-w-[7.5rem] items-center justify-center bg-[#5c2a2a] px-4 py-2.5 text-sm font-medium text-mist hover:bg-red-900 disabled:opacity-60"
              >
                {busy ? (
                  <DeskLoader label="Hiding…" tone="mist" />
                ) : (
                  "Hide message"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
