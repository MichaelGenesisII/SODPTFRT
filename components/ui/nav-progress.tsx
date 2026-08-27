"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin top bar while soft navigations wait on RSC. Stops the “dead click”
 * feel when a route is already loading.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (/^https?:\/\//i.test(href)) return;
      const nextPath = href.split("?")[0]?.split("#")[0] ?? href;
      if (nextPath === pathname) return;
      setPending(true);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  if (!pending) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-pine/20"
      role="progressbar"
      aria-label="Loading page"
    >
      <div className="h-full w-full origin-left animate-pulse bg-celadon" />
    </div>
  );
}
