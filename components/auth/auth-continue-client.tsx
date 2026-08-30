"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PortalLoadingScreen } from "@/components/ui/portal-loading-screen";
import { safeAuthContinuePath } from "@/lib/auth/safe-next-path";

export function AuthContinueClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeAuthContinuePath(searchParams.get("next"));

  useEffect(() => {
    router.replace(next);
  }, [next, router]);

  return <PortalLoadingScreen label="Opening your desk…" />;
}
