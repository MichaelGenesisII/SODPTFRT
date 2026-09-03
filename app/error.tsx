"use client";

import { SiteHeader } from "@/components/site-header";
import { PortalErrorView } from "@/components/ui/portal-error-view";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col bg-mist text-ink">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <PortalErrorView
          error={error}
          onRetry={unstable_retry}
          homeHref="/"
          homeLabel="Back home"
        />
      </main>
    </div>
  );
}
