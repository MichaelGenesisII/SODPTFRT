"use client";

import { PortalErrorView } from "@/components/ui/portal-error-view";

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="flex min-h-[min(70vh,36rem)] flex-col">
      <PortalErrorView
        error={error}
        onRetry={unstable_retry}
        homeHref="/admin"
        homeLabel="Back to overview"
      />
    </div>
  );
}
