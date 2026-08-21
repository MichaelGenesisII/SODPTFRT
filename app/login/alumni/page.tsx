import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginPanel } from "@/components/login/login-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Alumni Sign In | School of Disciples Portal",
  description:
    "Sign in to the alumni portal to complete tuition and review your course record.",
};

export default function AlumniLoginPage() {
  return (
    <div className="flex min-h-full flex-col bg-mist text-ink">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Suspense fallback={<div className="flex-1 bg-mist" />}>
          <LoginPanel role="alumni" />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
