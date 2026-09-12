import type { TicketWithMeta } from "@/lib/tickets";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type EnrolmentScopeRow = {
  email: string | null;
  user_id: string | null;
  parish_id: string | null;
  batch_id: string | null;
  created_at: string;
  parishes: { name: string } | { name: string }[] | null;
  batches: { name: string; year: number } | { name: string; year: number }[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatBatchLabel(batch: { name: string; year: number } | null) {
  if (!batch) return null;
  return `${batch.name} ${batch.year}`;
}

function remember(
  row: EnrolmentScopeRow,
  byUser: Map<string, EnrolmentScopeRow>,
  byEmail: Map<string, EnrolmentScopeRow>,
) {
  if (row.user_id && !byUser.has(row.user_id)) {
    byUser.set(row.user_id, row);
  }
  const key = (row.email ?? "").trim().toLowerCase();
  if (key && !byEmail.has(key)) {
    byEmail.set(key, row);
  }
}

/**
 * Attach parish/batch labels from enrolments so the desk can show (and filter)
 * scope. Visibility itself remains RLS via admin_can_access_ticket.
 */
export async function enrichTicketsWithParishScope(
  supabase: ServerClient,
  tickets: TicketWithMeta[],
): Promise<TicketWithMeta[]> {
  if (tickets.length === 0) return tickets;

  const emails = Array.from(
    new Set(
      tickets
        .map((t) => t.email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const userIds = Array.from(
    new Set(tickets.map((t) => t.user_id).filter(Boolean)),
  ) as string[];

  const byUser = new Map<string, EnrolmentScopeRow>();
  const byEmail = new Map<string, EnrolmentScopeRow>();
  const select =
    "email, user_id, parish_id, batch_id, created_at, parishes(name), batches(name, year)";

  if (userIds.length > 0) {
    const { data } = await supabase
      .from("enrolments")
      .select(select)
      .in("user_id", userIds)
      .order("created_at", { ascending: false });
    for (const row of (data ?? []) as EnrolmentScopeRow[]) {
      remember(row, byUser, byEmail);
    }
  }

  if (emails.length > 0) {
    // Case-insensitive email match (enrolments may keep original casing).
    const orFilter = emails
      .map((email) => {
        const safe = email.replace(/"/g, "");
        return `email.ilike."${safe}"`;
      })
      .join(",");
    const { data } = await supabase
      .from("enrolments")
      .select(select)
      .or(orFilter)
      .order("created_at", { ascending: false });
    for (const row of (data ?? []) as EnrolmentScopeRow[]) {
      remember(row, byUser, byEmail);
    }
  }

  return tickets.map((ticket) => {
    const row =
      (ticket.user_id ? byUser.get(ticket.user_id) : undefined) ??
      byEmail.get(ticket.email.trim().toLowerCase());

    if (!row) {
      return {
        ...ticket,
        parish_id: null,
        parish_name: null,
        batch_id: null,
        batch_label: null,
      };
    }

    const parish = one(row.parishes);
    const batch = one(row.batches);

    return {
      ...ticket,
      parish_id: row.parish_id,
      parish_name: parish?.name ?? null,
      batch_id: row.batch_id,
      batch_label: formatBatchLabel(batch),
    };
  });
}
