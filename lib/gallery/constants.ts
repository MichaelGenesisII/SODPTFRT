export const GALLERY_PAGE_SIZE = 16;

export type GalleryScope = "batch" | "parish" | "cohort";

export type GalleryModerationFilter =
  | "visible"
  | "flagged"
  | "taken_down"
  | "all_admin";
