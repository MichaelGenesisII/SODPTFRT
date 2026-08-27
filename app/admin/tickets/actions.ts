"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import {
  isTicketPriority,
  isTicketStatus,
  NOTE_MAX,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/tickets";
import { sendTicketEmail, portalBaseUrl } from "@/lib/email/backend";
import { publicActionMessage } from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type TicketActionResult = {
  ok: boolean;
  message: string;
};

function unauthorizedResult(): { ok: false; message: string } {
  return { ok: false, message: "Unauthorized." };
}

function fail(error: unknown, fallback?: string): { ok: false; message: string } {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

function revalidateTickets() {
  revalidatePath("/admin");
  revalidatePath("/admin/tickets");
  revalidatePath("/student/support");
}

/**
 * App-layer check that mirrors RLS admin_can_access_ticket.
 * Parish admins only see tickets linked to their parish (via student or email
 * enrolment). National/master see all. Returns a clear message when out of scope.
 */
async function requireAccessibleTicket(
  ticketId: string,
): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> }
  | { ok: false; message: string }
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id")
    .eq("id", ticketId)
    .maybeSingle();

  if (error) {
    console.error("requireAccessibleTicket:", error.message);
    return fail(error);
  }
  if (!data) {
    return {
      ok: false,
      message: "Ticket not found or outside your parish scope.",
    };
  }
  return { ok: true, supabase };
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
): Promise<TicketActionResult> {
  try {
    await requireSessionAdmin();
    if (!id || !isTicketStatus(status)) {
      return { ok: false, message: "Invalid ticket or status." };
    }

    const access = await requireAccessibleTicket(id);
    if (!access.ok) return { ok: false, message: access.message };

    const now = new Date().toISOString();
    const resolvedAt =
      status === "resolved" || status === "closed" ? now : null;

    const { error } = await access.supabase
      .from("support_tickets")
      .update({
        status,
        updated_at: now,
        resolved_at: resolvedAt,
      })
      .eq("id", id);

    if (error) {
      console.error("updateTicketStatus:", error.message);
      return fail(error);
    }

    revalidateTickets();
    return { ok: true, message: "Ticket path updated." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    console.error("updateTicketStatus:", error);
    return fail(error);
  }
}

export async function updateTicketPriority(
  id: string,
  priority: TicketPriority,
): Promise<TicketActionResult> {
  try {
    await requireSessionAdmin();
    if (!id || !isTicketPriority(priority)) {
      return { ok: false, message: "Invalid ticket or priority." };
    }

    const access = await requireAccessibleTicket(id);
    if (!access.ok) return { ok: false, message: access.message };

    const { error } = await access.supabase
      .from("support_tickets")
      .update({
        priority,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("updateTicketPriority:", error.message);
      return fail(error);
    }

    revalidateTickets();
    return {
      ok: true,
      message: priority === "high" ? "Marked urgent." : "Priority set to normal.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    console.error("updateTicketPriority:", error);
    return fail(error);
  }
}

export async function claimTicket(id: string): Promise<TicketActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!id) return { ok: false, message: "Ticket id is required." };

    const access = await requireAccessibleTicket(id);
    if (!access.ok) return { ok: false, message: access.message };

    const now = new Date().toISOString();

    const { data: existing } = await access.supabase
      .from("support_tickets")
      .select("status, assigned_to")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return {
        ok: false,
        message: "Ticket not found or outside your parish scope.",
      };
    }

    if (existing.assigned_to && existing.assigned_to !== actor.id) {
      return {
        ok: false,
        message:
          "Already claimed by another admin. Ask them to release it first.",
      };
    }

    if (existing.assigned_to === actor.id) {
      return { ok: true, message: "You already hold this note." };
    }

    const nextStatus =
      existing.status === "open" ? "in_progress" : existing.status;

    const { error } = await access.supabase
      .from("support_tickets")
      .update({
        assigned_to: actor.id,
        status: nextStatus,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      console.error("claimTicket:", error.message);
      return fail(error);
    }

    revalidateTickets();
    return { ok: true, message: "You claimed this note." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    console.error("claimTicket:", error);
    return fail(error);
  }
}

export async function releaseTicket(id: string): Promise<TicketActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!id) return { ok: false, message: "Ticket id is required." };

    const access = await requireAccessibleTicket(id);
    if (!access.ok) return { ok: false, message: access.message };

    const { data: existing } = await access.supabase
      .from("support_tickets")
      .select("assigned_to")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return {
        ok: false,
        message: "Ticket not found or outside your parish scope.",
      };
    }

    if (!existing.assigned_to) {
      return { ok: true, message: "This note is already unclaimed." };
    }

    if (
      existing.assigned_to !== actor.id &&
      !isNationalAdmin(actor)
    ) {
      return {
        ok: false,
        message: "Only the assignee or a national admin can release this note.",
      };
    }

    const { error } = await access.supabase
      .from("support_tickets")
      .update({
        assigned_to: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("releaseTicket:", error.message);
      return fail(error);
    }

    revalidateTickets();
    return { ok: true, message: "Ticket released to the desk." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    console.error("releaseTicket:", error);
    return fail(error);
  }
}

