import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStudentExamBundle } from "@/app/exam/actions";
import { StudentExamClient } from "@/components/exam/student-exam-client";
import { getSessionStudent } from "@/lib/student/auth";
import { studentDisplayName } from "@/lib/student/types";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Exam · ${slug} | Student Portal` };
}

export default async function StudentExamTakePage({ params }: Props) {
  const session = await getSessionStudent();
  if (!session) redirect("/login/student");

  const { slug } = await params;
  let bundle: Awaited<ReturnType<typeof getStudentExamBundle>> = null;
  try {
    bundle = await getStudentExamBundle(slug);
  } catch {
    bundle = null;
  }
  if (!bundle) notFound();

  return (
    <StudentExamClient
      slug={slug}
      exam={bundle.exam}
      questions={bundle.questions}
      questionCount={bundle.questionCount}
      attempt={bundle.attempt}
      answers={bundle.answers}
      studentName={studentDisplayName(session)}
      unlock={bundle.unlock}
      unlockMessage={bundle.unlockMessage}
      provisional={bundle.provisional}
      canRetake={bundle.canRetake}
      retakesRemaining={bundle.retakesRemaining}
    />
  );
}
