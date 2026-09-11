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
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import {
  COMMUNITY_BODY_MAX,
  LISTENING_DESK_LABEL,
  type CommunityMessage,
} from "@/lib/community/types";
import type { AdminProfile } from "@/lib/admin/profile";
import { isNationalAdmin } from "@/lib/admin/profile";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function CommunityManager({
  profile,
  initialMessages,
}: CommunityManagerProps) {
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState(initialMessages);
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

  function run(
    action: () => Promise<CommunityAdminActionResult>,
    options?: { label?: string },
  ) {
    const label = options?.label ?? "Working…";
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) await deskSuccess({ text: result.message });
        else await deskError({ text: result.message });
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

  async function requestHide(message: SupportChatMessage) {
    if (busy) return;
    const preview = message.body.trim();
    const clipped =
      preview.length > 180 ? `${preview.slice(0, 180).trimEnd()}…` : preview;
    const authorLabel =
      message.author === "You" ? LISTENING_DESK_LABEL : message.author;

    const ok = await deskConfirm({
      title: "Hide this message?",
      html: [
        `<p>Students will no longer see it in Community. Desk posts appear as ${escapeHtml(LISTENING_DESK_LABEL)}.</p>`,
        clipped
          ? `<blockquote style="margin:0.85rem 0 0;padding-left:0.75rem;border-left:2px solid rgba(20,53,44,0.25);opacity:0.9"><p style="white-space:pre-wrap;margin:0">${escapeHtml(clipped)}</p><footer style="margin-top:0.5rem;opacity:0.55;font-size:0.75rem">${escapeHtml(authorLabel)}</footer></blockquote>`
          : "",
      ]
        .filter(Boolean)
        .join(""),
      confirmLabel: "Hide message",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;

    run(() => hideCommunityMessage(message.id), {
      label: "Hiding message…",
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative" data-tour="community-room" aria-busy={busy}>
        <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
        <SupportChatPane
          heightClass="min-h-[28rem] max-h-[min(78vh,44rem)]"
          footer={
            <div data-tour="community-composer">
              {national ? (
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
              )}
            </div>
          }
        >
          <div data-tour="community-transcript">
            <SupportChatTranscript
              messages={visible}
              emptyLabel="No messages yet"
              emptyHint="Students will appear here when they post."
              onLongPressMessage={national ? requestHide : undefined}
            />
          </div>
        </SupportChatPane>
      </div>

      {hiddenCount > 0 && national ? (
        <p className="text-xs text-ink/45">
          {hiddenCount} hidden message{hiddenCount === 1 ? "" : "s"} (removed
          from student view).
        </p>
      ) : null}
    </div>
  );
}
