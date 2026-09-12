import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicExamBundle } from "@/app/exam/actions";
import { OpenExamClient } from "@/components/exam/open-exam-client";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getPublicExamBundle(slug).catch(() => null);
  return {
    title: bundle
      ? `${bundle.exam.title} | School of Disciples`
      : "Exam | School of Disciples",
  };
}

export default async function OpenExamPage({ params }: Props) {
  const { slug } = await params;
  let bundle: Awaited<ReturnType<typeof getPublicExamBundle>> = null;
  try {
    bundle = await getPublicExamBundle(slug);
  } catch {
    bundle = null;
  }
  if (!bundle) notFound();

  return (
    <OpenExamClient
      slug={slug}
      exam={bundle.exam}
      questionCount={bundle.questionCount}
    />
  );
}
