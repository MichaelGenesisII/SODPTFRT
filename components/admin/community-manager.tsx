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
    .map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      author: row.author_label,
      side: row.author_user_id === adminId ? "mine" : "theirs",
      badge:
        row.author_kind === "admin" ? LISTENING_DESK_LABEL : row.author_label,
    }));
}

export function CommunityManager({
  profile,
  initialMessages,
}: CommunityManagerProps) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState(initialMessages);
  const [moderatingId, setModeratingId] = useState<string | null>(null);
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

  function run(action: () => Promise<CommunityAdminActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) success(result.message);
      else error(result.message);
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    run(() => postDeskCommunityMessage(body));
    setDraft("");
  }

  function onHide(id: string) {
    setModeratingId(id);
    run(async () => {
      const result = await hideCommunityMessage(id);
      setModeratingId(null);
      return result;
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
      <SupportChatPane
        footer={
          national ? (
            <SupportChatComposer
              value={draft}
              onChange={setDraft}
              onSubmit={onSubmit}
              pending={pending}
              maxLength={COMMUNITY_BODY_MAX}
              placeholder="Post as Listening Desk…"
              submitLabel="Post"
              enableEmojiPicker
              enterToSend
            />
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
        />
      </SupportChatPane>

      <aside className="border border-stone/80 bg-white/50 p-4">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Moderation
        </p>
        <p className="mt-2 text-sm text-ink/65">
          {national ? (
            <>
              Hide removes a message from the student view. You post publicly as{" "}
              <strong>{LISTENING_DESK_LABEL}</strong>.
            </>
          ) : (
            <>Only the national desk can hide messages or post as Listening Desk.</>
          )}
        </p>
        {hiddenCount > 0 ? (
          <p className="mt-3 text-xs text-ink/50">
            {hiddenCount} hidden message{hiddenCount === 1 ? "" : "s"} in archive.
          </p>
        ) : null}
        {national ? (
          <ul className="mt-4 max-h-[24rem] space-y-2 overflow-y-auto">
            {visible.slice(-12).map((message) => (
              <li
                key={message.id}
                className="border border-stone/70 bg-mist/40 px-3 py-2 text-xs"
              >
                <p className="line-clamp-2 text-ink/70">{message.body}</p>
                <button
                  type="button"
                  disabled={pending && moderatingId === message.id}
                  onClick={() => onHide(message.id)}
                  className="mt-2 text-[0.65rem] font-medium uppercase tracking-wide text-red-900/80 hover:text-red-900 disabled:opacity-50"
                >
                  Hide
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
    </div>
  );
}
