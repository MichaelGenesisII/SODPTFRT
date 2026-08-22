import { enrolHref, SOD_SITE } from "@/lib/site-nav";
import { getSupabase } from "@/lib/supabase";

/** Max published general notices on the public home page. */
export const MAX_GENERAL_ANNOUNCEMENTS = 3;

/** Max published student-board notices (signed-in students). */
export const MAX_STUDENT_LIVE_ANNOUNCEMENTS = 8;

/** Student notices board can show a fuller archive of student notices. */
export const MAX_STUDENT_ANNOUNCEMENTS = 24;

/** @deprecated Prefer MAX_GENERAL_ANNOUNCEMENTS */
export const MAX_PUBLISHED_ANNOUNCEMENTS = MAX_GENERAL_ANNOUNCEMENTS;

/** Keep titles short so the pine preview stays balanced. */
export const ANNOUNCEMENT_TITLE_MAX = 72;

/** Keep bodies short so the home notice panel doesn’t overflow. */
export const ANNOUNCEMENT_BODY_MAX = 220;

export type AnnouncementAudience = "general" | "students";

export type AnnouncementSource = "static" | "admin";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  /** ISO date string when known; omit for evergreen pinned items */
  publishedAt?: string;
  href?: string;
  hrefLabel?: string;
  source: AnnouncementSource;
  audience?: AnnouncementAudience;
  attachments?: AnnouncementAttachmentView[];
};

export type AnnouncementAttachmentView = {
  id: string;
  name: string;
  mime: string;
  byteSize: number;
  /** view | download | both — set by admin when attaching. */
  access: "view" | "download" | "both";
  /** Inline / open-in-tab URL (signed). Present when access includes view. */
  url?: string;
  /** Force-download URL (signed). Present when access includes download. */
  downloadUrl?: string;
};

export type AdminAnnouncementRecord = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  href_label: string | null;
  audience: AnnouncementAudience;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  parish_id: string | null;
  batch_id: string | null;
  attachments?: AnnouncementAttachmentView[];
};

export const AUDIENCE_META: Record<
  AnnouncementAudience,
  { label: string; short: string; hint: string; surface: string }
> = {
  general: {
    label: "Home page",
    short: "Home",
    hint: "Visible to everyone on the public home page.",
    surface: "Home page",
  },
  students: {
    label: "Student portal",
    short: "Students",
    hint: "Only signed-in students see this on their Notices page.",
    surface: "Student portal",
  },
};

export function isAnnouncementAudience(
  value: string,
): value is AnnouncementAudience {
  return value === "general" || value === "students";
}

/**
 * Safe notice links: absolute http(s) or same-origin paths starting with `/`
 * (not protocol-relative `//…`).
 */
export function isSafeAnnouncementHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (value.startsWith("/") && !value.startsWith("//")) {
    // Block scheme-looking paths like /javascript:… is fine; reject backslash tricks
    if (value.includes("\\") || value.toLowerCase().startsWith("/\\")) {
      return false;
    }
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function maxPublishedForAudience(audience: AnnouncementAudience) {
  return audience === "general"
    ? MAX_GENERAL_ANNOUNCEMENTS
    : MAX_STUDENT_LIVE_ANNOUNCEMENTS;
}

/**
 * Evergreen portal notices — not managed in Supabase.
 * Aligned with portal scope: enrolment, student records, payments, classes.
 */
export const staticAnnouncements: Announcement[] = [
  {
    id: "static-enrol",
    title: "Self-enrolment for this academic year is now open",
    body: "Apply through the School of Disciples portal. Upload payment proof and required documents in one place — no external form.",
    href: enrolHref,
    hrefLabel: "Enrol now",
    source: "static",
    audience: "general",
  },
  {
    id: "static-records",
    title: "Your records, in one student portal",
    body: "Signed-in students can view attendance, exam results, payment status, and enrolment details — mobile-friendly, anytime.",
    href: "/login/student",
    hrefLabel: "Student sign-in",
    source: "static",
    audience: "general",
  },
  {
    id: "static-classes",
    title: "Live classes & exams inside the portal",
    body: "Join Zoom sessions from the student portal with automatic attendance, and sit timed tests set by administrators.",
    href: `${SOD_SITE}/faq/`,
    hrefLabel: "Read the FAQ",
    source: "static",
    audience: "general",
  },
];

type AdminAnnouncementRow = {
  id: string;
  title: string;
  body: string;
  published_at: string | null;
  href: string | null;
  href_label: string | null;
  is_published: boolean | null;
  audience?: AnnouncementAudience | null;
};

function mapAdminRow(row: AdminAnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at ?? undefined,
    href: row.href ?? undefined,
    hrefLabel: row.href_label ?? undefined,
    source: "admin",
    audience: row.audience ?? "general",
  };
}

/** Fetches published announcements for a given audience. */
export async function fetchAnnouncementsByAudience(
  audience: AnnouncementAudience,
  limit: number,
): Promise<Announcement[]> {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("announcements")
      .select(
        "id, title, body, published_at, href, href_label, is_published, audience",
      )
      .eq("is_published", true)
      .eq("audience", audience)
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      console.error("Failed to load announcements:", error?.message);
      return [];
    }

    return (data as AdminAnnouncementRow[]).map(mapAdminRow);
  } catch (error) {
    console.error(
      "Failed to load announcements:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Published general notices for the public home page. */
export async function fetchAdminAnnouncements(
  limit = MAX_GENERAL_ANNOUNCEMENTS,
): Promise<Announcement[]> {
  return fetchAnnouncementsByAudience("general", limit);
}

export type AnnouncementsBundle = {
  pinned: Announcement[];
  live: Announcement[];
};

export async function getAnnouncements(): Promise<AnnouncementsBundle> {
  const live = await fetchAnnouncementsByAudience(
    "general",
    MAX_GENERAL_ANNOUNCEMENTS,
  );
  return {
    pinned: staticAnnouncements,
    live,
  };
}

export function formatAnnouncementDate(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
