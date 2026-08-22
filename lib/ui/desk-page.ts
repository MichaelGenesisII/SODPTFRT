/** Server- and client-safe page number from URL search params. */
export function deskPageFromSearchParams(
  raw: string | string[] | undefined,
): number {
  const value = typeof raw === "string" ? raw : "";
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
