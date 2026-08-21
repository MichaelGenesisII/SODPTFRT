"use server";

import { revalidatePath } from "next/cache";
import { canUploadPassport, getFeePayment } from "@/lib/payments/service";
import { computeGraduationEligibility } from "@/lib/graduation/eligibility";
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
import type { GalleryScope } from "@/lib/gallery/constants";
import {
  fetchGalleryPortraitPage,
  mapGalleryPhotos,
} from "@/lib/gallery/list-page";

export type PhotoActionResult = {
  ok: boolean;
  message: string;
};

export type GalleryPhoto = {
  userId: string;
  displayName: string;
  parishName: string | null;
  batchLabel: string | null;
  cohortLabel?: string | null;
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

    const passportAllowed = await canUploadPassport(supabase, profile.id);
    if (!passportAllowed) {
      return {
        ok: false,
        message:
          "Upload your passport photo after your first tuition instalment is confirmed.",
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
    const eligibility = await computeGraduationEligibility(
      supabase,
      profile.id,
    );
    if (!eligibility.eligible) {
      return {
        ok: false,
        message:
          "Complete your graduation checklist before uploading a portrait.",
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
  scope: GalleryScope,
  page = 1,
): Promise<
  | {
      ok: true;
      photos: GalleryPhoto[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { ok: false; message: string }
> {
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
          "Your batch is not set yet. Try cohort or parish gallery.",
      };
    }
    if (scope === "cohort" && !enrolment.cohort_id) {
      return {
        ok: false,
        message:
          "Your cohort is not set yet. Parish gallery is still available.",
      };
    }

    const result = await fetchGalleryPortraitPage({
      scope,
      page,
      viewerEnrolment: {
        parish_id: enrolment.parish_id,
        batch_id: enrolment.batch_id ?? null,
        cohort_id: enrolment.cohort_id ?? null,
      },
      moderationFilter: "visible",
    });

    const photos = await mapGalleryPhotos(result.items, profile.id);

    return {
      ok: true,
      photos,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
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
