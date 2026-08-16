export const SUPPORT_TOPICS = [
  "Enrolment",
  "Student portal",
  "Payments",
  "Classes & exams",
  "General enquiry",
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["normal", "high"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const MESSAGE_MAX = 800;
export const NOTE_MAX = 2000;
export const NAME_MAX = 120;

/** Path metaphor labels for the Listening Desk */
export const STATUS_META: Record<
  TicketStatus,
  { label: string; path: string; hint: string }
> = {
  open: {
    label: "Inbox",
    path: "New",
    hint: "Waiting to be opened",
  },
  in_progress: {
    label: "Walking",
    path: "In hand",
    hint: "Someone is on it",
  },
  waiting: {
    label: "Paused",
    path: "Awaiting",
    hint: "Waiting on the sender",
  },
  resolved: {
    label: "Settled",
    path: "Answered",
    hint: "Matter closed kindly",
  },
  closed: {
    label: "Filed",
    path: "Archive",
    hint: "Stored away",
  },
};

export type TicketIntakeSource = "public" | "portal";

export type SupportTicket = {
  id: string;
  reference: string;
  topic: string;
  name: string;
  email: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  user_id?: string | null;
  /** Where the opening note was filed: public /support or student portal. */
  intake_source?: TicketIntakeSource | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type SupportTicketNote = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  student_author_id?: string | null;
  body: string;
  is_internal?: boolean;
  delivery_channel?: "desk" | "email" | "portal";
  email_subject?: string | null;
  created_at: string;
  author_name?: string | null;
  author_email?: string | null;
  from_student?: boolean;
};

export type TicketWithMeta = SupportTicket & {
  assignee_name?: string | null;
  assignee_email?: string | null;
  notes?: SupportTicketNote[];
  /** Resolved from linked enrolment (student or matching email). */
  parish_id?: string | null;
  parish_name?: string | null;
  batch_id?: string | null;
  batch_label?: string | null;
};

export function isSupportTopic(value: string): value is SupportTopic {
  return (SUPPORT_TOPICS as readonly string[]).includes(value);
}

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isTicketPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value);
}

/** Short memorable desk reference: SOD-A7K2 */
export function generateTicketReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `SOD-${code}`;
}

export function formatTicketWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatTicketDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Clock stamp for chat bubbles (WhatsApp-style). */
export function formatTicketClock(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Calendar key for grouping chat messages by local day. */
export function ticketDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatTicketDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThat = new Date(date);
  startOfThat.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThat.getTime()) / 86_400_000,
  );

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year:
        date.getFullYear() === startOfToday.getFullYear()
          ? undefined
          : "numeric",
    }).format(date);
  } catch {
    return formatTicketDay(iso);
  }
}

/** Compact "3h ago" style stamp for dense lists. */
export function formatTicketRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return formatTicketDay(iso);
}

/** Latest shared reply body for inbox previews (falls back to opening note). */
export function latestTicketSnippet(ticket: TicketWithMeta): string {
  const notes = (ticket.notes ?? []).filter((note) => note.is_internal !== true);
  const last = notes.length > 0 ? notes[notes.length - 1] : null;
  const raw = (last?.body ?? ticket.message).replace(/\s+/g, " ").trim();
  return raw;
}

/** Timestamp of the newest shared activity on a ticket. */
export function latestTicketActivityAt(ticket: TicketWithMeta): string {
  const notes = (ticket.notes ?? []).filter((note) => note.is_internal !== true);
  const last = notes.length > 0 ? notes[notes.length - 1] : null;
  return last?.created_at ?? ticket.updated_at ?? ticket.created_at;
}

export function activeQueueStatuses(): TicketStatus[] {
  return ["open", "in_progress", "waiting"];
}

export function isActiveTicket(status: TicketStatus): boolean {
  return activeQueueStatuses().includes(status);
}
