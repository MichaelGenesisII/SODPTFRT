import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginPanel } from "@/components/login/login-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Student Sign In | School of Disciples Portal",
  description:
    "Sign in to the School of Disciples student portal to track enrolment, payments, and course progress.",
};

export default function StudentLoginPage() {
  return (
    <div className="flex min-h-full flex-col bg-mist text-ink">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Suspense fallback={<div className="flex-1 bg-mist" />}>
          <LoginPanel role="student" />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
