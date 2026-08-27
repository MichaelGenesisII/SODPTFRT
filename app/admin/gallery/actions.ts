"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
  type AdminProfile,
} from "@/lib/admin/auth";
import {
  GALLERY_PAGE_SIZE,
  type GalleryModerationFilter,
} from "@/lib/gallery/constants";
import {
  fetchGalleryPortraitPage,
  mapAdminGalleryItems,
} from "@/lib/gallery/list-page";
import { publicActionMessage } from "@/lib/safe-action-message";
import { STUDENT_PHOTOS_BUCKET } from "@/lib/student/photos";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type GalleryModerationStatus = "visible" | "flagged" | "taken_down";

export type AdminGalleryItem = {
  userId: string;
  displayName: string;
  email: string;
  parishId: string | null;
  parishName: string | null;
  batchLabel: string | null;
  imageUrl: string | null;
  path: string | null;
  uploadedAt: string | null;
  moderationStatus: GalleryModerationStatus;
  moderationNote: string | null;
  moderatedAt: string | null;
};

export type GalleryActionResult = {
  ok: boolean;
  message: string;
};

function fail(error: unknown, fallback: string): GalleryActionResult {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

function revalidateGallery() {
  revalidatePath("/admin/gallery");
  revalidatePath("/student/gallery");
  revalidatePath("/student/payments");
  revalidatePath("/student");
}

async function requireAccessibleStudentPhoto(userId: string): Promise<
  | { ok: true; actor: AdminProfile; parishId: string | null }
  | { ok: false; message: string }
> {
  let actor: AdminProfile;
  try {
    actor = await requireSessionAdmin();
  } catch {
    return { ok: false, message: "Unauthorized." };
  }

  if (!userId) {
    return { ok: false, message: "Student is required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: enrolment, error } = await supabase
    .from("enrolments")
    .select("parish_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[admin/gallery/scope]", error);
    return { ok: false, message: publicActionMessage(error.message) };
  }

  const parishId = enrolment?.parish_id ?? null;

  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return {
        ok: false,
        message: "Parish desk is not assigned to a parish.",
      };
    }
    if (!parishId || parishId !== actor.parish_id) {
      return {
        ok: false,
        message: "Student not found or outside your parish scope.",
      };
    }
  }

  return { ok: true, actor, parishId };
}

export type AdminGalleryTab = "all" | "flagged" | "taken_down";

