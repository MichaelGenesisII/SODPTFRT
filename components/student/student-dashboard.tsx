"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { PhotoUploadCard } from "@/components/student/photo-upload-card";
import {
  StudentPortalWalkthroughTrigger,
} from "@/components/student/student-portal-walkthrough";
import { useStudentTourOptional } from "@/components/student/student-tour-provider";
import { useRefreshOnVisible } from "@/components/student/use-refresh-on-visible";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { ATTENDANCE_MODES } from "@/lib/enrol/schema";
import {
  formatGbp,
  PROGRAMME_FEES,
  type ProgrammeFeeKey,
} from "@/lib/enrol/payment";
import {
  TUITION_FEE,
  GRADUATION_FEE,
  type FeePaymentStatus,
} from "@/lib/payments/fees";
import {
  studentDisplayName,
  type EnrolmentStatus,
  type PaymentStatus,
  type StudentEnrolment,
  type StudentProfile,
} from "@/lib/student/types";
import type { Announcement } from "@/lib/announcements";
import {
  formatAnnouncementDate,
  isSafeAnnouncementHref,
} from "@/lib/announcements";
import {
  NoticeAttachmentList,
  NoticeFilesMark,
} from "@/components/notices/notice-attachments";

type HomeSection = "overview" | "application";

export function StudentDashboardRefresh({ children }: { children: ReactNode }) {
  useRefreshOnVisible();
  return <>{children}</>;
}

type JourneyStep = {
  id: string;
  label: string;
  detail: string;
  state: "done" | "current" | "upcoming";
};

function programmeLabel(mode: string) {
  return ATTENDANCE_MODES.find((item) => item.value === mode)?.label ?? mode;
}

function feeFor(mode: string) {
  const key = (mode in PROGRAMME_FEES ? mode : "standard") as ProgrammeFeeKey;
  return PROGRAMME_FEES[key];
}

function statusCopy(status: EnrolmentStatus): { title: string; body: string } {
  switch (status) {
    case "submitted":
      return {
        title: "Application received",
        body: "Your form is with the School. We typically respond within 2 business days.",
      };
    case "under_review":
      return {
        title: "Under review",
        body: "The team is reading your application. Sit tight — you’ll hear from us soon.",
      };
    case "accepted":
      return {
        title: "Accepted",
        body: "Welcome aboard. Application is free — pay tuition when you are ready (in full or by instalment).",
      };
    case "payment_pending":
      return {
        title: "Payment pending",
        body: "We’re matching your transfer or reviewing uploaded proof.",
      };
    case "paid":
      return {
        title: "Place secured",
        body: "Payment confirmed. Classes, materials, and the rest of your desk are open from the menu.",
      };
    case "rejected":
      return {
        title: "Not progressing",
        body: "This application is not moving forward. Contact the School if you have questions.",
      };
    default:
      return {
        title: "Your application",
        body: "Track progress and next steps from this portal.",
      };
  }
}

function paymentCopy(
  status: PaymentStatus | FeePaymentStatus,
  paidGbp = 0,
  dueGbp = TUITION_FEE.amountGbp,
): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending_review":
      return "Proof under review";
    default: {
      const remaining = Math.max(0, dueGbp - paidGbp);
      if (paidGbp > 0 && remaining > 0) {
        return `Part paid · ${formatGbp(remaining)} left`;
      }
      return paidGbp > 0 ? "Part paid" : "Unpaid";
    }
  }
}

function effectivePaymentStatus(
  enrolment: StudentEnrolment,
  tuitionFeeStatus: FeePaymentStatus | null,
): PaymentStatus {
  if (tuitionFeeStatus) return tuitionFeeStatus;
  return enrolment.payment_status;
}

