"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
  type AdminProfile,
} from "@/lib/admin/auth";
import { formatBatchLabel } from "@/lib/parishes";
import { publicActionMessage } from "@/lib/safe-action-message";
import {
  GALLERY_SIGNED_URL_TTL_SEC,
  STUDENT_PHOTOS_BUCKET,
  signStudentPhotoUrls,
} from "@/lib/student/photos";
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

export async function listAdminGallery(
  filter: "all" | "flagged" | "taken_down" = "all",
): Promise<AdminGalleryItem[]> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();

  if (!isNationalAdmin(actor) && !actor.parish_id) {
    return [];
  }

  let enrolQ = supabase
    .from("enrolments")
    .select(
      "user_id, first_name, last_name, email, parish_id, batch_id, created_at, parishes(name), batches(name, year)",
    )
    .order("created_at", { ascending: false });

  if (!isNationalAdmin(actor) && actor.parish_id) {
    enrolQ = enrolQ.eq("parish_id", actor.parish_id);
  }

  const { data: enrolRows, error: enrolError } = await enrolQ.limit(800);
  if (enrolError) throw new Error(enrolError.message);

  function one<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
  }

  const latestByUser = new Map<
    string,
    {
      first_name: string;
      last_name: string;
      email: string;
      parish_id: string | null;
      parish_name: string | null;
      batch_label: string | null;
    }
  >();

  for (const row of enrolRows ?? []) {
    const userId = row.user_id as string;
    if (latestByUser.has(userId)) continue;
    const parish = one(
      row.parishes as { name: string } | { name: string }[] | null,
    );
    const batch = one(
      row.batches as
        | { name: string; year: number }
        | { name: string; year: number }[]
        | null,
    );
    latestByUser.set(userId, {
      first_name: (row.first_name as string) || "",
      last_name: (row.last_name as string) || "",
      email: (row.email as string) || "",
      parish_id: (row.parish_id as string | null) ?? null,
      parish_name: parish?.name ?? null,
      batch_label: batch
        ? formatBatchLabel({ name: batch.name, year: batch.year })
        : null,
    });
  }

  const userIds = Array.from(latestByUser.keys());
  if (userIds.length === 0) return [];

  let profileQ = supabase
    .from("student_profiles")
    .select(
      "id, email, graduation_selfie_path, graduation_selfie_uploaded_at, selfie_moderation_status, selfie_moderation_note, selfie_moderated_at, is_active",
    )
    .in("id", userIds)
    .eq("is_active", true);

  if (filter === "flagged") {
    profileQ = profileQ.eq("selfie_moderation_status", "flagged");
  } else if (filter === "taken_down") {
    profileQ = profileQ.eq("selfie_moderation_status", "taken_down");
  } else {
    profileQ = profileQ.or(
      "graduation_selfie_path.not.is.null,selfie_moderation_status.eq.taken_down",
    );
  }

  const { data: profiles, error: profileError } = await profileQ.limit(400);
  if (profileError) throw new Error(profileError.message);

  const signed = await signStudentPhotoUrls(
    (profiles ?? []).map((p) => p.graduation_selfie_path as string | null),
    GALLERY_SIGNED_URL_TTL_SEC,
  );

  const items: AdminGalleryItem[] = [];
  for (const person of profiles ?? []) {
    const meta = latestByUser.get(person.id as string);
    if (!meta) continue;
    const path = person.graduation_selfie_path as string | null;
    const imageUrl = path ? (signed.get(path) ?? null) : null;
    const status =
      (person.selfie_moderation_status as GalleryModerationStatus | null) ??
      "visible";
    items.push({
      userId: person.id as string,
      displayName:
        [meta.first_name, meta.last_name].filter(Boolean).join(" ") ||
        "Student",
      email: meta.email || (person.email as string) || "",
      parishId: meta.parish_id,
      parishName: meta.parish_name,
      batchLabel: meta.batch_label,
      imageUrl,
      path,
      uploadedAt: (person.graduation_selfie_uploaded_at as string | null) ?? null,
      moderationStatus: status,
      moderationNote: (person.selfie_moderation_note as string | null) ?? null,
      moderatedAt: (person.selfie_moderated_at as string | null) ?? null,
    });
  }

  items.sort((a, b) => {
    const rank = (s: GalleryModerationStatus) =>
      s === "flagged" ? 0 : s === "taken_down" ? 1 : 2;
    const dr = rank(a.moderationStatus) - rank(b.moderationStatus);
    if (dr !== 0) return dr;
    return a.displayName.localeCompare(b.displayName);
  });

  return items;
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
    return { ok: true, message: "Portrait flagged for review." };
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
