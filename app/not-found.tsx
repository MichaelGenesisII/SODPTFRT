import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PortalNotFoundView } from "@/components/ui/portal-status-screen";

export const metadata: Metadata = {
  title: "Page not found | School of Disciples Portal",
};

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col bg-mist text-ink">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <PortalNotFoundView homeHref="/" homeLabel="Back home" />
      </main>
      <SiteFooter />
    </div>
  );
}
