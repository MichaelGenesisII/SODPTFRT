import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  listMyClassAttendance,
  listStudentClasses,
  meetingSdkReadyForStudent,
} from "@/app/student/classes/actions";
import { StudentClassesClient } from "@/components/student/student-classes";
import { TempCohortSwitchCard } from "@/components/student/temp-cohort-switch";
import { publicActionMessage, publicUnavailableMessage } from "@/lib/safe-action-message";
import { getSessionStudent } from "@/lib/student/auth";

export const metadata: Metadata = {
  title: "Classes | School of Disciples Portal",
};

export default async function StudentClassesPage() {
  const profile = await getSessionStudent();
  if (!profile) redirect("/login/student");

  let classes: Awaited<ReturnType<typeof listStudentClasses>> = [];
  let attendance: Awaited<ReturnType<typeof listMyClassAttendance>> = [];
  let meetingSdkReady = false;
  let loadError: string | null = null;

  try {
    [classes, attendance, meetingSdkReady] = await Promise.all([
      listStudentClasses(),
      listMyClassAttendance(),
      meetingSdkReadyForStudent(),
    ]);
  } catch (error) {
    console.error("student classes:", error);
    loadError = publicActionMessage(error, publicUnavailableMessage("Classes"));
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Live hall
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.75rem,5.5vw,2.5rem)] tracking-[-0.02em] text-pine">
          Classes
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70 sm:mt-1.5">
          Join live sessions, check in on site, and manage how Zoom recognises
          you — one section at a time.
        </p>
      </section>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-4 py-3 text-sm text-red-900 sm:px-5 sm:py-4"
          role="alert"
        >
          {loadError}
        </div>
      ) : (
        <>
          <TempCohortSwitchCard />
          <StudentClassesClient
            profile={profile}
            classes={classes}
            attendance={attendance}
            meetingSdkReady={meetingSdkReady}
          />
        </>
      )}
    </div>
  );
}
