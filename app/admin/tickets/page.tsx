import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TicketsManager } from "@/components/admin/tickets-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import type { SupportTicketNote, TicketWithMeta } from "@/lib/tickets";
import { enrichTicketsWithParishScope } from "@/lib/tickets/enrich";
import { publicUnavailableMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Listening Desk | School of Disciples Portal",
};

export default async function AdminTicketsPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const supabase = await createServerSupabaseClient();

  const { data: ticketRows, error: ticketsError } = await supabase
    .from("support_tickets")
    .select(
      "id, reference, topic, name, email, message, status, priority, assigned_to, user_id, intake_source, created_at, updated_at, resolved_at",
    )
    .order("created_at", { ascending: false });

  let ticketData = ticketRows;
  let loadError = ticketsError;

  if (ticketsError && /intake_source/i.test(ticketsError.message)) {
    const retry = await supabase
      .from("support_tickets")
      .select(
        "id, reference, topic, name, email, message, status, priority, assigned_to, user_id, created_at, updated_at, resolved_at",
      )
      .order("created_at", { ascending: false });
    ticketData = retry.data;
    loadError = retry.error;
  }

  if (loadError) {
    console.error("admin/tickets load:", loadError.message);
    return (
      <div className="mx-auto max-w-2xl">
        <section className="animate-fade-rise mb-4">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Desk
          </p>
          <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
            Listening Desk
          </h1>
        </section>
        <div className="border border-stone bg-mist/70 px-5 py-6 text-sm leading-relaxed text-ink/70">
          <p className="font-medium text-pine">Desk unavailable</p>
          <p className="mt-2">{publicUnavailableMessage("The Listening Desk")}</p>
        </div>
      </div>
    );
  }

  const tickets = (ticketData ?? []) as TicketWithMeta[];
  const assigneeIds = Array.from(
    new Set(tickets.map((t) => t.assigned_to).filter(Boolean)),
  ) as string[];

  const assigneeMap = new Map<
    string,
    { full_name: string | null; email: string }
  >();

  if (assigneeIds.length > 0) {
    const { data: admins } = await supabase
      .from("admin_profiles")
      .select("id, full_name, email")
      .in("id", assigneeIds);
    for (const admin of admins ?? []) {
      assigneeMap.set(admin.id, {
        full_name: admin.full_name,
        email: admin.email,
      });
    }
  }

  const ticketIds = tickets.map((t) => t.id);
  const notesByTicket = new Map<string, SupportTicketNote[]>();

  if (ticketIds.length > 0) {
    const { data: notes } = await supabase
      .from("support_ticket_notes")
      .select(
        "id, ticket_id, author_id, student_author_id, body, is_internal, delivery_channel, email_subject, created_at",
      )
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: true });

    const authorIds = Array.from(
      new Set((notes ?? []).map((n) => n.author_id).filter(Boolean)),
    ) as string[];

    const studentAuthorIds = Array.from(
      new Set(
        (notes ?? []).map((n) => n.student_author_id).filter(Boolean),
      ),
    ) as string[];

    const authorMap = new Map<
      string,
      { full_name: string | null; email: string }
    >();

    if (authorIds.length > 0) {
      const { data: authors } = await supabase
        .from("admin_profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      for (const author of authors ?? []) {
        authorMap.set(author.id, {
          full_name: author.full_name,
          email: author.email,
        });
      }
    }

    const studentMap = new Map<
      string,
      { first_name: string; last_name: string; email: string }
    >();

    if (studentAuthorIds.length > 0) {
      const { data: students } = await supabase
        .from("student_profiles")
        .select("id, first_name, last_name, email")
        .in("id", studentAuthorIds);
      for (const student of students ?? []) {
        studentMap.set(student.id, {
          first_name: student.first_name,
          last_name: student.last_name,
          email: student.email,
        });
      }
    }

    for (const note of notes ?? []) {
      const fromStudent = Boolean(note.student_author_id);
      const admin = note.author_id ? authorMap.get(note.author_id) : null;
      const student = note.student_author_id
        ? studentMap.get(note.student_author_id)
        : null;
      const enriched: SupportTicketNote = {
        ...note,
        is_internal: note.is_internal ?? true,
        delivery_channel: note.delivery_channel ?? "desk",
        email_subject: note.email_subject ?? null,
        from_student: fromStudent,
        author_name: fromStudent
          ? student
            ? `${student.first_name} ${student.last_name}`.trim()
            : "Student"
          : (admin?.full_name ?? null),
        author_email: fromStudent
          ? (student?.email ?? null)
          : (admin?.email ?? null),
      };
      const list = notesByTicket.get(note.ticket_id) ?? [];
      list.push(enriched);
      notesByTicket.set(note.ticket_id, list);
    }
  }

  const hydrated: TicketWithMeta[] = tickets.map((ticket) => {
    const assignee = ticket.assigned_to
      ? assigneeMap.get(ticket.assigned_to)
      : null;
    return {
      ...ticket,
      assignee_name: assignee?.full_name ?? null,
      assignee_email: assignee?.email ?? null,
      notes: notesByTicket.get(ticket.id) ?? [],
    };
  });

  const scoped = await enrichTicketsWithParishScope(supabase, hydrated);
  const national = isNationalAdmin(profile);

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Desk
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Listening Desk
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {national
            ? "UK-wide correspondence from the public form and student portal. Claim a note, reply in-thread or by email, and keep a staff margin."
            : "Correspondence for your parish — students and guests linked to your enrolments. Claim a note, reply, and keep a staff margin."}
        </p>
      </section>
      <TicketsManager tickets={scoped} profile={profile} />
    </div>
  );
}
