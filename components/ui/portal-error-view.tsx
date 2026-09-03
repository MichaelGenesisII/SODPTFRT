"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  PortalStatusScreen,
  portalStatusPrimaryClass,
  portalStatusSecondaryClass,
} from "@/components/ui/portal-status-screen";

type PortalErrorViewProps = {
  error: Error & { digest?: string };
  onRetry: () => void;
  homeHref: string;
  homeLabel: string;
};

export function PortalErrorView({
  error,
  onRetry,
  homeHref,
  homeLabel,
}: PortalErrorViewProps) {
  useEffect(() => {
    console.error("portal error", error.digest ?? "client");
  }, [error]);

  return (
    <PortalStatusScreen
      eyebrow="Something went wrong"
      title="We couldn’t open this page."
      body="Please try again. If this continues, contact Support."
    >
      <button
        type="button"
        onClick={onRetry}
        className={portalStatusPrimaryClass}
      >
        Try again
      </button>
      <Link href={homeHref} className={portalStatusSecondaryClass}>
        {homeLabel}
      </Link>
    </PortalStatusScreen>
  );
}
