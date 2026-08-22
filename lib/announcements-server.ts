import {
  MAX_GENERAL_ANNOUNCEMENTS,
  MAX_STUDENT_ANNOUNCEMENTS,
  type Announcement,
  type AnnouncementAudience,
  type AnnouncementAttachmentView,
} from "@/lib/announcements";
import { signedNoticeAttachmentUrls } from "@/app/admin/desk-attachments/actions";
import type { NoticeAttachmentAccess } from "@/lib/desk-attachments";
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

function unwrapJoined<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeAccess(value: unknown): NoticeAttachmentAccess {
  if (value === "view" || value === "download" || value === "both") {
    return value;
  }
  return "both";
}

/**
 * Published notices for a lane, with signed attachment URLs.
 * Keep this in a server-only module — do not import from Client Components.
 */
export async function fetchPublishedAnnouncements(
  audience: AnnouncementAudience,
  limit: number,
): Promise<Announcement[]> {
  try {
    const supabase = await createServerSupabaseClient();
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
      console.error(
        `Failed to load ${audience} announcements:`,
        error?.message,
      );
      return [];
    }

    const rows = data as AdminAnnouncementRow[];
    const ids = rows.map((row) => row.id);
    const attachmentMap = new Map<
      string,
      {
        id: string;
        name: string;
        mime: string;
        byteSize: number;
        storage_path: string;
        access: NoticeAttachmentAccess;
      }[]
    >();

    if (ids.length) {
      const { data: links } = await supabase
        .from("announcement_attachments")
        .select(
          "announcement_id, sort_order, access_mode, desk_attachments(id, original_name, mime, byte_size, storage_path)",
        )
        .in("announcement_id", ids)
        .order("sort_order", { ascending: true });

      for (const link of links ?? []) {
        const file = unwrapJoined(
          link.desk_attachments as
            | {
                id: string;
                original_name: string;
                mime: string;
                byte_size: number;
                storage_path: string;
              }
            | {
                id: string;
                original_name: string;
                mime: string;
                byte_size: number;
                storage_path: string;
              }[]
            | null,
        );
        if (!file) continue;
        const list = attachmentMap.get(link.announcement_id as string) ?? [];
        list.push({
          id: file.id,
          name: file.original_name,
          mime: file.mime,
          byteSize: file.byte_size,
          storage_path: file.storage_path,
          access: normalizeAccess(link.access_mode),
        });
        attachmentMap.set(link.announcement_id as string, list);
      }
    }

    const notices: Announcement[] = [];
    for (const row of rows) {
      const files = attachmentMap.get(row.id) ?? [];
      const attachments = (
        await Promise.all(
          files.map(async (file): Promise<AnnouncementAttachmentView | null> => {
            const urls = await signedNoticeAttachmentUrls(
              file.storage_path,
              file.name,
              file.access,
            );
            if (!urls.url && !urls.downloadUrl) return null;
            return {
              id: file.id,
              name: file.name,
              mime: file.mime,
              byteSize: file.byteSize,
              access: file.access,
              url: urls.url,
              downloadUrl: urls.downloadUrl,
            };
          }),
        )
      ).filter((item): item is AnnouncementAttachmentView => Boolean(item));

      notices.push({
        id: row.id,
        title: row.title,
        body: row.body,
        publishedAt: row.published_at ?? undefined,
        href: row.href ?? undefined,
        hrefLabel: row.href_label ?? undefined,
        source: "admin" as const,
        audience: row.audience ?? audience,
        attachments: attachments.length ? attachments : undefined,
      });
    }

    return notices;
  } catch (error) {
    console.error(
      `Failed to load ${audience} announcements:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Student-only board notices for the signed-in portal. */
export async function fetchStudentAnnouncements(): Promise<Announcement[]> {
  return fetchPublishedAnnouncements("students", MAX_STUDENT_ANNOUNCEMENTS);
}

/** Home-page general notices with attachments. */
export async function fetchGeneralAnnouncements(
  limit = MAX_GENERAL_ANNOUNCEMENTS,
): Promise<Announcement[]> {
  return fetchPublishedAnnouncements("general", limit);
}
