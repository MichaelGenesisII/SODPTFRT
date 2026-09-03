import type { AlumniPortalFilter } from "@/lib/alumni/types";

export const ALUMNI_PAGE_SIZE = 12;

export type AlumniListQueryState = {
  query: string;
  batchYear: number | null;
  portal: AlumniPortalFilter;
  page: number;
};

export function defaultAlumniListQuery(): AlumniListQueryState {
  return {
    query: "",
    batchYear: null,
    portal: "all",
    page: 1,
  };
}

export function parseAlumniListQuery(search: string): AlumniListQueryState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const portalRaw = params.get("portal");
  const batchRaw = params.get("batch");
  const pageRaw = params.get("page");
  const page = pageRaw ? Math.max(1, Number(pageRaw) || 1) : 1;

  return {
    query: params.get("q")?.trim() ?? "",
    batchYear: batchRaw ? Number(batchRaw) || null : null,
    portal:
      portalRaw === "awaiting_email" || portalRaw === "portal_ready"
        ? portalRaw
        : "all",
    page,
  };
}

export function alumniListQuery(input: AlumniListQueryState): string {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.batchYear != null) params.set("batch", String(input.batchYear));
  if (input.portal !== "all") params.set("portal", input.portal);
  if (input.page > 1) params.set("page", String(input.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Compare list URLs regardless of query-string parameter order. */
export function alumniListQueriesEqual(a: string, b: string): boolean {
  const left = parseAlumniListQuery(a);
  const right = parseAlumniListQuery(b);
  return (
    left.query === right.query &&
    left.batchYear === right.batchYear &&
    left.portal === right.portal &&
    left.page === right.page
  );
}
