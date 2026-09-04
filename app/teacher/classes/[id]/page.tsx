import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTeacherClassDetail } from "@/app/teacher/classes/actions";
import { TeacherClassDetailClient } from "@/components/teacher/teacher-class-detail";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getTeacherClassDetail(id).catch(() => null);
  return {
    title: detail
      ? `${detail.klass.title} | Teacher Portal`
      : "Class | Teacher Portal",
  };
}

export default async function TeacherClassDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getTeacherClassDetail(id);
  if (!detail) notFound();

  return <TeacherClassDetailClient initial={detail} />;
}
