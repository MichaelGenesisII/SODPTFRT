"use server";

import { revalidatePath } from "next/cache";
import { getFeePayment } from "@/lib/payments/service";
import { publicActionMessage } from "@/lib/safe-action-message";
import {
  MAX_STUDENT_PHOTO_BYTES,
  STUDENT_PHOTO_MIME_TYPES,
  STUDENT_PHOTOS_BUCKET,
  studentPhotoObjectPath,
  type StudentPhotoKind,
  GALLERY_SIGNED_URL_TTL_SEC,
  signStudentPhotoUrls,
} from "@/lib/student/photos";
import { getSessionStudent, getStudentEnrolment } from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { formatBatchLabel } from "@/lib/parishes";

export type PhotoActionResult = {
  ok: boolean;
  message: string;
};

export type GalleryPhoto = {
  userId: string;
  displayName: string;
  parishName: string | null;
  batchLabel: string | null;
  imageUrl: string;
  isSelf?: boolean;
  moderationStatus?: string | null;
};

function fail(error: unknown, fallback: string): PhotoActionResult {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

async function requireActiveStudent() {
  const profile = await getSessionStudent();
  if (!profile) throw new Error("Unauthorized");
  return profile;
}

function revalidatePhotoPaths() {
  revalidatePath("/student");
  revalidatePath("/student/payments");
  revalidatePath("/student/gallery");
  revalidatePath("/admin/gallery");
}

export async function uploadPassportPhoto(
  formData: FormData,
): Promise<PhotoActionResult> {
  try {
    const profile = await requireActiveStudent();
    const file = formData.get("photo");

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Choose a clear photograph to upload." };
    }
    if (file.size > MAX_STUDENT_PHOTO_BYTES) {
      return { ok: false, message: "Photo must be 5MB or smaller." };
    }
    if (
      !STUDENT_PHOTO_MIME_TYPES.includes(
        file.type as (typeof STUDENT_PHOTO_MIME_TYPES)[number],
      )
    ) {
      return { ok: false, message: "Use a JPG, PNG, or WEBP image." };
    }

    const supabase = await createServerSupabaseClient();
    const { data: row, error: profileError } = await supabase
      .from("student_profiles")
      .select("passport_path")
      .eq("id", profile.id)
      .maybeSingle();

    if (profileError) {
      console.error("[student/photos/passport]", profileError);
      return fail(profileError, "Could not load your profile.");
    }
    if (row?.passport_path) {
      return {
        ok: false,
        message:
          "Your passport photograph is already on file and cannot be changed.",
      };
    }

    const fee = await getFeePayment(supabase, profile.id, "application");
    if (!fee || fee.status !== "paid") {
      return {
        ok: false,
        message: "Upload your passport photo after the application fee is paid.",
      };
    }

    const path = studentPhotoObjectPath(profile.id, "passport", file.type);
    const buffer = Buffer.from(await file.arrayBuffer());
    const service = createServiceSupabaseClient();

    const { error: uploadError } = await service.storage
      .from(STUDENT_PHOTOS_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("[student/photos/passport-upload]", uploadError);
      return fail(uploadError, "Could not upload your photograph.");
    }

    const now = new Date().toISOString();
    const { error: updateError } = await service
      .from("student_profiles")
      .update({
        passport_path: path,
        passport_mime: file.type,
        passport_uploaded_at: now,
      })
      .eq("id", profile.id)
      .is("passport_path", null);

    if (updateError) {
      console.error("[student/photos/passport-save]", updateError);
      await service.storage.from(STUDENT_PHOTOS_BUCKET).remove([path]);
      return fail(updateError, "Could not save your photograph.");
    }

    revalidatePhotoPaths();
    return {
      ok: true,
      message: "Passport photograph saved. It cannot be changed.",
    };
  } catch (error) {
    console.error("[student/photos/passport]", error);
    return fail(error, "Could not upload your photograph.");
  }
}

