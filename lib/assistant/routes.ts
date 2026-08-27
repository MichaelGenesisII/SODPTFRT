/** Paths where the floating assistant should not appear. */
export function assistantVisibleOnPath(pathname: string): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/admin")) return false;
  if (pathname.startsWith("/login/admin")) return false;
  if (pathname.startsWith("/exam/")) return false;
  // Active exam take — not the exams list at /student/exams
  if (/^\/student\/exams\/[^/]+/.test(pathname)) return false;
  return true;
}
