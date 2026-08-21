export type Parish = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Batch = {
  id: string;
  parish_id: string;
  cohort_id: string | null;
  name: string;
  year: number;
  enrolment_open: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BatchWithParish = Batch & {
  parish?: Pick<Parish, "id" | "name" | "slug" | "region"> | null;
};

export function slugifyParishName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function formatBatchLabel(batch: Pick<Batch, "name" | "year">): string {
  return `${batch.name} (${batch.year})`;
}

/** Label for desk placement pickers — shows enrolment / retire state. */
export function formatBatchPlacementLabel(
  batch: Pick<Batch, "name" | "year" | "enrolment_open" | "is_active">,
): string {
  const base = formatBatchLabel(batch);
  if (!batch.is_active) return `${base} · retired`;
  if (!batch.enrolment_open) return `${base} · enrolment closed`;
  return `${base} · enrolment open`;
}
