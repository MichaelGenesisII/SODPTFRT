import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentDashboard } from "@/components/student/student-dashboard";
import { MAX_STUDENT_LIVE_ANNOUNCEMENTS } from "@/lib/announcements";
import { fetchStudentAnnouncements } from "@/lib/announcements-server";
import {
  hasTuitionInstallmentPaid,
  type FeePaymentStatus,
} from "@/lib/payments/fees";
import { getFeePayment } from "@/lib/payments/service";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import {
  getSessionStudent,
  getStudentEnrolment,
} from "@/lib/student/auth";
import { cachedSignStudentPhotoUrl } from "@/lib/student/photos";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Student Portal | School of Disciples",
  description:
    "Track your School of Disciples application, payment, and course journey.",
};

export default async function StudentPortalPage() {
  const session = await getSessionStudent();
  if (!session) {
    redirect("/login/student");
  }

  let profile = session;
  let enrolment: Awaited<ReturnType<typeof getStudentEnrolment>> = null;
  let tuitionFeeStatus: FeePaymentStatus | null = null;
  let tuitionPaidGbp = 0;
  let passportUnlocked = false;
  let loadError: string | null = null;
  let notices: Awaited<ReturnType<typeof fetchStudentAnnouncements>> = [];
  let noticesError: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const [enrolmentResult, noticesResult, passportUrl, fee] =
      await Promise.all([
        getStudentEnrolment(session.id),
        fetchStudentAnnouncements(MAX_STUDENT_LIVE_ANNOUNCEMENTS).catch(
          (error) => {
            console.error("[student/home/notices]", error);
            noticesError = publicActionMessage(
              error,
              "Notices are temporarily unavailable.",
            );
            return [] as Awaited<ReturnType<typeof fetchStudentAnnouncements>>;
          },
        ),
        cachedSignStudentPhotoUrl(session.passport_path),
        getFeePayment(supabase, session.id, "tuition").catch(() => null),
      ]);
    enrolment = enrolmentResult;
    notices = noticesResult;
    if (passportUrl) {
      profile = { ...session, passportUrl };
    }

    if (fee) {
      passportUnlocked = hasTuitionInstallmentPaid(fee);
      tuitionFeeStatus = fee.status;
      tuitionPaidGbp = fee.amount_paid_gbp ?? 0;
    } else if (enrolment?.payment_status === "paid") {
      // Fee rows may not exist yet — fall back to enrolment payment flag.
      passportUnlocked = true;
      tuitionFeeStatus = enrolment.payment_status;
    } else if (enrolment) {
      tuitionFeeStatus = enrolment.payment_status;
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