export async function uploadGraduationSelfie(
  formData: FormData,
): Promise<PhotoActionResult> {
  try {
    const profile = await requireActiveStudent();
    const file = formData.get("photo");

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Choose a clear photograph to upload." };
    }
    if (file.size > MAX_STUDENT_PHOTO_BYTES) {
      return { ok: false, message: "Photo must be 5MB or smaller." };
    }
    if (
      !STUDENT_PHOTO_MIME_TYPES.includes(
        file.type as (typeof STUDENT_PHOTO_MIME_TYPES)[number],
      )
    ) {
      return { ok: false, message: "Use a JPG, PNG, or WEBP image." };
    }

    const supabase = await createServerSupabaseClient();
    const fee = await getFeePayment(supabase, profile.id, "graduation");
    if (!fee || fee.status !== "paid") {
      return {
        ok: false,
        message:
          "Upload your graduation selfie after the graduation fee is paid.",
      };
    }

    const { data: existing } = await supabase
      .from("student_profiles")
      .select("graduation_selfie_path")
      .eq("id", profile.id)
      .maybeSingle();

    const path = studentPhotoObjectPath(
      profile.id,
      "graduation_selfie",
      file.type,
    );
    const buffer = Buffer.from(await file.arrayBuffer());
    const service = createServiceSupabaseClient();

    // Remove previous object(s) so mime/extension changes stay clean.
    if (existing?.graduation_selfie_path) {
      await service.storage
        .from(STUDENT_PHOTOS_BUCKET)
        .remove([existing.graduation_selfie_path]);
    }

    const { error: uploadError } = await service.storage
      .from(STUDENT_PHOTOS_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error("[student/photos/selfie-upload]", uploadError);
      return fail(uploadError, "Could not upload your photograph.");
    }

    const now = new Date().toISOString();
    const { error: updateError } = await service
      .from("student_profiles")
      .update({
        graduation_selfie_path: path,
        graduation_selfie_mime: file.type,
        graduation_selfie_uploaded_at: now,
        selfie_moderation_status: "visible",
        selfie_moderation_note: null,
        selfie_moderated_at: null,
        selfie_moderated_by: null,
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("[student/photos/selfie-save]", updateError);
      return fail(updateError, "Could not save your photograph.");
    }

    revalidatePhotoPaths();
    return {
      ok: true,
      message: existing?.graduation_selfie_path
        ? "Graduation selfie updated."
        : "Graduation selfie saved.",
    };
  } catch (error) {
    console.error("[student/photos/selfie]", error);
    return fail(error, "Could not upload your photograph.");
  }
}

export async function deleteGraduationSelfie(): Promise<PhotoActionResult> {
  try {
    const profile = await requireActiveStudent();
    const service = createServiceSupabaseClient();
    const { data: row } = await service
      .from("student_profiles")
      .select("graduation_selfie_path")
      .eq("id", profile.id)
      .maybeSingle();

    if (!row?.graduation_selfie_path) {
      return { ok: false, message: "No graduation selfie on file." };
    }

    await service.storage
      .from(STUDENT_PHOTOS_BUCKET)
      .remove([row.graduation_selfie_path]);

    const { error } = await service
      .from("student_profiles")
      .update({
        graduation_selfie_path: null,
        graduation_selfie_mime: null,
        graduation_selfie_uploaded_at: null,
        selfie_moderation_status: null,
        selfie_moderation_note: null,
        selfie_moderated_at: null,
        selfie_moderated_by: null,
      })
      .eq("id", profile.id);

    if (error) {
      console.error("[student/photos/selfie-delete]", error);
      return fail(error, "Could not remove your selfie.");
    }

    revalidatePhotoPaths();
    return { ok: true, message: "Graduation selfie removed." };
  } catch (error) {
    console.error("[student/photos/selfie-delete]", error);
    return fail(error, "Could not remove your selfie.");
  }
}