export async function addTicketNote(
  ticketId: string,
  body: string,
  isInternal = true,
): Promise<TicketActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const note = body.trim();

    if (!ticketId) return { ok: false, message: "Ticket id is required." };
    if (!note) {
      return {
        ok: false,
        message: isInternal
          ? "Write a short staff note."
          : "Write a reply for the student.",
      };
    }
    if (note.length > NOTE_MAX) {
      return {
        ok: false,
        message: `Notes must be ${NOTE_MAX} characters or fewer.`,
      };
    }

    const access = await requireAccessibleTicket(ticketId);
    if (!access.ok) return { ok: false, message: access.message };

    const { error } = await access.supabase.from("support_ticket_notes").insert({
      ticket_id: ticketId,
      author_id: actor.id,
      student_author_id: null,
      body: note,
      is_internal: isInternal,
      delivery_channel: isInternal ? "desk" : "portal",
    });

    if (error) {
      console.error("addTicketNote:", error.message);
      if (
        /column .* does not exist|is_internal|student_author/i.test(
          error.message,
        )
      ) {
        return {
          ok: false,
          message: isInternal
            ? "Staff notes are temporarily unavailable. Please try again later."
            : "Portal replies are temporarily unavailable. Please try again later.",
        };
      }
      return fail(error);
    }

    const now = new Date().toISOString();
    await access.supabase
      .from("support_tickets")
      .update({
        updated_at: now,
        ...(isInternal
          ? {}
          : {
              status: "waiting",
            }),
      })
      .eq("id", ticketId);

    revalidateTickets();
    return {
      ok: true,
      message: isInternal
        ? "Staff note saved."
        : "Reply sent to the student portal.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    console.error("addTicketNote:", error);
    return fail(error);
  }
}

export async function sendTicketEmailReply(
  ticketId: string,
  subject: string,
  message: string,
): Promise<TicketActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!ticketId) return { ok: false, message: "Ticket id is required." };
    if (trimmedSubject.length < 3) {
      return { ok: false, message: "Subject must be at least 3 characters." };
    }
    if (trimmedMessage.length < 10) {
      return {
        ok: false,
        message: "Email message must be at least 10 characters.",
      };
    }
    if (trimmedMessage.length > 5000) {
      return { ok: false, message: "Email message is too long." };
    }

    const access = await requireAccessibleTicket(ticketId);
    if (!access.ok) return { ok: false, message: access.message };

    const { data: ticket, error: ticketError } = await access.supabase
      .from("support_tickets")
      .select("id, reference, topic, name, email, status")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError || !ticket) {
      if (ticketError) {
        console.error("sendTicketEmailReply:", ticketError.message);
      }
      return {
        ok: false,
        message: ticketError
          ? publicActionMessage(ticketError.message)
          : "Ticket not found or outside your parish scope.",
      };
    }

    const sent = await sendTicketEmail({
      to: ticket.email,
      toName: ticket.name,
      subject: trimmedSubject,
      message: trimmedMessage,
      reference: ticket.reference,
      topic: ticket.topic,
      adminName: actor.full_name || actor.email,
      portalSupportUrl: `${portalBaseUrl()}/support`,
      siteUrl: SOD_SITE,
    });

    if (!sent.ok) {
      return { ok: false, message: publicActionMessage(sent.message) };
    }

    const { error: noteError } = await access.supabase
      .from("support_ticket_notes")
      .insert({
        ticket_id: ticketId,
        author_id: actor.id,
        student_author_id: null,
        body: trimmedMessage,
        is_internal: true,
        delivery_channel: "email",
        email_subject: sent.subject || trimmedSubject,
      });

    if (noteError) {
      console.error("sendTicketEmailReply trail:", noteError.message);
      return {
        ok: false,
        message:
          "Email was sent, but the desk trail could not be saved. Please try again.",
      };
    }

    const now = new Date().toISOString();
    await access.supabase
      .from("support_tickets")
      .update({
        updated_at: now,
        status: ticket.status === "open" ? "in_progress" : ticket.status,
        assigned_to: actor.id,
      })
      .eq("id", ticketId);

    revalidateTickets();
    return {
      ok: true,
      message: `NoReply email sent to ${ticket.email}.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    console.error("sendTicketEmailReply:", error);
    return fail(error);
  }
}

export async function deleteTicket(id: string): Promise<TicketActionResult> {
  try {
    await requireSessionAdmin();
    if (!id) return { ok: false, message: "Ticket id is required." };

    const access = await requireAccessibleTicket(id);
    if (!access.ok) return { ok: false, message: access.message };

    const { error } = await access.supabase
      .from("support_tickets")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("deleteTicket:", error.message);
      return fail(error);
    }

    revalidateTickets();
    return { ok: true, message: "Ticket removed from the desk." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResult();
    }
    console.error("deleteTicket:", error);
    return fail(error);
  }
}
