import { cache } from "react";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const STAFF_PHOTOS_BUCKET = "staff-photos";
export const MAX_STAFF_PHOTO_BYTES = 5 * 1024 * 1024;
export const STAFF_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function staffPhotoExt(mime: string): "jpg" | "png" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** `{userId}/avatar.{ext}` */
export function staffAvatarObjectPath(userId: string, mime: string): string {
  return `${userId}/avatar.${staffPhotoExt(mime)}`;
}

export async function signStaffPhotoUrl(
  path: string | null | undefined,
  expiresSec = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  try {
    const service = createServiceSupabaseClient();
    const { data, error } = await service.storage
      .from(STAFF_PHOTOS_BUCKET)
      .createSignedUrl(path, expiresSec);
    if (error || !data?.signedUrl) {
      console.error("[staff/photos/sign]", error);
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    console.error("[staff/photos/sign]", error);
    return null;
  }
}

export const cachedSignStaffPhotoUrl = cache(
  (path: string | null | undefined) => signStaffPhotoUrl(path),
);