export async function listGalleryPhotos(
  scope: "batch" | "parish",
): Promise<{ ok: true; photos: GalleryPhoto[] } | { ok: false; message: string }> {
  try {
    const profile = await requireActiveStudent();
    const enrolment = await getStudentEnrolment(profile.id);
    if (!enrolment?.parish_id) {
      return {
        ok: false,
        message:
          "Your parish is not set yet. Gallery opens after enrolment is assigned.",
      };
    }
    if (scope === "batch" && !enrolment.batch_id) {
      return {
        ok: false,
        message:
          "Your batch is not set yet. Parish gallery is still available.",
      };
    }

    const service = createServiceSupabaseClient();
    let enrolQuery = service
      .from("enrolments")
      .select(
        "user_id, first_name, last_name, parish_id, batch_id, created_at, parishes(name), batches(name, year)",
      )
      .eq("parish_id", enrolment.parish_id)
      .order("created_at", { ascending: false });

    if (scope === "batch" && enrolment.batch_id) {
      enrolQuery = enrolQuery.eq("batch_id", enrolment.batch_id);
    }

    const { data: enrolRows, error: enrolError } = await enrolQuery.limit(400);
    if (enrolError) {
      console.error("[student/gallery/enrol]", enrolError);
      return {
        ok: false,
        message: publicActionMessage(
          enrolError,
          "Gallery is temporarily unavailable. Please try again later.",
        ),
      };
    }

    const latestByUser = new Map<
      string,
      {
        user_id: string;
        first_name: string;
        last_name: string;
        parish_name: string | null;
        batch_label: string | null;
      }
    >();

    function one<T>(value: T | T[] | null | undefined): T | null {
      if (!value) return null;
      return Array.isArray(value) ? (value[0] ?? null) : value;
    }

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
        user_id: userId,
        first_name: (row.first_name as string) || "",
        last_name: (row.last_name as string) || "",
        parish_name: parish?.name ?? null,
        batch_label: batch
          ? formatBatchLabel({ name: batch.name, year: batch.year })
          : null,
      });
    }

    const userIds = Array.from(latestByUser.keys());
    if (userIds.length === 0) {
      return { ok: true, photos: [] };
    }

    const { data: profiles, error: profileError } = await service
      .from("student_profiles")
      .select(
        "id, graduation_selfie_path, is_active, selfie_moderation_status",
      )
      .in("id", userIds)
      .eq("is_active", true)
      .not("graduation_selfie_path", "is", null);

    if (profileError) {
      console.error("[student/gallery/profiles]", profileError);
      return {
        ok: false,
        message: publicActionMessage(
          profileError,
          "Gallery is temporarily unavailable. Please try again later.",
        ),
      };
    }

    const candidates: Array<{
      id: string;
      path: string;
      status: string;
      meta: {
        first_name: string;
        last_name: string;
        parish_name: string | null;
        batch_label: string | null;
      };
    }> = [];

    for (const person of profiles ?? []) {
      const status =
        (person.selfie_moderation_status as string | null) ?? "visible";
      if (status === "taken_down") continue;
      const path = person.graduation_selfie_path as string | null;
      if (!path) continue;
      const meta = latestByUser.get(person.id as string);
      if (!meta) continue;
      candidates.push({
        id: person.id as string,
        path,
        status,
        meta,
      });
    }

    const signed = await signStudentPhotoUrls(
      candidates.map((c) => c.path),
      GALLERY_SIGNED_URL_TTL_SEC,
    );

    const photos: GalleryPhoto[] = [];
    for (const candidate of candidates) {
      const imageUrl = signed.get(candidate.path);
      if (!imageUrl) continue;
      photos.push({
        userId: candidate.id,
        displayName:
          [candidate.meta.first_name, candidate.meta.last_name]
            .filter(Boolean)
            .join(" ") || "Student",
        parishName: candidate.meta.parish_name,
        batchLabel: candidate.meta.batch_label,
        imageUrl,
        isSelf: candidate.id === profile.id,
        moderationStatus: candidate.status,
      });
    }

    photos.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return { ok: true, photos };
  } catch (error) {
    console.error("[student/gallery]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Gallery is temporarily unavailable. Please try again later.",
      ),
    };
  }
}
