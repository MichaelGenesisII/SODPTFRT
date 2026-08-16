import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listGalleryPhotos } from "@/app/student/photos/actions";
import { StudentGallery } from "@/components/student/student-gallery";
import { getFeePayment } from "@/lib/payments/service";
import { getSessionStudent, getStudentEnrolment } from "@/lib/student/auth";
import { signStudentPhotoUrl } from "@/lib/student/photos";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Gallery | Student Portal",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentGalleryPage({ searchParams }: PageProps) {
  const profile = await getSessionStudent();
  if (!profile) redirect("/login/student");

  const enrolment = await getStudentEnrolment(profile.id).catch(() => null);
  const params = searchParams ? await searchParams : {};
  const scopeRaw = typeof params.scope === "string" ? params.scope : null;
  const scope: "batch" | "parish" =
    scopeRaw === "parish"
      ? "parish"
      : scopeRaw === "batch"
        ? "batch"
        : enrolment?.batch_id
          ? "batch"
          : "parish";

  const result = await listGalleryPhotos(scope);

  let graduationPaid = false;
  try {
    const supabase = await createServerSupabaseClient();
    const fee = await getFeePayment(supabase, profile.id, "graduation");
    graduationPaid = fee?.status === "paid";
  } catch {
    graduationPaid = false;
  }

  const takenDown = profile.selfie_moderation_status === "taken_down";
  const ownSelfieUrl =
    profile.graduation_selfie_path && !takenDown
      ? await signStudentPhotoUrl(
          profile.graduation_selfie_path,
          60 * 60 * 4,
        )
      : null;

  return (
    <StudentGallery
      scope={scope}
      parishName={enrolment?.parish_name ?? null}
      batchLabel={enrolment?.batch_label ?? null}
      hasBatch={Boolean(enrolment?.batch_id)}
      photos={result.ok ? result.photos : []}
      loadError={result.ok ? null : result.message}
      graduationPaid={graduationPaid}
      ownSelfieUploaded={Boolean(profile.graduation_selfie_path)}
      ownSelfieUrl={ownSelfieUrl}
      ownTakenDown={takenDown}
      ownModerationNote={profile.selfie_moderation_note ?? null}
    />
  );
}
