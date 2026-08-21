import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { listGalleryPhotos } from "@/app/student/photos/actions";

import { StudentGallery } from "@/components/student/student-gallery";

import { computeGraduationEligibility } from "@/lib/graduation/eligibility";

import { getSessionStudent, getStudentEnrolment } from "@/lib/student/auth";

import { signStudentPhotoUrl } from "@/lib/student/photos";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { deskPageFromSearchParams } from "@/lib/ui/desk-pagination";

import type { GalleryScope } from "@/lib/gallery/constants";



export const metadata: Metadata = {

  title: "Gallery | Student Portal",

};



type PageProps = {

  searchParams?: Promise<Record<string, string | string[] | undefined>>;

};



function scopeFromParams(

  raw: string | string[] | undefined,

  enrolment: Awaited<ReturnType<typeof getStudentEnrolment>>,

): GalleryScope {

  if (raw === "parish" || raw === "batch" || raw === "cohort") return raw;

  if (enrolment?.cohort_id) return "cohort";

  if (enrolment?.batch_id) return "batch";

  return "parish";

}



export default async function StudentGalleryPage({ searchParams }: PageProps) {

  const profile = await getSessionStudent();

  if (!profile) redirect("/login/student");



  const enrolment = await getStudentEnrolment(profile.id).catch(() => null);

  const params = searchParams ? await searchParams : {};

  const scope = scopeFromParams(params.scope, enrolment);

  const page = deskPageFromSearchParams(params.page);



  const result = await listGalleryPhotos(scope, page);



  const supabase = await createServerSupabaseClient();

  const eligibility = await computeGraduationEligibility(supabase, profile.id);



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

      cohortLabel={enrolment?.cohort_label ?? null}

      hasBatch={Boolean(enrolment?.batch_id)}

      hasCohort={Boolean(enrolment?.cohort_id)}

      photos={result.ok ? result.photos : []}

      total={result.ok ? result.total : 0}

      page={result.ok ? result.page : 1}

      pageSize={result.ok ? result.pageSize : 16}

      loadError={result.ok ? null : result.message}

      graduationEligible={eligibility.eligible}

      graduationBypassed={eligibility.bypassed}

      graduationBypassReason={eligibility.bypassReason}

      graduationChecklist={eligibility.checklist}

      ownSelfieUploaded={Boolean(profile.graduation_selfie_path)}

      ownSelfieUrl={ownSelfieUrl}

      ownTakenDown={takenDown}

      ownModerationNote={profile.selfie_moderation_note ?? null}

    />

  );

}

