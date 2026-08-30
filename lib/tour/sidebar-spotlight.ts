/** Tour spotlight helpers — open collapsed sidebars before highlighting nav targets. */

const SIDEBAR_TARGET_PATTERN = /nav-group-|student-nav-|\[data-tour="nav-/;

export function tourStepNeedsOpenSidebar(
  target?: string,
  expandNavGroup?: string,
): boolean {
  if (expandNavGroup) return true;
  if (!target) return false;
  if (SIDEBAR_TARGET_PATTERN.test(target)) return true;
  const el = document.querySelector(target);
  return Boolean(el?.closest("#admin-sidebar, #student-sidebar"));
}