function buildJourney(
  enrolment: StudentEnrolment | null,
  payment: PaymentStatus,
  tuitionPaidGbp = 0,
  tuitionDueGbp = TUITION_FEE.amountGbp,
): JourneyStep[] {
  if (!enrolment) {
    return [
      {
        id: "apply",
        label: "Apply",
        detail: "Submit your enrolment form",
        state: "current",
      },
      {
        id: "review",
        label: "Review",
        detail: "School reads your application",
        state: "upcoming",
      },
      {
        id: "pay",
        label: "Pay",
        detail: "Secure your place",
        state: "upcoming",
      },
      {
        id: "begin",
        label: "Begin",
        detail: "Classes & materials",
        state: "upcoming",
      },
    ];
  }

  const { status } = enrolment;
  const rejected = status === "rejected";
  const paid = payment === "paid" || status === "paid";
  // Paid tuition wins over a stale submitted/under_review enrolment status.
  const inReview =
    !paid && (status === "submitted" || status === "under_review");
  const reviewDone =
    status === "accepted" ||
    status === "payment_pending" ||
    paid;
  const payOpen =
    !paid &&
    (status === "accepted" ||
      status === "payment_pending" ||
      payment === "pending_review");
  const tuitionRemaining = Math.max(0, tuitionDueGbp - tuitionPaidGbp);

  return [
    {
      id: "apply",
      label: "Applied",
      detail: "Form received",
      state: "done",
    },
    {
      id: "review",
      label: rejected ? "Closed" : "Review",
      detail: rejected
        ? "Not progressing"
        : status === "submitted" && !paid
          ? "Waiting on the School"
          : status === "under_review" && !paid
            ? "In progress"
            : "Application reviewed",
      state: rejected
        ? "done"
        : inReview
          ? "current"
          : reviewDone
            ? "done"
            : "upcoming",
    },
    {
      id: "pay",
      label: "Payment",
      detail: paid
        ? "Confirmed"
        : payment === "pending_review"
          ? "Proof in review"
          : payOpen && tuitionPaidGbp > 0 && tuitionRemaining > 0
            ? `${formatGbp(tuitionPaidGbp)} paid · ${formatGbp(tuitionRemaining)} left`
            : payOpen
              ? "Fee still due"
              : "After acceptance",
      state: rejected
        ? "upcoming"
        : paid
          ? "done"
          : payOpen
            ? "current"
            : "upcoming",
    },
    {
      id: "begin",
      label: "Course",
      detail: paid ? "Ready — open Classes" : "After payment",
      state: paid ? "current" : "upcoming",
    },
  ];
}

