import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentAccountManager } from "@/components/student/student-account-manager";
import { getSessionStudent, getStudentEnrolment } from "@/lib/student/auth";

export const metadata: Metadata = {
  title: "Account | Student Portal",
};

export default async function StudentAccountPage() {
  const profile = await getSessionStudent();
  if (!profile) redirect("/login/student");

  const enrolment = await getStudentEnrolment(profile.id).catch(() => null);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Account
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Settings
        </h1>
        <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink/70">
          Your sign-in details and password. Enrolment changes go through
          Support.
        </p>
      </section>
      <StudentAccountManager profile={profile} enrolment={enrolment} />
    </div>
  );
}
