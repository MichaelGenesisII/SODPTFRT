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
  postStudentCommunityMessage,
  type CommunityActionResult,
} from "@/app/student/community/actions";
import {
  SupportChatComposer,
  SupportChatPane,
  SupportChatTranscript,
  type SupportChatMessage,
} from "@/components/support/chat-thread";
import { useToast } from "@/components/ui/toast";
import { COMMUNITY_BODY_MAX, LISTENING_DESK_LABEL, type CommunityMessage } from "@/lib/community/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { StudentProfile } from "@/lib/student/types";

type StudentCommunityDeskProps = {
  profile: StudentProfile;
  initialMessages: CommunityMessage[];
};

function toChatMessages(
  rows: CommunityMessage[],
  userId: string,
): SupportChatMessage[] {
  return rows.map((row) => {
    const isDesk = row.author_kind === "admin";
    return {
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      author: isDesk ? LISTENING_DESK_LABEL : row.author_label,
      side: row.author_user_id === userId ? "mine" : "theirs",
      // Desk name already shown as author — no second label.
      badge: null,
    };
  });
}

export function StudentCommunityDesk({
  profile,
  initialMessages,
}: StudentCommunityDeskProps) {
  const { error } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState(initialMessages);

  const messages = useMemo(
    () => toChatMessages(rows, profile.id),
    [rows, profile.id],
  );

  const appendMessage = useCallback((message: CommunityMessage) => {
    if (message.is_hidden) return;
    setRows((prev) => {
      if (prev.some((item) => item.id === message.id)) return prev;
      return [...prev, message].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("community-messages-student")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
        (payload) => {
          appendMessage(payload.new as CommunityMessage);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_messages" },
        (payload) => {
          const updated = payload.new as CommunityMessage;
          if (updated.is_hidden) {
            setRows((prev) => prev.filter((item) => item.id !== updated.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [appendMessage]);

  function run(action: () => Promise<CommunityActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (result.posted) appendMessage(result.posted);
        setDraft("");
      } else {
        error(result.message);
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    run(() => postStudentCommunityMessage(body));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col max-lg:h-full lg:mx-auto lg:w-full lg:max-w-4xl lg:flex-none">
      <section className="mb-6 hidden animate-fade-rise lg:block">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
          National channel
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.85rem,4vw,2.4rem)] tracking-[-0.02em] text-pine">
          Community
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          A shared room for students across the School. Be kind and stay on
          topic. For private matters, use Support.
        </p>
      </section>

      <SupportChatPane
        className="min-h-0 flex-1 border-0 max-lg:rounded-none lg:border lg:border-stone/80"
        heightClass="min-h-0 flex-1 max-h-none"
        footer={
          <SupportChatComposer
            value={draft}
            onChange={setDraft}
            onSubmit={onSubmit}
            pending={pending}
            maxLength={COMMUNITY_BODY_MAX}
            placeholder="Message…"
            enableEmojiPicker
            enterToSend
          />
        }
      >
        <SupportChatTranscript
          messages={messages}
          emptyLabel="The room is quiet"
          emptyHint="Say hello — the Listening Desk may reply."
        />
      </SupportChatPane>
    </div>
  );
}
