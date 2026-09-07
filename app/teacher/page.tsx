import type { Metadata } from "next";
import Link from "next/link";
import { listTeacherClasses } from "@/app/teacher/classes/actions";
import { TeacherClassesList } from "@/components/teacher/teacher-classes";
import { getSessionTeacher, teacherDisplayName } from "@/lib/teacher/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Home | Teacher Portal",
};

export default async function TeacherHomePage() {
  const profile = await getSessionTeacher();
  const first =
    profile?.full_name?.trim().split(/\s+/)[0] ||
    (profile ? teacherDisplayName(profile).split(/\s+/)[0] : "Teacher");

  let classes: Awaited<ReturnType<typeof listTeacherClasses>> = [];
  let loadError: string | null = null;

  try {
    classes = await listTeacherClasses();
  } catch (error) {
    console.error("[teacher/home]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Classes"),
    );
  }

  const now = Date.now();
  const upcoming = classes
    .filter(
      (c) =>
        new Date(c.scheduled_end).getTime() >= now && c.status !== "cancelled",
    )
    .slice(0, 4);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden border border-stone/80 bg-white/50 px-5 pb-7 pt-8 sm:px-7 sm:pb-8 sm:pt-9">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.18),_transparent_55%)]"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Teacher portal
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.85rem,5vw,2.6rem)] tracking-[-0.02em] text-pine">
            Hello, {first}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65 sm:text-[0.95rem]">
            Your assigned classes and register — kept clear and quiet. The desk
            confirms when a class has been taught.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/teacher/classes"
              className="inline-flex min-h-11 items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
            >
              Open schedule
            </Link>
            <Link
              href="/teacher/account"
              className="inline-flex min-h-11 items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine"
            >
              Account & password
            </Link>
          </div>
        </div>
      </section>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Schedule
              </p>
              <h2 className="mt-1 font-display text-xl text-pine">Upcoming</h2>
            </div>
            <Link
              href="/teacher/classes"
              className="text-sm font-medium text-pine underline decoration-pine/25 underline-offset-2"
            >
              All classes
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center">
              <p className="font-display text-lg text-pine">
                No classes assigned yet
              </p>
              <p className="mt-2 text-sm text-ink/55">
                When the desk assigns you a class, it will appear here.
              </p>
            </div>
          ) : (
            <TeacherClassesList classes={upcoming} compact />
          )}
        </section>
      )}
    </div>
  );
}
