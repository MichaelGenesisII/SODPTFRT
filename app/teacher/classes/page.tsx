import type { Metadata } from "next";
import { Suspense } from "react";
import {
  listTeacherClasses,
  listTeacherHistory,
} from "@/app/teacher/classes/actions";
import { TeacherClassesDesk } from "@/components/teacher/teacher-classes-desk";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Classes | Teacher Portal",
};

export default async function TeacherClassesPage() {
  let classes: Awaited<ReturnType<typeof listTeacherClasses>> = [];
  let history: Awaited<ReturnType<typeof listTeacherHistory>> = [];
  let classesError: string | null = null;
  let historyError: string | null = null;

  try {
    classes = await listTeacherClasses();
  } catch (error) {
    console.error("[teacher/classes]", error);
    classesError = publicActionMessage(
      error,
      publicUnavailableMessage("Classes"),
    );
  }

  try {
    history = await listTeacherHistory();
  } catch (error) {
    console.error("[teacher/classes/history]", error);
    historyError = publicActionMessage(
      error,
      publicUnavailableMessage("History"),
    );
  }

  return (
    <Suspense
      fallback={
        <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center text-sm text-ink/55">
          Loading classes…
        </div>
      }
    >
      <TeacherClassesDesk
        classes={classes}
        history={history}
        classesError={classesError}
        historyError={historyError}
      />
    </Suspense>
  );
}