function greetingForHour(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDob(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatEnrolmentDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function addressLines(enrolment: StudentEnrolment): string {
  return [
    enrolment.address_line1,
    enrolment.address_line2,
    enrolment.town_city,
    enrolment.county,
    enrolment.postcode,
    enrolment.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function readHomeSection(): HomeSection {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.replace(/^#/, "");
  return hash === "application" ? "application" : "overview";
}

function subscribeHomeSection(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  window.addEventListener("popstate", onStoreChange);
  return () => {
    window.removeEventListener("hashchange", onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
  };
}

type StudentDashboardProps = {
  profile: StudentProfile;
  enrolment: StudentEnrolment | null;
  tuitionFeeStatus?: FeePaymentStatus | null;
  tuitionPaidGbp?: number;
  tuitionDueGbp?: number;
  passportUnlocked?: boolean;
  notices: Announcement[];
  noticesError?: string | null;
  loadError?: string | null;
};

export function StudentDashboard({
  profile,
  enrolment,
  tuitionFeeStatus = null,
  tuitionPaidGbp = 0,
  tuitionDueGbp = TUITION_FEE.amountGbp,
  passportUnlocked = false,
  notices,
  noticesError = null,
  loadError = null,
}: StudentDashboardProps) {
  const section = useSyncExternalStore(
    subscribeHomeSection,
    readHomeSection,
    () => "overview" as HomeSection,
  );

  const name = studentDisplayName(profile);
  const first = profile.first_name;
  const payment = enrolment
    ? effectivePaymentStatus(enrolment, tuitionFeeStatus)
    : "unpaid";
  const journey = buildJourney(
    enrolment,
    payment,
    tuitionPaidGbp,
    tuitionDueGbp,
  );
  const status = enrolment
    ? statusCopy(enrolment.status)
    : {
        title: "No application yet",
        body: "Start enrolment to open your path through the School of Disciples.",
      };
  const fee = enrolment ? feeFor(enrolment.attendance_mode) : null;
  const rejected = enrolment?.status === "rejected";
  const paid = payment === "paid" || enrolment?.status === "paid";
  const payWindow =
    enrolment &&
    (enrolment.status === "accepted" ||
      enrolment.status === "payment_pending" ||
      payment === "pending_review");
  const needsPayment = Boolean(enrolment && !rejected && !paid && payWindow);
  const proofInReview = payment === "pending_review" && !paid;

  return (
    <div className="relative mx-auto w-full max-w-5xl px-0">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] bg-[radial-gradient(ellipse_at_top,_rgba(95,143,122,0.18),_transparent_55%),linear-gradient(180deg,_rgba(20,53,44,0.06),_transparent_70%)] sm:h-[28rem]"
        aria-hidden
      />

      {loadError ? (
        <p
          className="relative mt-4 border border-red-800/30 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      {section === "overview" ? (
        <OverviewView
          profile={profile}
          first={first}
          name={name}
          statusTitle={status.title}
          enrolment={enrolment}
          payment={payment}
          tuitionPaidGbp={tuitionPaidGbp}
          tuitionDueGbp={tuitionDueGbp}
          passportUnlocked={passportUnlocked}
          journey={journey}
          notices={notices}
          noticesError={noticesError}
        />
      ) : (
        <ApplicationView
          profile={profile}
          enrolment={enrolment}
          status={status}
          payment={payment}
          tuitionPaidGbp={tuitionPaidGbp}
          fee={fee}
          tuitionDueGbp={tuitionDueGbp}
          needsPayment={needsPayment}
          proofInReview={proofInReview}
          paid={Boolean(paid)}
        />
      )}
    </div>
  );
}

function overviewContinue(
  enrolment: StudentEnrolment | null,
  payment: PaymentStatus,
  needsPassport: boolean,
): { href: string; label: string; hint: string } {
  if (!enrolment) {
    return {
      href: "/enrol",
      label: "Begin enrolment",
      hint: "Open your path with the School of Disciples.",
    };
  }
  if (needsPassport) {
    return {
      href: "#passport",
      label: "Add passport photo",
      hint:
        payment === "paid"
          ? "Tuition is settled — finish your profile photograph."
          : "Your first tuition instalment is confirmed — add your passport photograph.",
    };
  }
  if (
    payment !== "paid" &&
    (enrolment.status === "accepted" ||
      enrolment.status === "payment_pending" ||
      payment === "pending_review")
  ) {
    return {
      href: "/student/payments",
      label: payment === "pending_review" ? "Track payment" : "Settle fees",
      hint: "Secure your place from the Payments desk.",
    };
  }
  if (payment === "paid" || enrolment.status === "paid") {
    return {
      href: "/student/classes",
      label: "Enter classes",
      hint: "Your place is secured — learning lives here.",
    };
  }
  return {
    href: "#application",
    label: "View application",
    hint: "See where your enrolment stands.",
  };
}

function OverviewView({
  profile,
  first,
  name,
  statusTitle,
  enrolment,
  payment,
  tuitionPaidGbp,
  tuitionDueGbp,
  passportUnlocked,
  journey,
  notices,
  noticesError,
}: {
  profile: StudentProfile;
  first: string;
  name: string;
  statusTitle: string;
  enrolment: StudentEnrolment | null;
  payment: PaymentStatus;
  tuitionPaidGbp: number;
  tuitionDueGbp: number;
  passportUnlocked: boolean;
  journey: JourneyStep[];
  notices: Announcement[];
  noticesError: string | null;
}) {
  const [pendingExternal, setPendingExternal] = useState<
    | { kind: "link"; href: string; label: string }
    | { kind: "attachment"; href: string; action: "view" | "download"; fileName: string }
    | null
  >(null);
  const tour = useStudentTourOptional();

  const needsPassport = passportUnlocked && !profile.passport_path;
  const continueTo = overviewContinue(enrolment, payment, needsPassport);
  const featured = notices[0] ?? null;
  const parishBatch = [
    enrolment?.parish_name,
    enrolment?.batch_label,
    enrolment?.cohort_label,
  ]
    .filter(Boolean)
    .join(" · ");
  const feesStillDue =
    Boolean(enrolment) &&
    payment !== "paid" &&
    enrolment?.status !== "rejected";
  const tuitionRemaining = Math.max(0, tuitionDueGbp - tuitionPaidGbp);

  function openExternal(href: string, download?: string) {
    if (download) {
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = download;
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function confirmExternal() {
    if (!pendingExternal) return;
    if (pendingExternal.kind === "attachment") {
      openExternal(
        pendingExternal.href,
        pendingExternal.action === "download"
          ? pendingExternal.fileName
          : undefined,
      );
    } else {
      openExternal(pendingExternal.href);
    }
    setPendingExternal(null);
  }

  return (
    <div id="overview" className="relative">
      <div className="relative mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon sm:text-[0.7rem] sm:tracking-[0.2em]">
          Overview · My Journey
        </p>
        <StudentPortalWalkthroughTrigger onClick={() => tour?.startTour()} />
      </div>

      {/* Hero — one composition: greeting, walk-on line, CTA, square passport */}
      <section
        className="relative overflow-hidden border border-pine/20 bg-pine text-mist"
        data-tour="student-overview-hero"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_20%,_rgba(95,143,122,0.35),_transparent_50%),linear-gradient(135deg,_transparent_40%,_rgba(0,0,0,0.12)_100%)]"
          aria-hidden
        />
        <div className="relative grid gap-0 lg:grid-cols-[1.15fr_minmax(0,18rem)]">
          <div className="flex flex-col justify-between px-4 py-6 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div>
              <p className="animate-fade-rise text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon sm:text-[0.7rem] sm:tracking-[0.2em]">
                {greetingForHour()}
              </p>
              <h1 className="animate-fade-rise-delay-1 mt-3 max-w-lg break-words font-display text-[clamp(2rem,9vw,3.85rem)] leading-[0.95] tracking-[-0.035em] sm:mt-4 sm:leading-[0.92]">
                {first}, walk on.
              </h1>
              <p className="animate-fade-rise-delay-2 mt-4 max-w-md text-sm leading-relaxed text-mist/70 sm:mt-5 sm:text-base">
                {continueTo.hint}
              </p>
            </div>
            <div className="animate-fade-rise-delay-2 mt-6 flex w-full flex-col gap-2.5 sm:mt-8 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              {continueTo.href.startsWith("#") ? (
                <button
                  type="button"
                  onClick={() => {
                    if (continueTo.href === "#passport") {
                      document
                        .getElementById("passport")
                        ?.scrollIntoView({ behavior: "smooth" });
                      return;
                    }
                    window.location.hash = continueTo.href.slice(1);
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center bg-mist px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors hover:bg-celadon hover:text-mist sm:w-auto"
                >
                  {continueTo.label}
                </button>
              ) : (
                <Link
                  href={continueTo.href}
                  className="inline-flex min-h-11 w-full items-center justify-center bg-mist px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors hover:bg-celadon hover:text-mist sm:w-auto"
                >
                  {continueTo.label}
                </Link>
              )}
              {enrolment ? (
                needsPassport && feesStillDue ? (
                  <Link
                    href="/student/payments"
                    className="inline-flex min-h-11 w-full items-center justify-center border border-mist/35 px-5 py-3 text-sm font-medium tracking-wide text-mist/90 transition-colors hover:border-mist hover:bg-mist/10 sm:w-auto"
                  >
                    Payments
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.hash = "application";
                    }}
                    className="inline-flex min-h-11 w-full items-center justify-center border border-mist/35 px-5 py-3 text-sm font-medium tracking-wide text-mist/90 transition-colors hover:border-mist hover:bg-mist/10 sm:w-auto"
                  >
                    Paper trail
                  </button>
                )
              ) : null}
            </div>
          </div>

          <div className="relative flex items-stretch justify-center border-t border-mist/15 bg-pine/50 lg:border-l lg:border-t-0">
            <div className="flex w-full max-w-[16rem] flex-col items-center justify-center px-5 py-5 sm:max-w-[18rem] sm:px-6 sm:py-8 lg:px-7 lg:py-10">
              {profile.passportUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.passportUrl}
                  alt=""
                  className="aspect-square w-full max-w-[10.5rem] object-cover shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:max-w-[14rem]"
                />
              ) : (
                <span className="flex aspect-square w-full max-w-[10.5rem] items-center justify-center bg-mist/10 font-display text-4xl tracking-wide text-mist/90 sm:max-w-[14rem] sm:text-5xl">
                  {profile.first_name.slice(0, 1)}
                  {profile.last_name.slice(0, 1)}
                </span>
              )}
              <p className="mt-3 text-center text-[0.6rem] font-medium uppercase tracking-[0.16em] text-mist/50 sm:mt-4 sm:text-[0.65rem]">
                Passport
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Identity measure */}
      <section
        className="animate-fade-rise-delay-2 border-x border-b border-stone bg-mist"
        data-tour="student-overview-identity"
      >
        <div className="grid grid-cols-2 gap-px bg-stone lg:grid-cols-4">
          <div className="bg-mist px-3.5 py-3.5 sm:px-5 sm:py-4">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/45 sm:text-[0.65rem] sm:tracking-[0.14em]">
              Standing
            </p>
            <p className="mt-1 break-words font-display text-base leading-snug text-pine sm:mt-1.5 sm:text-lg">
              {statusTitle}
            </p>
          </div>
          <div className="bg-mist px-3.5 py-3.5 sm:px-5 sm:py-4">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/45 sm:text-[0.65rem] sm:tracking-[0.14em]">
              Payment
            </p>
            <p className="mt-1 break-words font-display text-base leading-snug text-pine sm:mt-1.5 sm:text-lg">
              {enrolment
                ? paymentCopy(payment, tuitionPaidGbp, tuitionDueGbp)
                : "—"}
            </p>
            {enrolment &&
            payment !== "paid" &&
            tuitionPaidGbp > 0 &&
            tuitionRemaining > 0 ? (
              <p className="mt-1 text-xs text-ink/50">
                {formatGbp(tuitionPaidGbp)} of {formatGbp(tuitionDueGbp)} tuition
                paid
              </p>
            ) : null}
          </div>
          <div className="bg-mist px-3.5 py-3.5 sm:px-5 sm:py-4">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/45 sm:text-[0.65rem] sm:tracking-[0.14em]">
              Place
            </p>
            <p className="mt-1 break-words text-sm leading-snug text-ink/75 sm:mt-1.5">
              {parishBatch || "Not assigned yet"}
            </p>
          </div>
          <div className="bg-mist px-3.5 py-3.5 sm:px-5 sm:py-4">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/45 sm:text-[0.65rem] sm:tracking-[0.14em]">
              Reference
            </p>
            <p className="mt-1 break-all font-mono text-xs tracking-wide text-ink/75 sm:mt-1.5 sm:text-sm">
              {enrolment?.reference ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-stone px-3.5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-3.5">
          <div className="min-w-0">
            <p className="truncate font-display text-base text-pine sm:text-lg">
              {name}
            </p>
            <p className="truncate text-sm text-ink/55">{profile.email}</p>
          </div>
          {profile.passport_path && !needsPassport ? (
            <p className="text-[0.65rem] uppercase tracking-[0.12em] text-ink/40 sm:text-right">
              Photograph on file
            </p>
          ) : !passportUnlocked ? (
            <p className="max-w-md text-xs leading-relaxed text-ink/55 sm:max-w-xs sm:text-right">
              Passport unlocks after your first tuition instalment is confirmed.
            </p>
          ) : null}
        </div>
        {enrolment?.updated_at ? (
          <p className="border-t border-stone px-3.5 py-2.5 text-xs text-ink/45 sm:px-5">
            Last updated{" "}
            <time dateTime={enrolment.updated_at}>
              {formatEnrolmentDateTime(enrolment.updated_at)}
            </time>
            . Leave this tab and come back to pick up desk updates.
          </p>
        ) : null}
      </section>

      {needsPassport ? (
        <section
          id="passport"
          className="scroll-mt-24 border-x border-b border-stone bg-[#f7f1e6] px-4 py-5 sm:px-7 sm:py-6"
        >
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-[#6b4f2a]">
            Required
          </p>
          <h2 className="mt-2 font-display text-xl text-pine sm:text-2xl">
            Add your passport photograph
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
            It becomes your account image and cannot be changed later.
          </p>
          <div className="mt-4 w-full max-w-md sm:mt-5">
            <PhotoUploadCard
              kind="passport"
              required
              alreadyUploaded={false}
            />
          </div>
        </section>
      ) : null}

      {/* Four thresholds — spine path */}
      <section className="relative px-0.5 py-8 sm:py-14" data-tour="student-overview-journey">
        <div className="mb-6 max-w-xl sm:mb-10">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon sm:text-[0.7rem] sm:tracking-[0.18em]">
            Four thresholds
          </p>
          <h2 className="mt-2 font-display text-[1.65rem] tracking-[-0.02em] text-pine sm:text-3xl">
            From form to classroom
          </h2>
        </div>

        <ol className="relative space-y-0 lg:grid lg:grid-cols-4 lg:gap-0 lg:space-y-0">
          <span
            className="pointer-events-none absolute left-[1.15rem] top-3 bottom-3 w-px bg-stone lg:left-0 lg:right-0 lg:top-[1.15rem] lg:bottom-auto lg:h-px lg:w-auto"
            aria-hidden
          />
          {journey.map((step, index) => (
            <li
              key={step.id}
              className="relative flex gap-3.5 py-3.5 pl-0 sm:gap-4 sm:py-4 lg:flex-col lg:gap-3 lg:px-3 lg:py-0 lg:first:pl-0"
            >
              <span
                className={`relative z-[1] flex size-9 shrink-0 items-center justify-center text-xs font-medium tabular-nums lg:mx-0 ${
                  step.state === "done"
                    ? "bg-pine text-mist"
                    : step.state === "current"
                      ? "bg-celadon text-mist ring-4 ring-celadon/20"
                      : "border border-stone bg-mist text-ink/40"
                }`}
              >
                {step.state === "done" ? (
                  <svg
                    viewBox="0 0 16 16"
                    className="size-3.5"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="square"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <div className="min-w-0 pt-1 lg:pt-0">
                <p
                  className={`text-[0.65rem] font-medium uppercase tracking-[0.14em] ${
                    step.state === "upcoming" ? "text-ink/35" : "text-pine"
                  }`}
                >
                  {step.label}
                </p>
                <p
                  className={`mt-1 text-sm leading-relaxed sm:mt-1.5 ${
                    step.state === "upcoming" ? "text-ink/40" : "text-ink/70"
                  }`}
                >
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Featured notice + listening desk */}
      <section
        className="relative grid gap-px overflow-hidden border border-stone bg-stone lg:grid-cols-[1.4fr_1fr]"
        data-tour="student-overview-signal"
      >
        <div className="bg-stone/30 px-4 py-6 sm:px-7 sm:py-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-[#6b4f2a]/75 sm:text-[0.7rem] sm:tracking-[0.18em]">
                Signal
              </p>
              <h2 className="mt-2 font-display text-xl tracking-[-0.02em] text-pine sm:text-2xl">
                From the board
              </h2>
            </div>
            <Link
              href="/student/notices"
              className="inline-flex min-h-11 items-center text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:text-celadon sm:min-h-0"
            >
              All notices
            </Link>
          </div>

          {noticesError ? (
            <p
              className="mt-5 max-w-md border border-red-800/20 bg-red-50/80 px-4 py-3 text-sm leading-relaxed text-red-900 sm:mt-6"
              role="alert"
            >
              {noticesError}
            </p>
          ) : featured ? (
            <article className="relative mt-5 overflow-hidden border border-[#c4a574]/30 bg-[#f7f1e6]/55 px-3.5 py-4 sm:mt-6 sm:px-5 sm:pb-5 sm:pt-6">
              <NoticeFilesMark
                count={featured.attachments?.length ?? 0}
                tone="parchment"
              />
              <div className="flex flex-col gap-1.5 pr-14 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2 sm:pr-20">
                <h3 className="break-words font-display text-lg text-pine sm:text-xl">
                  {featured.title}
                </h3>
                {formatAnnouncementDate(featured.publishedAt) ? (
                  <time className="shrink-0 text-xs tracking-wide text-ink/45">
                    {formatAnnouncementDate(featured.publishedAt)}
                  </time>
                ) : null}
              </div>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
                {featured.body}
              </p>
              <NoticeAttachmentList
                files={featured.attachments}
                tone="parchment"
                onExternalNavigate={(payload) =>
                  setPendingExternal({ kind: "attachment", ...payload })
                }
              />
              {featured.href &&
              featured.hrefLabel &&
              isSafeAnnouncementHref(featured.href) ? (
                featured.href.startsWith("http://") ||
                featured.href.startsWith("https://") ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPendingExternal({
                        kind: "link",
                        href: featured.href!,
                        label: featured.hrefLabel!,
                      })
                    }
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:text-celadon sm:min-h-0"
                  >
                    {featured.hrefLabel}
                  </button>
                ) : (
                  <Link
                    href={featured.href}
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:text-celadon sm:min-h-0"
                  >
                    {featured.hrefLabel}
                  </Link>
                )
              ) : null}
            </article>
          ) : (
            <p className="mt-5 max-w-md text-sm leading-relaxed text-ink/55 sm:mt-6">
              Quiet for now. When the desk posts to the student board, the latest
              signal lands here.
            </p>
          )}
        </div>

        <div className="flex flex-col justify-between bg-mist px-4 py-6 sm:px-7 sm:py-10">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon sm:text-[0.7rem] sm:tracking-[0.18em]">
              Listening Desk
            </p>
            <h2 className="mt-2 font-display text-xl tracking-[-0.02em] text-pine sm:text-2xl">
              Need a hand?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink/60">
              Signed in as {name}. Reach support anytime — tickets stay with your
              account.
            </p>
          </div>
          <Link
            href="/student/support"
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center border border-pine/30 px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors hover:border-pine hover:bg-stone/40 sm:mt-8 sm:w-fit"
          >
            Open support desk
          </Link>
        </div>
      </section>

      <DeskConfirmModal
        open={Boolean(pendingExternal)}
        onClose={() => setPendingExternal(null)}
        onConfirm={confirmExternal}
        eyebrow="Leave the portal"
        title={
          pendingExternal?.kind === "attachment"
            ? pendingExternal.action === "download"
              ? "Download this file?"
              : "Open this file?"
            : "Open this link?"
        }
        body={
          pendingExternal?.kind === "attachment" ? (
            <>
              You are about to{" "}
              {pendingExternal.action === "download" ? "download" : "open"}{" "}
              <span className="font-medium text-ink">
                {pendingExternal.fileName}
              </span>{" "}
              in a new tab. The School hosts this file outside the notice board.
            </>
          ) : pendingExternal?.kind === "link" ? (
            <>
              <span className="font-medium text-ink">
                {pendingExternal.label}
              </span>{" "}
              opens on an external site. You will leave the student portal.
            </>
          ) : null
        }
        confirmLabel={
          pendingExternal?.kind === "attachment"
            ? pendingExternal.action === "download"
              ? "Download file"
              : "Open file"
            : "Continue"
        }
      />

      <div className="h-8 sm:h-14" aria-hidden />
    </div>
  );
}

function ApplicationView({
  profile,
  enrolment,
  status,
  payment,
  tuitionPaidGbp,
  tuitionDueGbp,
  fee,
  needsPayment,
  proofInReview,
  paid,
}: {
  profile: StudentProfile;
  enrolment: StudentEnrolment | null;
  status: { title: string; body: string };
  payment: PaymentStatus;
  tuitionPaidGbp: number;
  tuitionDueGbp: number;
  fee: { amountGbp: number } | null;
  needsPayment: boolean;
  proofInReview: boolean;
  paid: boolean;
}) {
  return (
    <div
      id="application"
      data-tour="student-application-page"
      className="relative mx-auto w-full max-w-5xl scroll-mt-24 pt-1 sm:pt-4"
    >
      <section className="pb-5 sm:pb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Application
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.75rem,5.5vw,2.5rem)] tracking-[-0.02em] text-pine">
          Status and form
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
          Where your enrolment stands, and a read-only copy of what you
          submitted. This page is view-only — no changes here.
        </p>
        {enrolment?.updated_at ? (
          <p className="mt-2 text-xs text-ink/45">
            Last updated{" "}
            <time dateTime={enrolment.updated_at}>
              {formatEnrolmentDateTime(enrolment.updated_at)}
            </time>
            . Leave this tab and come back to pick up desk updates.
          </p>
        ) : null}
      </section>

      <section className="pb-8 sm:pb-10">
        <div
          className="border border-pine/15 bg-pine text-mist"
          data-tour="student-application-status"
        >
          <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
            <div className="px-4 py-6 sm:px-8 sm:py-10">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
                Where you are
              </p>
              <h2 className="mt-3 break-words font-display text-[clamp(1.5rem,4.5vw,2.4rem)] tracking-[-0.02em]">
                {status.title}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-mist/75 sm:text-base">
                {status.body}
              </p>

              {enrolment ? (
                <div className="mt-6 grid grid-cols-1 gap-4 border-t border-mist/15 pt-5 text-sm sm:mt-8 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4 sm:pt-6 lg:grid-cols-4">
                  <div className="min-w-0">
                    <p className="text-[0.65rem] uppercase tracking-[0.14em] text-mist/45">
                      Reference
                    </p>
                    <p className="mt-1 break-all font-mono tracking-wide text-mist">
                      {enrolment.reference}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] uppercase tracking-[0.14em] text-mist/45">
                      Programme
                    </p>
                    <p className="mt-1 break-words text-mist">
                      {programmeLabel(enrolment.attendance_mode)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] uppercase tracking-[0.14em] text-mist/45">
                      Place
                    </p>
                    <p className="mt-1 break-words text-mist">
                      {[
                        enrolment.parish_name,
                        enrolment.batch_label,
                        enrolment.cohort_label,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Awaiting placement"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] uppercase tracking-[0.14em] text-mist/45">
                      Payment
                    </p>
                    <p className="mt-1 break-words text-mist">
                      {paymentCopy(payment, tuitionPaidGbp, tuitionDueGbp)}
                      {fee ? ` · ${formatGbp(fee.amountGbp)} programme` : null}
                    </p>
                  </div>
                </div>
              ) : (
                <Link
                  href="/enrol"
                  className="mt-6 inline-flex min-h-11 w-full items-center justify-center bg-mist px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors hover:bg-celadon hover:text-mist sm:mt-8 sm:w-auto"
                >
                  Begin enrolment
                </Link>
              )}
            </div>

            <div className="border-t border-mist/15 bg-pine/40 px-4 py-6 sm:px-8 sm:py-10 lg:border-l lg:border-t-0">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
                Next step
              </p>
              {needsPayment && enrolment && fee ? (
                <>
                  <h3 className="mt-3 font-display text-xl tracking-[-0.02em] sm:text-2xl">
                    {proofInReview
                      ? "Proof with the desk"
                      : "Settle your fees"}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-mist/70">
                    {proofInReview
                      ? "Your bank proof is under review. Track it from Payments."
                      : `Tuition ${formatGbp(TUITION_FEE.amountGbp)} and ${GRADUATION_FEE.label.toLowerCase()} ${formatGbp(GRADUATION_FEE.amountGbp)} — pay in full or by instalment (minimum ${formatGbp(50)} each time).`}
                  </p>
                  <Link
                    href="/student/payments"
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center bg-mist px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors hover:bg-celadon hover:text-mist sm:mt-6 sm:w-auto"
                  >
                    Open payments
                  </Link>
                </>
              ) : paid ? (
                <>
                  <h3 className="mt-3 font-display text-xl tracking-[-0.02em] sm:text-2xl">
                    Place secured
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-mist/70">
                    Payment is confirmed. Classes and materials live under their
                    own sections.
                  </p>
                  <Link
                    href="/student/classes"
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center bg-mist px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors hover:bg-celadon hover:text-mist sm:mt-6 sm:w-auto"
                  >
                    View classes
                  </Link>
                </>
              ) : (
                <>
                  <h3 className="mt-3 font-display text-xl tracking-[-0.02em] sm:text-2xl">
                    Wait for word
                  </h3>
                  <p className="mt-3 break-words text-sm leading-relaxed text-mist/70">
                    We’ll email {profile.email} when your status changes.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {enrolment ? (
        <section className="relative pb-10 sm:pb-12" data-tour="student-application-form">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Submitted form
          </p>
          <h2 className="mt-2 font-display text-2xl tracking-[-0.02em] text-pine sm:text-3xl">
            What you sent
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/60">
            Read-only. Contact the Listening Desk if something needs correcting.
          </p>
          <dl className="mt-5 grid gap-px overflow-hidden border border-stone bg-stone sm:mt-6 sm:grid-cols-2">
            <FormMeta
              label="Full name"
              value={[
                enrolment.first_name,
                enrolment.middle_name,
                enrolment.last_name,
              ]
                .filter(Boolean)
                .join(" ")}
            />
            <FormMeta label="Email" value={enrolment.email} />
            <FormMeta
              label="Mobile"
              value={enrolment.mobile_number?.trim() || "—"}
            />
            <FormMeta
              label="Date of birth"
              value={formatDob(enrolment.date_of_birth)}
            />
            <FormMeta
              label="Nationality"
              value={enrolment.nationality?.trim() || "—"}
            />
            <FormMeta
              label="Programme"
              value={programmeLabel(enrolment.attendance_mode)}
            />
            <FormMeta
              label="Parish"
              value={enrolment.parish_name?.trim() || "—"}
            />
            <FormMeta
              label="Batch"
              value={enrolment.batch_label?.trim() || "—"}
            />
            <FormMeta
              label="Cohort"
              value={enrolment.cohort_label?.trim() || "—"}
            />
            <FormMeta
              label="Local church"
              value={enrolment.local_church?.trim() || "—"}
            />
            <FormMeta
              label="Church leader"
              value={enrolment.church_leader?.trim() || "—"}
            />
            <FormMeta
              label="Address"
              value={addressLines(enrolment) || "—"}
              wide
            />
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function FormMeta({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`bg-mist px-3 py-3.5 sm:px-5 sm:py-4 ${wide ? "sm:col-span-2" : ""}`}
    >
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-sm leading-relaxed text-ink/80">
        {value}
      </dd>
    </div>
  );
}
