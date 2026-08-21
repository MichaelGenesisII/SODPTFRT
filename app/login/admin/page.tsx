import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/login/login-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Admin Sign In | School of Disciples Portal",
  description: "Sign in to the School of Disciples admin portal.",
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const profile = await getSessionAdmin();
  if (profile) {
    redirect("/admin");
  }

  return (
    <div className="flex min-h-full flex-col bg-mist text-ink">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Suspense fallback={<div className="flex-1 bg-mist" />}>
          <LoginPanel role="admin" />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
