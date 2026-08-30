import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginPanel } from "@/components/login/login-panel";
import { PortalLoadingScreen } from "@/components/ui/portal-loading-screen";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Admin Sign In | School of Disciples Portal",
  description: "Sign in to the School of Disciples admin portal.",
};

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-full flex-col bg-mist text-ink">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Suspense
          fallback={
            <PortalLoadingScreen label="Loading sign-in…" />
          }
        >
          <LoginPanel role="admin" />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
