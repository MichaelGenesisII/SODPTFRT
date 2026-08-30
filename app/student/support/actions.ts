"use server";

import { revalidatePath } from "next/cache";
import {
  requireSessionStudent,
  studentDisplayName,
  type StudentProfile,
} from "@/lib/student/auth";
import {
  generateTicketReference,
  isSupportTopic,
  MESSAGE_MAX,
  NOTE_MAX,
  type SupportTicket,
  type SupportTicketNote,
  type TicketWithMeta,
} from "@/lib/tickets";
import { publicActionMessage } from "@/lib/safe-action-message";
import { claimTicketsByEmail } from "@/lib/tickets/claim";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type StudentSupportResult = {
  ok: boolean;
  message: string;
  reference?: string;
  ticketId?: string;
};

function revalidateStudentSupport() {
  revalidatePath("/student/support");
  revalidatePath("/admin/tickets");
  revalidatePath("/admin");
}

export async function listStudentConversations(): Promise<TicketWithMeta[]> {
  const student = await requireSessionStudent();

  // Import prior /support notes that used this student's email (non-blocking).
  void claimTicketsByEmail(student);

  const supabase = await createServerSupabaseClient();

  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select(
      "id, reference, topic, name, email, message, status, priority, assigned_to, user_id, intake_source, created_at, updated_at, resolved_at",
    )
    .eq("user_id", student.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("listStudentConversations:", error.message);
    // Fallback if intake_source column is not migrated yet.
    if (/intake_source/i.test(error.message)) {
      const retry = await supabase
        .from("support_tickets")
        .select(
          "id, reference, topic, name, email, message, status, priority, assigned_to, user_id, created_at, updated_at, resolved_at",
        )
        .eq("user_id", student.id)
        .order("updated_at", { ascending: false });
      if (retry.error) {
        throw new Error(
          publicActionMessage(
            retry.error.message,
            "Support is temporarily unavailable. Please try again later.",
          ),
        );
      }
      return await hydrateStudentConversations(
        student,
        (retry.data ?? []) as SupportTicket[],
        supabase,
      );
    }
    throw new Error(
      publicActionMessage(
        error.message,
        "Support is temporarily unavailable. Please try again later.",
      ),
    );
  }

  return await hydrateStudentConversations(
    student,
    (tickets ?? []) as SupportTicket[],
    supabase,
  );
}

