"use server";

import { requireSessionStudent } from "@/lib/student/auth";
import { claimTicketsByEmail } from "@/lib/tickets/claim";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StudentChatEvent = {
  noteId: string;
  ticketId: string;
  reference: string;
  topic: string;
  preview: string;
  createdAt: string;
};

export type StudentSupportPulse = {
  notes: StudentChatEvent[];
  latestNoteId: string | null;
  /** Server read receipts (ticketId → ISO last_read_at) for cross-device unread. */
  reads: Record<string, string>;
};

function previewBody(body: string) {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 110) return trimmed;
  return `${trimmed.slice(0, 109).trimEnd()}…`;
}

/**
 * Recent desk replies on the student's conversations.
 * Unread is computed on the client from local + server read receipts.
 */
export async function getStudentSupportPulse(): Promise<StudentSupportPulse> {
  try {
    const student = await requireSessionStudent();
    // Claim orphan /support notes so pulse/badge can see them before inbox load.
    await claimTicketsByEmail(student);
    const supabase = await createServerSupabaseClient();

    const { data: tickets, error: ticketsError } = await supabase
      .from("support_tickets")
      .select("id, reference, topic")
      .eq("user_id", student.id);

    if (ticketsError || !tickets || tickets.length === 0) {
      return { notes: [], latestNoteId: null, reads: {} };
    }

    const ticketMeta = new Map(
      tickets.map((ticket) => [
        ticket.id as string,
        {
          reference: ticket.reference as string,
          topic: ticket.topic as string,
        },
      ]),
    );
    const ticketIds = tickets.map((ticket) => ticket.id as string);

    const [{ data: notes, error: notesError }, { data: readRows }] =
      await Promise.all([
        supabase
          .from("support_ticket_notes")
          .select(
            "id, ticket_id, body, created_at, student_author_id, is_internal",
          )
          .in("ticket_id", ticketIds)
          .eq("is_internal", false)
          .is("student_author_id", null)
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("support_ticket_reads")
          .select("ticket_id, last_read_at")
          .eq("user_id", student.id)
          .in("ticket_id", ticketIds),
      ]);

    const reads: Record<string, string> = {};
    for (const row of readRows ?? []) {
      if (row.ticket_id && row.last_read_at) {
        reads[row.ticket_id as string] = row.last_read_at as string;
      }
    }

    if (notesError || !notes) {
      return { notes: [], latestNoteId: null, reads };
    }

    const events: StudentChatEvent[] = notes.map((note) => {
      const meta = ticketMeta.get(note.ticket_id as string);
      return {
        noteId: note.id as string,
        ticketId: note.ticket_id as string,
        reference: meta?.reference ?? "SOD",
        topic: meta?.topic ?? "Support",
        preview: previewBody(String(note.body ?? "")),
        createdAt: note.created_at as string,
      };
    });

    return {
      notes: events,
      latestNoteId: events[0]?.noteId ?? null,
      reads,
    };
  } catch {
    return { notes: [], latestNoteId: null, reads: {} };
  }
}

/** Best-effort server mirror for cross-device unread (requires tickets-reads.sql). */
export async function markStudentTicketRead(
  ticketId: string,
): Promise<{ ok: boolean }> {
  try {
    const student = await requireSessionStudent();
    if (!ticketId) return { ok: false };

    const supabase = await createServerSupabaseClient();
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("id", ticketId)
      .eq("user_id", student.id)
      .maybeSingle();

    if (!ticket) return { ok: false };

    const now = new Date().toISOString();
    const { error } = await supabase.from("support_ticket_reads").upsert(
      {
        user_id: student.id,
        ticket_id: ticketId,
        last_read_at: now,
      },
      { onConflict: "user_id,ticket_id" },
    );

    if (error) {
      return { ok: false };
    }

    return { ok: true };
  } catch {
    return { ok: false };
  }
}
