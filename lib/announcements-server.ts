import {
  MAX_STUDENT_ANNOUNCEMENTS,
  type Announcement,
  type AnnouncementAudience,
} from "@/lib/announcements";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

/**
 * Student-only board notices for the signed-in portal.
 * Uses the session client so RLS (`is_active_student`) can allow `students` rows.
 * Keep this in a server-only module — do not import from Client Components.
 */
export async function fetchStudentAnnouncements(): Promise<Announcement[]> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("announcements")
      .select(
        "id, title, body, published_at, href, href_label, is_published, audience",
      )
      .eq("is_published", true)
      .eq("audience", "students")
      .order("published_at", { ascending: false })
      .limit(MAX_STUDENT_ANNOUNCEMENTS);

    if (error || !data) {
      console.error("Failed to load student announcements:", error?.message);
      return [];
    }

    return (data as AdminAnnouncementRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      publishedAt: row.published_at ?? undefined,
      href: row.href ?? undefined,
      hrefLabel: row.href_label ?? undefined,
      source: "admin" as const,
      audience: row.audience ?? "students",
    }));
  } catch (error) {
    console.error(
      "Failed to load student announcements:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}
