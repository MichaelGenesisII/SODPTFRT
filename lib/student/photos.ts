import { createServiceSupabaseClient } from "@/lib/supabase/service";

/** Passport + graduation selfie photo rules. */

export const STUDENT_PHOTOS_BUCKET = "student-photos";

export const MAX_STUDENT_PHOTO_BYTES = 5 * 1024 * 1024;

/** Gallery / desk signed URLs — long enough for a desk shift; pages also refresh on tab focus. */
export const GALLERY_SIGNED_URL_TTL_SEC = 60 * 60 * 4;

export const STUDENT_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type StudentPhotoKind = "passport" | "graduation_selfie";

export function studentPhotoExt(mime: string): "jpg" | "png" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function studentPhotoObjectPath(
  userId: string,
  kind: StudentPhotoKind,
  mime: string,
): string {
  const file =
    kind === "passport"
      ? `passport.${studentPhotoExt(mime)}`
      : `graduation-selfie.${studentPhotoExt(mime)}`;
  return `${userId}/${file}`;
}

export async function signStudentPhotoUrl(
  path: string | null | undefined,
  expiresSec = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  try {
    const service = createServiceSupabaseClient();
    const { data, error } = await service.storage
      .from(STUDENT_PHOTOS_BUCKET)
      .createSignedUrl(path, expiresSec);
    if (error || !data?.signedUrl) {
      console.error("[student/photos/sign]", error);
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    console.error("[student/photos/sign]", error);
    return null;
  }
}

/** Batch-sign gallery paths → Map<path, signedUrl>. */
export async function signStudentPhotoUrls(
  paths: Array<string | null | undefined>,
  expiresSec = GALLERY_SIGNED_URL_TTL_SEC,
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(paths.filter((p): p is string => Boolean(p))),
  );
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  try {
    const service = createServiceSupabaseClient();
    const { data, error } = await service.storage
      .from(STUDENT_PHOTOS_BUCKET)
      .createSignedUrls(unique, expiresSec);
    if (error) {
      console.error("[student/photos/sign-batch]", error);
      return out;
    }
    for (const row of data ?? []) {
      if (row.path && row.signedUrl && !row.error) {
        out.set(row.path, row.signedUrl);
      }
    }
  } catch (error) {
    console.error("[student/photos/sign-batch]", error);
  }
  return out;
}
