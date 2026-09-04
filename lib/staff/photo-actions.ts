import { publicActionMessage } from "@/lib/safe-action-message";
import {
  MAX_STAFF_PHOTO_BYTES,
  STAFF_PHOTO_MIME_TYPES,
  STAFF_PHOTOS_BUCKET,
  staffAvatarObjectPath,
} from "@/lib/staff/photos";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type StaffPhotoActionResult = {
  ok: boolean;
  message: string;
};

type StaffProfileTable = "admin_profiles" | "teacher_profiles";

function fail(error: unknown, fallback: string): StaffPhotoActionResult {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

export async function upsertStaffAvatar(params: {
  userId: string;
  table: StaffProfileTable;
  formData: FormData;
}): Promise<StaffPhotoActionResult> {
  try {
    const file = params.formData.get("photo");

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Choose a clear photograph to upload." };
    }
    if (file.size > MAX_STAFF_PHOTO_BYTES) {
      return { ok: false, message: "Photo must be 5MB or smaller." };
    }
    if (
      !STAFF_PHOTO_MIME_TYPES.includes(
        file.type as (typeof STAFF_PHOTO_MIME_TYPES)[number],
      )
    ) {
      return { ok: false, message: "Use a JPG, PNG, or WEBP image." };
    }

    const service = createServiceSupabaseClient();
    const { data: existing, error: loadError } = await service
      .from(params.table)
      .select("avatar_path")
      .eq("id", params.userId)
      .maybeSingle();

    if (loadError) {
      console.error("[staff/photos/load]", loadError);
      return fail(loadError, "Could not load your profile.");
    }

    const path = staffAvatarObjectPath(params.userId, file.type);
    const buffer = Buffer.from(await file.arrayBuffer());
    const previousPath =
      typeof existing?.avatar_path === "string" ? existing.avatar_path : null;

    if (previousPath && previousPath !== path) {
      await service.storage.from(STAFF_PHOTOS_BUCKET).remove([previousPath]);
    }

    const { error: uploadError } = await service.storage
      .from(STAFF_PHOTOS_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error("[staff/photos/upload]", uploadError);
      return fail(uploadError, "Could not upload your photograph.");
    }

    const now = new Date().toISOString();
    const { error: updateError } = await service
      .from(params.table)
      .update({
        avatar_path: path,
        avatar_mime: file.type,
        avatar_uploaded_at: now,
      })
      .eq("id", params.userId);

    if (updateError) {
      console.error("[staff/photos/save]", updateError);
      await service.storage.from(STAFF_PHOTOS_BUCKET).remove([path]);
      return fail(updateError, "Could not save your photograph.");
    }

    return {
      ok: true,
      message: previousPath
        ? "Profile picture updated."
        : "Profile picture saved.",
    };
  } catch (error) {
    console.error("[staff/photos/upsert]", error);
    return fail(error, "Could not upload your photograph.");
  }
}

export async function removeStaffAvatar(params: {
  userId: string;
  table: StaffProfileTable;
}): Promise<StaffPhotoActionResult> {
  try {
    const service = createServiceSupabaseClient();
    const { data: row, error: loadError } = await service
      .from(params.table)
      .select("avatar_path")
      .eq("id", params.userId)
      .maybeSingle();

    if (loadError) {
      console.error("[staff/photos/delete-load]", loadError);
      return fail(loadError, "Could not load your profile.");
    }

    if (!row?.avatar_path) {
      return { ok: false, message: "No profile picture on file." };
    }

    await service.storage
      .from(STAFF_PHOTOS_BUCKET)
      .remove([row.avatar_path as string]);

    const { error } = await service
      .from(params.table)
      .update({
        avatar_path: null,
        avatar_mime: null,
        avatar_uploaded_at: null,
      })
      .eq("id", params.userId);

    if (error) {
      console.error("[staff/photos/delete]", error);
      return fail(error, "Could not remove your photograph.");
    }

    return { ok: true, message: "Profile picture removed." };
  } catch (error) {
    console.error("[staff/photos/delete]", error);
    return fail(error, "Could not remove your photograph.");
  }
}
