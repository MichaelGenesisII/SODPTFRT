"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh RSC data when the tab becomes visible again (re-signs gallery URLs). */
export function useRefreshOnVisible() {
  const router = useRouter();

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);
}
