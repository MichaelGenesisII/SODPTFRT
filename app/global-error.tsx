"use client";

import { Figtree, Newsreader } from "next/font/google";
import { PortalErrorView } from "@/components/ui/portal-error-view";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <title>Something went wrong | School of Disciples Portal</title>
        <div className="flex min-h-full flex-col bg-mist text-ink">
          <PortalErrorView
            error={error}
            onRetry={unstable_retry}
            homeHref="/"
            homeLabel="Back home"
          />
        </div>
      </body>
    </html>
  );
}
