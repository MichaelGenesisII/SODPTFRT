import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOwnCertificate } from "@/app/student/certificates/actions";
import { StudentCertificatesClient } from "@/components/student/student-certificates";
import { getSessionStudent } from "@/lib/student/auth";

export const metadata: Metadata = {
  title: "Certificates | Student Portal",
};

export default async function StudentCertificatesPage() {
  const session = await getSessionStudent();
  if (!session) redirect("/login/student");

  const result = await getOwnCertificate();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <section className="animate-fade-rise mb-4 px-0 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Recognition
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.75rem,5.5vw,2.5rem)] tracking-[-0.02em] text-pine">
          Certificates
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70 sm:mt-1.5">
          Download your course certificate when the desk has issued it.
        </p>
      </section>

      <StudentCertificatesClient
        meta={result.meta}
        downloadUrl={result.downloadUrl}
        loadError={result.ok ? null : result.message ?? null}
      />
    </div>
  );
}
