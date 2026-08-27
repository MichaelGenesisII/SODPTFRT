import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentDashboard } from "@/components/student/student-dashboard";
import { fetchStudentAnnouncements } from "@/lib/announcements-server";
import {
  hasTuitionInstallmentPaid,
  type FeePaymentStatus,
} from "@/lib/payments/fees";
import {
  ensureStudentFeeRows,
  getFeePayment,
} from "@/lib/payments/service";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import {
  getSessionStudent,
  getStudentEnrolment,
} from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Student Portal | School of Disciples",
  description:
    "Track your School of Disciples application, payment, and course journey.",
};

export default async function StudentPortalPage() {
  const profile = await getSessionStudent();
  if (!profile) {
    redirect("/login/student");
  }

  let enrolment: Awaited<ReturnType<typeof getStudentEnrolment>> = null;
  let tuitionFeeStatus: FeePaymentStatus | null = null;
  let tuitionPaidGbp = 0;
  let passportUnlocked = false;
  let loadError: string | null = null;
  let notices: Awaited<ReturnType<typeof fetchStudentAnnouncements>> = [];
  let noticesError: string | null = null;

  try {
    const [enrolmentResult, noticesResult] = await Promise.all([
      getStudentEnrolment(profile.id),
      fetchStudentAnnouncements().catch((error) => {
        console.error("[student/home/notices]", error);
        noticesError = publicActionMessage(
          error,
          "Notices are temporarily unavailable.",
        );
        return [] as Awaited<ReturnType<typeof fetchStudentAnnouncements>>;
      }),
    ]);
    enrolment = enrolmentResult;
    notices = noticesResult;

    if (enrolment) {
      try {
        const supabase = await createServerSupabaseClient();
        await ensureStudentFeeRows(supabase, profile.id);
        const fee = await getFeePayment(supabase, profile.id, "tuition");
        passportUnlocked = hasTuitionInstallmentPaid(fee);
        tuitionFeeStatus = fee?.status ?? null;
        tuitionPaidGbp = fee?.amount_paid_gbp ?? 0;
      } catch (feeError) {
        console.error("[student/home/fees]", feeError);
        tuitionFeeStatus = enrolment.payment_status;
        if (enrolment.payment_status === "paid") {
          passportUnlocked = true;
        }
      }
    }
  } catch (error) {
    console.error("[student/home]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Your application"),
    );
  }

  return (
    <StudentDashboard
      profile={profile}
      enrolment={enrolment}
      tuitionFeeStatus={tuitionFeeStatus}
      tuitionPaidGbp={tuitionPaidGbp}
      passportUnlocked={passportUnlocked}
      notices={notices}
      noticesError={noticesError}
      loadError={loadError}
    />
  );
}
