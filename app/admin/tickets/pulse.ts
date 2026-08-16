"use server";

import { activeQueueStatuses } from "@/lib/tickets";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DeskChatEvent = {
  noteId: string;
  ticketId: string;
  reference: string;
  topic: string;
  preview: string;
  fromStudent: boolean;
  createdAt: string;
};

export type DeskPulse = {
  open: number;
  unsettled: number;
  /** Newest shared chat note (student or desk) for toast dedupe. */
  latestChat: DeskChatEvent | null;
};

function previewBody(body: string) {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 110) return trimmed;
  return `${trimmed.slice(0, 109).trimEnd()}…`;
}

/**
 * Badge counts for the admin shell. Called often (realtime nudges + a slow
 * fallback poll), so it deliberately skips a separate session lookup: the
 * cookie-scoped client is subject to RLS, and only active admins can read
 * support_tickets, so anyone else simply counts zero rows.
 */
export async function getDeskPulse(): Promise<DeskPulse> {
  try {
    const supabase = await createServerSupabaseClient();
    const [{ count: open }, { count: unsettled }, notesResult] =
      await Promise.all([
        supabase
          .from("support_tickets")
          .select("*", { count: "exact", head: true })
          .eq("status", "open"),
        supabase
          .from("support_tickets")
          .select("*", { count: "exact", head: true })
          .in("status", activeQueueStatuses()),
        supabase
          .from("support_ticket_notes")
          .select(
            "id, ticket_id, body, created_at, student_author_id, is_internal",
          )
          .eq("is_internal", false)
          .order("created_at", { ascending: false })
          // RLS already scopes notes to accessible tickets; take a few so we
          // still surface the newest in-scope chat if the absolute latest is filtered out.
          .limit(8),
      ]);

    let latestChat: DeskChatEvent | null = null;
    const noteRows = notesResult.error ? [] : (notesResult.data ?? []);
    for (const latest of noteRows) {
      const { data: ticket } = await supabase
        .from("support_tickets")
        .select("id, reference, topic")
        .eq("id", latest.ticket_id)
        .maybeSingle();

      if (ticket) {
        latestChat = {
          noteId: latest.id as string,
          ticketId: ticket.id as string,
          reference: ticket.reference as string,
          topic: ticket.topic as string,
          preview: previewBody(String(latest.body ?? "")),
          fromStudent: Boolean(latest.student_author_id),
          createdAt: latest.created_at as string,
        };
        break;
      }
    }

    return {
      open: open ?? 0,
      unsettled: unsettled ?? 0,
      latestChat,
    };
  } catch {
    return { open: 0, unsettled: 0, latestChat: null };
  }
}
