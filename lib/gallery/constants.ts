export const GALLERY_PAGE_SIZE = 16;

export type GalleryScope = "batch" | "parish" | "cohort";

/** Student gallery tabs — parish and batch/year only. */
export type StudentGalleryScope = "batch" | "parish";

export type GalleryModerationFilter =
  | "visible"
  | "flagged"
  | "taken_down"
  | "all_admin";
