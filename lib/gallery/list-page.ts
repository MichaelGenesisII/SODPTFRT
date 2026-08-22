import { formatCohortLabel } from "@/lib/cohorts";
import {
  GALLERY_PAGE_SIZE,
  type GalleryModerationFilter,
  type GalleryScope,
} from "@/lib/gallery/constants";
import { formatBatchLabel } from "@/lib/parishes";
import {
  GALLERY_SIGNED_URL_TTL_SEC,
  signStudentPhotoUrl,
  signStudentPhotoUrls,
} from "@/lib/student/photos";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type GalleryPortraitRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  parish_id: string | null;
  parish_name: string | null;
  batch_name: string | null;
  batch_year: number | null;
  cohort_name: string | null;
  cohort_year_start: number | null;
  cohort_year_end: number | null;
  selfie_path: string | null;
  selfie_uploaded_at: string | null;
  moderation_status: string | null;
  moderation_note: string | null;
  moderated_at: string | null;
  total_count: number;
};

export type GalleryPageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

function scopeFilters(
  scope: GalleryScope,
  enrolment: {
    parish_id: string | null;
    batch_id: string | null;
    cohort_id: string | null;
  },
) {
  if (scope === "batch") {
    return {
      p_parish_id: enrolment.parish_id,
      p_batch_id: enrolment.batch_id,
      p_cohort_id: null,
    };
  }
  if (scope === "cohort") {
    // National programme cohort — classmates across all parishes.
    return {
      p_parish_id: null,
      p_batch_id: null,
      p_cohort_id: enrolment.cohort_id,
    };
  }
  return {
    p_parish_id: enrolment.parish_id,
    p_batch_id: null,
    p_cohort_id: null,
  };
}

function displayName(row: GalleryPortraitRow): string {
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Student";
}

function batchLabel(row: GalleryPortraitRow): string | null {
  if (!row.batch_name || row.batch_year == null) return null;
  return formatBatchLabel({ name: row.batch_name, year: row.batch_year });
}

function cohortLabel(row: GalleryPortraitRow): string | null {
  if (
    !row.cohort_name ||
    row.cohort_year_start == null ||
    row.cohort_year_end == null
  ) {
    return null;
  }
  return formatCohortLabel({
    name: row.cohort_name,
    year_start: row.cohort_year_start,
    year_end: row.cohort_year_end,
  });
}

export async function fetchGalleryPortraitPage(input: {
  scope: GalleryScope;
  page: number;
  viewerEnrolment: {
    parish_id: string | null;
    batch_id: string | null;
    cohort_id: string | null;
  };
  moderationFilter?: GalleryModerationFilter;
  search?: string | null;
  adminParishId?: string | null;
  pageSize?: number;
}): Promise<GalleryPageResult<GalleryPortraitRow>> {
  const pageSize = input.pageSize ?? GALLERY_PAGE_SIZE;
  const page = Math.max(1, input.page);
  const offset = (page - 1) * pageSize;

  const scope =
    input.adminParishId != null
      ? {
          p_parish_id: input.adminParishId,
          p_batch_id: null,
          p_cohort_id: null,
        }
      : scopeFilters(input.scope, input.viewerEnrolment);

  const service = createServiceSupabaseClient();
  const { data, error } = await service.rpc("list_gallery_portraits", {
    p_parish_id: scope.p_parish_id,
    p_batch_id: scope.p_batch_id,
    p_cohort_id: scope.p_cohort_id,
    p_moderation_filter: input.moderationFilter ?? "visible",
    p_search: input.search?.trim() || null,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (error) {
    console.error("[gallery/list]", error.message);
    throw new Error(error.message);
  }

  const rows = (data ?? []) as GalleryPortraitRow[];
  const total = rows[0]?.total_count ?? 0;

  return {
    items: rows,
    total: Number(total),
    page,
    pageSize,
  };
}

export async function mapGalleryPhotos(
  rows: GalleryPortraitRow[],
  viewerUserId?: string,
) {
  const signed = await signStudentPhotoUrls(
    rows.map((row) => row.selfie_path),
    GALLERY_SIGNED_URL_TTL_SEC,
  );

  // Retry any paths the batch signer skipped so the page stays full.
  for (const row of rows) {
    const path = row.selfie_path;
    if (!path || signed.has(path)) continue;
    const retry = await signStudentPhotoUrl(path, GALLERY_SIGNED_URL_TTL_SEC);
    if (retry) signed.set(path, retry);
  }

  return rows.map((row) => {
    const url = row.selfie_path ? signed.get(row.selfie_path) ?? null : null;
    return {
      userId: row.user_id,
      displayName: displayName(row),
      parishName: row.parish_name,
      batchLabel: batchLabel(row),
      cohortLabel: cohortLabel(row),
      imageUrl: url ?? "",
      imageUnavailable: !url,
      isSelf: viewerUserId ? row.user_id === viewerUserId : undefined,
      moderationStatus: row.moderation_status,
    };
  });
}

export async function mapAdminGalleryItems(rows: GalleryPortraitRow[]) {
  const signed = await signStudentPhotoUrls(
    rows.map((row) => row.selfie_path),
    GALLERY_SIGNED_URL_TTL_SEC,
  );

  for (const row of rows) {
    const path = row.selfie_path;
    if (!path || signed.has(path)) continue;
    const retry = await signStudentPhotoUrl(path, GALLERY_SIGNED_URL_TTL_SEC);
    if (retry) signed.set(path, retry);
  }

  return rows.map((row) => {
    const status = row.moderation_status;
    const moderationStatus: "visible" | "flagged" | "taken_down" =
      status === "flagged"
        ? "flagged"
        : status === "taken_down"
          ? "taken_down"
          : "visible";
    const path = row.selfie_path;
    return {
      userId: row.user_id,
      displayName: displayName(row),
      email: row.email ?? "",
      parishId: row.parish_id,
      parishName: row.parish_name,
      batchLabel: batchLabel(row),
      imageUrl: path ? signed.get(path) ?? null : null,
      path,
      uploadedAt: row.selfie_uploaded_at,
      moderationStatus,
      moderationNote: row.moderation_note,
      moderatedAt: row.moderated_at,
    };
  });
}
