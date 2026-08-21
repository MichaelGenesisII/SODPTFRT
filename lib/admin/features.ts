/** When false, parish admin desks are paused — national/master only. */
export function parishAdminEnabled(): boolean {
  const raw = process.env.PARISH_ADMIN_ENABLED?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  return false;
}
