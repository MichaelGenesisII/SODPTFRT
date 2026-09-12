"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const MIN_HIDDEN_MS = 45_000;

/**
 * Refresh RSC data when the tab becomes visible again (e.g. re-sign gallery
 * URLs). Debounced so brief tab switches do not remount the whole tree.
 */
export function useRefreshOnVisible() {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const started = hiddenAt.current;
      hiddenAt.current = null;
      if (started == null) return;
      if (Date.now() - started < MIN_HIDDEN_MS) return;
      router.refresh();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);
}