async function hydrateStudentConversations(
  student: StudentProfile,
  rows: SupportTicket[],
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<TicketWithMeta[]> {
  if (rows.length === 0) return [];

  const { data: notes } = await supabase
    .from("support_ticket_notes")
    .select(
      "id, ticket_id, author_id, student_author_id, body, is_internal, delivery_channel, email_subject, created_at",
    )
    .in(
      "ticket_id",
      rows.map((row) => row.id),
    )
    .eq("is_internal", false)
    .order("created_at", { ascending: true });

  const adminIds = Array.from(
    new Set(
      (notes ?? [])
        .map((note) => note.author_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const adminMap = new Map<string, { full_name: string | null; email: string }>();
  if (adminIds.length > 0) {
    const { data: admins } = await supabase
      .from("admin_profiles")
      .select("id, full_name, email")
      .in("id", adminIds);
    for (const admin of admins ?? []) {
      adminMap.set(admin.id, {
        full_name: admin.full_name,
        email: admin.email,
      });
    }
  }

  const notesByTicket = new Map<string, SupportTicketNote[]>();
  for (const note of notes ?? []) {
    const admin = note.author_id ? adminMap.get(note.author_id) : null;
    const enriched: SupportTicketNote = {
      ...note,
      is_internal: false,
      from_student: Boolean(note.student_author_id),
      author_name: note.student_author_id
        ? studentDisplayName(student)
        : (admin?.full_name ?? "Listening Desk"),
      author_email: note.student_author_id
        ? student.email
        : (admin?.email ?? null),
    };
    const list = notesByTicket.get(note.ticket_id) ?? [];
    list.push(enriched);
    notesByTicket.set(note.ticket_id, list);
  }

  return rows.map((ticket) => ({
    ...ticket,
    notes: notesByTicket.get(ticket.id) ?? [],
  }));
}

export async function createStudentConversation(
  topic: string,
  message: string,
): Promise<StudentSupportResult> {
  try {
    const student = await requireSessionStudent();
    const trimmedTopic = topic.trim();
    const trimmedMessage = message.trim();

    if (!isSupportTopic(trimmedTopic)) {
      return { ok: false, message: "Please choose a valid topic." };
    }
    if (trimmedMessage.length < 10) {
      return {
        ok: false,
        message: "Please share a little more detail (at least 10 characters).",
      };
    }
    if (trimmedMessage.length > MESSAGE_MAX) {
      return {
        ok: false,
        message: `Message must be ${MESSAGE_MAX} characters or fewer.`,
      };
    }

    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const name = studentDisplayName(student);
    const email = student.email.trim().toLowerCase();
    let reference = generateTicketReference();
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const payload: Record<string, unknown> = {
        reference,
        topic: trimmedTopic,
        name,
        email,
        message: trimmedMessage,
        status: "open",
        priority: "normal",
        user_id: student.id,
        intake_source: "portal",
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from("support_tickets")
        .insert(payload)
        .select("id, reference")
        .maybeSingle();

      if (!error && data) {
        revalidateStudentSupport();
        return {
          ok: true,
          message: "Your conversation reached the Listening Desk.",
          reference: data.reference,
          ticketId: data.id,
        };
      }

      lastError = error?.message ?? "Could not start the conversation.";

      if (error && /column .*intake_source.* does not exist/i.test(lastError)) {
        delete payload.intake_source;
        const retry = await supabase
          .from("support_tickets")
          .insert(payload)
          .select("id, reference")
          .maybeSingle();
        if (!retry.error && retry.data) {
          revalidateStudentSupport();
          return {
            ok: true,
            message: "Your conversation reached the Listening Desk.",
            reference: retry.data.reference,
            ticketId: retry.data.id,
          };
        }
        lastError = retry.error?.message ?? lastError;
      }

      if (error?.code === "23505" || /duplicate|unique/i.test(lastError)) {
        reference = generateTicketReference();
        continue;
      }
      break;
    }

    if (
      lastError &&
      (/relation .* does not exist|Could not find the table|column .* does not exist/i.test(
        lastError,
      ) ||
        /user_id/i.test(lastError))
    ) {
      return {
        ok: false,
        message:
          "Support is temporarily unavailable. Please try again later.",
      };
    }

    if (lastError) {
      console.error("createStudentConversation:", lastError);
    }

    return {
      ok: false,
      message: publicActionMessage(
        lastError,
        "Could not start the conversation. Please try again.",
      ),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Please sign in again." };
    }
    console.error("createStudentConversation:", error);
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function replyStudentConversation(
  ticketId: string,
  body: string,
): Promise<StudentSupportResult> {
  try {
    const student = await requireSessionStudent();
    const note = body.trim();

    if (!ticketId) return { ok: false, message: "Conversation id is required." };
    if (!note) return { ok: false, message: "Write a reply before sending." };
    if (note.length > NOTE_MAX) {
      return {
        ok: false,
        message: `Replies must be ${NOTE_MAX} characters or fewer.`,
      };
    }

    const supabase = await createServerSupabaseClient();
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id, status, user_id")
      .eq("id", ticketId)
      .eq("user_id", student.id)
      .maybeSingle();

    if (!ticket) {
      return { ok: false, message: "Conversation not found." };
    }
    if (ticket.status === "resolved" || ticket.status === "closed") {
      return {
        ok: false,
        message: "This conversation is settled. Start a new one if you need help.",
      };
    }

    const { error } = await supabase.from("support_ticket_notes").insert({
      ticket_id: ticketId,
      author_id: null,
      student_author_id: student.id,
      body: note,
      is_internal: false,
    });

    if (error) {
      console.error("replyStudentConversation:", error.message);
      if (/column .* does not exist|is_internal|student_author/i.test(error.message)) {
        return {
          ok: false,
          message:
            "Support is temporarily unavailable. Please try again later.",
        };
      }
      return { ok: false, message: publicActionMessage(error.message) };
    }

    try {
      const service = createServiceSupabaseClient();
      const { error: bumpError } = await service
        .from("support_tickets")
        .update({
          updated_at: new Date().toISOString(),
          status: ticket.status === "waiting" ? "in_progress" : ticket.status,
        })
        .eq("id", ticketId)
        .eq("user_id", student.id);
      if (bumpError) {
        console.error("replyStudentConversation bump:", bumpError.message);
      }
    } catch (error) {
      console.error(
        "replyStudentConversation bump:",
        error instanceof Error ? error.message : error,
      );
    }

    revalidateStudentSupport();
    return { ok: true, message: "Reply sent to the Listening Desk." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Please sign in again." };
    }
    console.error("replyStudentConversation:", error);
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function deleteStudentConversation(
  ticketId: string,
): Promise<StudentSupportResult> {
  try {
    const student = await requireSessionStudent();
    if (!ticketId) {
      return { ok: false, message: "Conversation id is required." };
    }

    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from("support_tickets")
      .select("id, reference")
      .eq("id", ticketId)
      .eq("user_id", student.id)
      .maybeSingle();

    if (!existing) {
      return { ok: false, message: "Conversation not found." };
    }

    const { error } = await supabase
      .from("support_tickets")
      .delete()
      .eq("id", ticketId)
      .eq("user_id", student.id);

    if (error) {
      if (/policy|permission|RLS/i.test(error.message)) {
        return {
          ok: false,
          message:
            "This conversation could not be removed. Please try again later.",
        };
      }
      return { ok: false, message: "Could not remove this conversation." };
    }

    revalidateStudentSupport();
    return {
      ok: true,
      message: `Conversation ${existing.reference} removed from your inbox.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Please sign in again." };
    }
    console.error("deleteStudentConversation:", error);
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}