export type AdminGalleryPage = {
  items: AdminGalleryItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminGalleryCounts = {
  all: number;
  flagged: number;
  takenDown: number;
};

function tabToFilter(tab: AdminGalleryTab): GalleryModerationFilter {
  if (tab === "flagged") return "flagged";
  if (tab === "taken_down") return "taken_down";
  return "all_admin";
}

async function adminGalleryScope(actor: AdminProfile) {
  if (!isNationalAdmin(actor) && !actor.parish_id) {
    return null;
  }
  return isNationalAdmin(actor) ? null : actor.parish_id;
}

export async function getAdminGalleryCounts(): Promise<AdminGalleryCounts> {
  const actor = await requireSessionAdmin();
  const parishScope = await adminGalleryScope(actor);
  if (parishScope === null && !isNationalAdmin(actor)) {
    return { all: 0, flagged: 0, takenDown: 0 };
  }

  const base = {
    scope: "parish" as const,
    page: 1,
    viewerEnrolment: {
      parish_id: parishScope,
      batch_id: null,
      cohort_id: null,
    },
    pageSize: 1,
    adminParishId: parishScope,
  };

  const [allPage, flaggedPage, takenDownPage] = await Promise.all([
    fetchGalleryPortraitPage({
      ...base,
      moderationFilter: "all_admin",
    }),
    fetchGalleryPortraitPage({
      ...base,
      moderationFilter: "flagged",
    }),
    fetchGalleryPortraitPage({
      ...base,
      moderationFilter: "taken_down",
    }),
  ]);

  return {
    all: allPage.total,
    flagged: flaggedPage.total,
    takenDown: takenDownPage.total,
  };
}

export async function listAdminGalleryPage(input: {
  tab?: AdminGalleryTab;
  page?: number;
  search?: string | null;
}): Promise<AdminGalleryPage> {
  const actor = await requireSessionAdmin();
  const parishScope = await adminGalleryScope(actor);
  if (parishScope === null && !isNationalAdmin(actor)) {
    return { items: [], total: 0, page: 1, pageSize: GALLERY_PAGE_SIZE };
  }

  const tab = input.tab ?? "all";
  const result = await fetchGalleryPortraitPage({
    scope: "parish",
    page: input.page ?? 1,
    viewerEnrolment: {
      parish_id: parishScope,
      batch_id: null,
      cohort_id: null,
    },
    moderationFilter: tabToFilter(tab),
    search: input.search,
    adminParishId: parishScope,
  });

  const items = await mapAdminGalleryItems(result.items);
  return {
    items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function flagGallerySelfie(
  userId: string,
  note: string,
): Promise<GalleryActionResult> {
  try {
    const access = await requireAccessibleStudentPhoto(userId);
    if (!access.ok) return { ok: false, message: access.message };

    const reason = note.trim();
    if (reason.length < 3) {
      return { ok: false, message: "Add a short note for the flag." };
    }
    if (reason.length > 500) {
      return { ok: false, message: "Keep the note under 500 characters." };
    }

    const service = createServiceSupabaseClient();
    const { data, error } = await service
      .from("student_profiles")
      .update({
        selfie_moderation_status: "flagged",
        selfie_moderation_note: reason,
        selfie_moderated_at: new Date().toISOString(),
        selfie_moderated_by: access.actor.id,
      })
      .eq("id", userId)
      .not("graduation_selfie_path", "is", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/gallery/flag]", error);
      return fail(error, "Could not flag this portrait.");
    }
    if (!data) {
      return {
        ok: false,
        message: "No portrait on file to flag.",
      };
    }

    revalidateGallery();
    return { ok: true, message: "Portrait flagged. It is hidden from the student gallery until restored or taken down." };
  } catch (error) {
    console.error("[admin/gallery/flag]", error);
    return fail(error, "Could not flag this portrait.");
  }
}

export async function takeDownGallerySelfie(
  userId: string,
  note: string,
): Promise<GalleryActionResult> {
  try {
    const access = await requireAccessibleStudentPhoto(userId);
    if (!access.ok) return { ok: false, message: access.message };

    const reason = note.trim();
    if (reason.length < 3) {
      return {
        ok: false,
        message: "Add a reason so the student understands the take-down.",
      };
    }
    if (reason.length > 500) {
      return { ok: false, message: "Keep the reason under 500 characters." };
    }

    const service = createServiceSupabaseClient();
    const { data, error } = await service
      .from("student_profiles")
      .update({
        selfie_moderation_status: "taken_down",
        selfie_moderation_note: reason,
        selfie_moderated_at: new Date().toISOString(),
        selfie_moderated_by: access.actor.id,
      })
      .eq("id", userId)
      .not("graduation_selfie_path", "is", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/gallery/takedown]", error);
      return fail(error, "Could not take down this portrait.");
    }
    if (!data) {
      return {
        ok: false,
        message: "No portrait on file to take down.",
      };
    }

    revalidateGallery();
    return {
      ok: true,
      message: "Portrait taken down. The student can upload a replacement.",
    };
  } catch (error) {
    console.error("[admin/gallery/takedown]", error);
    return fail(error, "Could not take down this portrait.");
  }
}

export async function restoreGallerySelfie(
  userId: string,
): Promise<GalleryActionResult> {
  try {
    const access = await requireAccessibleStudentPhoto(userId);
    if (!access.ok) return { ok: false, message: access.message };

    const service = createServiceSupabaseClient();
    const { data, error } = await service
      .from("student_profiles")
      .update({
        selfie_moderation_status: "visible",
        selfie_moderation_note: null,
        selfie_moderated_at: new Date().toISOString(),
        selfie_moderated_by: access.actor.id,
      })
      .eq("id", userId)
      .not("graduation_selfie_path", "is", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/gallery/restore]", error);
      return fail(error, "Could not restore this portrait.");
    }
    if (!data) {
      return {
        ok: false,
        message: "No portrait on file to restore. Ask the student to upload again.",
      };
    }

    revalidateGallery();
    return { ok: true, message: "Portrait restored to the gallery." };
  } catch (error) {
    console.error("[admin/gallery/restore]", error);
    return fail(error, "Could not restore this portrait.");
  }
}

export async function deleteGallerySelfie(
  userId: string,
  note: string,
): Promise<GalleryActionResult> {
  try {
    const access = await requireAccessibleStudentPhoto(userId);
    if (!access.ok) return { ok: false, message: access.message };

    const reason = note.trim();
    if (reason.length < 3) {
      return { ok: false, message: "Add a reason before deleting." };
    }
    if (reason.length > 500) {
      return { ok: false, message: "Keep the reason under 500 characters." };
    }

    const service = createServiceSupabaseClient();
    const { data: row } = await service
      .from("student_profiles")
      .select("graduation_selfie_path")
      .eq("id", userId)
      .maybeSingle();

    if (row?.graduation_selfie_path) {
      await service.storage
        .from(STUDENT_PHOTOS_BUCKET)
        .remove([row.graduation_selfie_path]);
    }

    const { error } = await service
      .from("student_profiles")
      .update({
        graduation_selfie_path: null,
        graduation_selfie_mime: null,
        graduation_selfie_uploaded_at: null,
        selfie_moderation_status: "taken_down",
        selfie_moderation_note: reason,
        selfie_moderated_at: new Date().toISOString(),
        selfie_moderated_by: access.actor.id,
      })
      .eq("id", userId);

    if (error) {
      console.error("[admin/gallery/delete]", error);
      return fail(error, "Could not delete this portrait.");
    }

    revalidateGallery();
    return {
      ok: true,
      message: "Portrait deleted. The student may upload a new selfie.",
    };
  } catch (error) {
    console.error("[admin/gallery/delete]", error);
    return fail(error, "Could not delete this portrait.");
  }
}
