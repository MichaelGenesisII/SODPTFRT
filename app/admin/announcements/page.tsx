import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  listBatchesForAdmin,
  listParishesForAdmin,
} from "@/app/admin/parishes/actions";
import {
  listAnnouncementAttachmentsForAdmin,
  signedNoticeAttachmentUrls,
} from "@/app/admin/desk-attachments/actions";
import { AnnouncementsManager } from "@/components/admin/announcements-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import {
  MAX_GENERAL_ANNOUNCEMENTS,
  MAX_STUDENT_LIVE_ANNOUNCEMENTS,
  type AdminAnnouncementRecord,
} from "@/lib/announcements";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Notices | School of Disciples Portal",
};

export default async function AdminAnnouncementsPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const supabase = await createServerSupabaseClient();
  let announcements: AdminAnnouncementRecord[] = [];
  let loadError: string | null = null;

  const [announcementResult, parishes, batches] = await Promise.all([
    supabase
      .from("announcements")
      .select(
        "id, title, body, href, href_label, audience, is_published, published_at, created_at, updated_at, parish_id, batch_id",
      )
      .order("updated_at", { ascending: false })
      .limit(100),
    listParishesForAdmin().catch(() => []),
    listBatchesForAdmin(
      isNationalAdmin(profile) ? null : profile.parish_id,
    ).catch(() => []),
  ]);

  if (announcementResult.error) {
    console.error("admin announcements:", announcementResult.error.message);
    loadError = publicActionMessage(
      announcementResult.error,
      publicUnavailableMessage("Notices"),
    );
  } else {
    announcements = (announcementResult.data ?? []).map((row) => ({
      ...row,
      audience: row.audience === "students" ? "students" : "general",
      parish_id: row.parish_id ?? null,
      batch_id: row.batch_id ?? null,
    })) as AdminAnnouncementRecord[];

    const attachmentMap = await listAnnouncementAttachmentsForAdmin(
      announcements.map((item) => item.id),
    );

    const filesFlat: {
      announcementId: string;
      file: {
        id: string;
        original_name: string;
        mime: string;
        byte_size: number;
        storage_path: string;
        access_mode: "view" | "download" | "both";
      };
    }[] = [];
    for (const item of announcements) {
      for (const file of attachmentMap.get(item.id) ?? []) {
        filesFlat.push({ announcementId: item.id, file });
      }
    }

    const signedList = await Promise.all(
      filesFlat.map(async ({ announcementId, file }) => {
        const urls = await signedNoticeAttachmentUrls(
          file.storage_path,
          file.original_name,
          file.access_mode,
        );
        if (!urls.url && !urls.downloadUrl) return null;
        return {
          announcementId,
          attachment: {
            id: file.id,
            name: file.original_name,
            mime: file.mime,
            byteSize: file.byte_size,
            access: file.access_mode,
            url: urls.url,
            downloadUrl: urls.downloadUrl,
          },
        };
      }),
    );

    const byAnnouncement = new Map<
      string,
      NonNullable<(typeof signedList)[number]>["attachment"][]
    >();
    for (const item of signedList) {
      if (!item) continue;
      const list = byAnnouncement.get(item.announcementId) ?? [];
      list.push(item.attachment);
      byAnnouncement.set(item.announcementId, list);
    }
    for (const item of announcements) {
      item.attachments = byAnnouncement.get(item.id) ?? [];
    }
  }

  const national = isNationalAdmin(profile);

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Communications
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Notices
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {national ? (
            <>
              Two places: the <span className="text-ink/80">home page</span>{" "}
              (everyone, max {MAX_GENERAL_ANNOUNCEMENTS}) and the{" "}
              <span className="text-ink/80">student portal</span> (signed-in
              students, max {MAX_STUDENT_LIVE_ANNOUNCEMENTS} live). Student
              notices can cover all UK or one parish / batch.
            </>
          ) : (
            <>
              Post to your parish’s{" "}
              <span className="text-ink/80">student portal</span> board (max{" "}
              {MAX_STUDENT_LIVE_ANNOUNCEMENTS} live). Home-page notices are
              managed by the national desk.
            </>
          )}
        </p>
      </section>
      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : (
        <AnnouncementsManager
          announcements={announcements}
          profile={profile}
          parishes={parishes}
          batches={batches}
        />
      )}
    </div>
  );
}
