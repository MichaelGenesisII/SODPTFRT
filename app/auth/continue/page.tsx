import { Suspense } from "react";
import { AuthContinueClient } from "@/components/auth/auth-continue-client";
import { PortalLoadingScreen } from "@/components/ui/portal-loading-screen";

export default function AuthContinuePage() {
  return (
    <Suspense
      fallback={<PortalLoadingScreen label="Opening your desk…" />}
    >
      <AuthContinueClient />
    </Suspense>
  );
}
