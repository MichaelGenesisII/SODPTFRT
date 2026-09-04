import type { Metadata } from "next";
import { listTeacherClasses } from "@/app/teacher/classes/actions";
import { TeacherClassesList } from "@/components/teacher/teacher-classes";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Classes | Teacher Portal",
};

export default async function TeacherClassesPage() {
  let classes: Awaited<ReturnType<typeof listTeacherClasses>> = [];
  let loadError: string | null = null;

  try {
    classes = await listTeacherClasses();
  } catch (error) {
    console.error("[teacher/classes]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Classes"),
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Schedule
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Classes
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/65">
          Only sessions assigned to you. Open a class for the register and to
          confirm you taught.
        </p>
      </section>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : (
        <TeacherClassesList classes={classes} />
      )}
    </div>
  );
}
