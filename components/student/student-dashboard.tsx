"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PhotoUploadCard } from "@/components/student/photo-upload-card";
import { ATTENDANCE_MODES } from "@/lib/enrol/schema";
import {
  formatGbp,
  PROGRAMME_FEES,
  type ProgrammeFeeKey,
} from "@/lib/enrol/payment";
import {
  APPLICATION_FEE,
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

type HomeSection = "overview" | "application";

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
        body: "Welcome aboard. Complete payment to secure your place on the course.",
      };
    case "payment_pending":
      return {
        title: "Payment pending",
        body: "We’re matching your transfer or reviewing uploaded proof.",
      };
    case "paid":
      return {
        title: "Place secured",
        body: "Payment confirmed. Course materials and class details will appear here.",
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

function paymentCopy(status: PaymentStatus | FeePaymentStatus): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending_review":
      return "Proof under review";
    default:
      return "Unpaid";
  }
}

function effectivePaymentStatus(
  enrolment: StudentEnrolment,
  applicationFeeStatus: FeePaymentStatus | null,
): PaymentStatus {
  if (applicationFeeStatus) return applicationFeeStatus;
  return enrolment.payment_status;
}

function buildJourney(
  enrolment: StudentEnrolment | null,
  payment: PaymentStatus,
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
  const reviewDone =
    status === "accepted" ||
    status === "payment_pending" ||
    status === "under_review" ||
    paid;
  const payOpen =
    status === "accepted" ||
    status === "payment_pending" ||
    payment === "pending_review";

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
        : status === "submitted"
          ? "Waiting on the School"
          : "Application reviewed",
      state: rejected
        ? "done"
        : status === "submitted"
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
      detail: paid ? "Opening soon" : "After payment",
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

type StudentDashboardProps = {
  profile: StudentProfile;
  enrolment: StudentEnrolment | null;
  applicationFeeStatus?: FeePaymentStatus | null;
  notices: Announcement[];
  loadError?: string | null;
};

export function StudentDashboard({
  profile,
  enrolment,
  applicationFeeStatus = null,
  notices,
  loadError = null,
}: StudentDashboardProps) {
  const [section, setSection] = useState<HomeSection>("overview");

  useEffect(() => {
    const sync = () => setSection(readHomeSection());
    sync();
    window.addEventListener("hashchange", sync);
    // Catch soft navigations that change the hash without a classic hashchange.
    const onPop = () => sync();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  const name = studentDisplayName(profile);
  const first = profile.first_name;
  const payment = enrolment
    ? effectivePaymentStatus(enrolment, applicationFeeStatus)
    : "unpaid";
  const journey = buildJourney(enrolment, payment);
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
    <div className="relative mx-auto max-w-6xl overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,_rgba(95,143,122,0.18),_transparent_55%),linear-gradient(180deg,_rgba(20,53,44,0.06),_transparent_70%)]"
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
          applicationFeePaid={applicationFeeStatus === "paid" || paid}
          journey={journey}
          notices={notices}
        />
      ) : (
        <ApplicationView
          profile={profile}
          enrolment={enrolment}
          status={status}
          payment={payment}
          fee={fee}
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
      hint: "Your fee is paid — finish your profile photograph.",
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
  applicationFeePaid,
  journey,
  notices,
}: {
  profile: StudentProfile;
  first: string;
  name: string;
  statusTitle: string;
  enrolment: StudentEnrolment | null;
  payment: PaymentStatus;
  applicationFeePaid: boolean;
  journey: JourneyStep[];
  notices: Announcement[];
}) {
  const needsPassport = applicationFeePaid && !profile.passport_path;
  const continueTo = overviewContinue(enrolment, payment, needsPassport);
  const featured = notices[0] ?? null;
  const parishBatch = [enrolment?.parish_name, enrolment?.batch_label]
    .filter(Boolean)
    .join(" · ");

  return (
    <div id="overview" className="relative">
      {/* Hero — one composition: greeting, walk-on line, CTA, square passport */}
      <section className="relative overflow-hidden border border-pine/20 bg-pine text-mist">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_20%,_rgba(95,143,122,0.35),_transparent_50%),linear-gradient(135deg,_transparent_40%,_rgba(0,0,0,0.12)_100%)]"
          aria-hidden
        />
        <div className="relative grid gap-0 lg:grid-cols-[1.15fr_minmax(0,18rem)]">
          <div className="flex flex-col justify-between px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div>
              <p className="animate-fade-rise text-[0.7rem] font-medium uppercase tracking-[0.2em] text-celadon">
                {greetingForHour()}
              </p>
              <h1 className="animate-fade-rise-delay-1 mt-4 max-w-lg font-display text-[clamp(2.4rem,7vw,3.85rem)] leading-[0.92] tracking-[-0.035em]">
                {first}, walk on.
              </h1>
              <p className="animate-fade-rise-delay-2 mt-5 max-w-md text-sm leading-relaxed text-mist/70 sm:text-base">
                {continueTo.hint}
              </p>
            </div>
            <div className="animate-fade-rise-delay-2 mt-8 flex flex-wrap items-center gap-3">
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
                  className="inline-flex min-h-11 items-center bg-mist px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors hover:bg-celadon hover:text-mist"
                >
                  {continueTo.label}
                </button>
              ) : (
                <Link
                  href={continueTo.href}
                  className="inline-flex min-h-11 items-center bg-mist px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors hover:bg-celadon hover:text-mist"
                >
                  {continueTo.label}
                </Link>
              )}
              {enrolment ? (
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = "application";
                  }}
                  className="inline-flex min-h-11 items-center border border-mist/35 px-5 py-3 text-sm font-medium tracking-wide text-mist/90 transition-colors hover:border-mist hover:bg-mist/10"
                >
                  Paper trail
                </button>
              ) : null}
            </div>
          </div>

          <div className="relative flex items-stretch justify-center border-t border-mist/15 bg-pine/50 lg:border-l lg:border-t-0">
            <div className="flex w-full max-w-[18rem] flex-col items-center justify-center px-6 py-8 lg:px-7 lg:py-10">
              {profile.passportUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.passportUrl}
                  alt=""
                  className="aspect-square w-full max-w-[14rem] object-cover shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
                />
              ) : (
                <span className="flex aspect-square w-full max-w-[14rem] items-center justify-center bg-mist/10 font-display text-5xl tracking-wide text-mist/90">
                  {profile.first_name.slice(0, 1)}
                  {profile.last_name.slice(0, 1)}
                </span>
              )}
              <p className="mt-4 text-center text-[0.65rem] font-medium uppercase tracking-[0.16em] text-mist/50">
                Passport
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Identity measure */}
      <section className="animate-fade-rise-delay-2 border-x border-b border-stone bg-mist">
        <div className="grid gap-px bg-stone sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-mist px-5 py-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
              Standing
            </p>
            <p className="mt-1.5 font-display text-lg text-pine">{statusTitle}</p>
          </div>
          <div className="bg-mist px-5 py-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
              Payment
            </p>
            <p className="mt-1.5 font-display text-lg text-pine">
              {enrolment ? paymentCopy(payment) : "—"}
            </p>
          </div>
          <div className="bg-mist px-5 py-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
              Place
            </p>
            <p className="mt-1.5 break-words text-sm leading-snug text-ink/75">
              {parishBatch || "Not assigned yet"}
            </p>
          </div>
          <div className="bg-mist px-5 py-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
              Reference
            </p>
            <p className="mt-1.5 break-all font-mono text-sm tracking-wide text-ink/75">
              {enrolment?.reference ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone px-5 py-3.5">
          <div className="min-w-0">
            <p className="truncate font-display text-base text-pine sm:text-lg">
              {name}
            </p>
            <p className="truncate text-sm text-ink/55">{profile.email}</p>
          </div>
          {profile.passport_path && !needsPassport ? (
            <p className="text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
              Photograph on file
            </p>
          ) : !applicationFeePaid ? (
            <p className="max-w-xs text-right text-xs leading-relaxed text-ink/55">
              Passport unlocks after the application fee.
            </p>
          ) : null}
        </div>
      </section>

      {needsPassport ? (
        <section
          id="passport"
          className="scroll-mt-24 border-x border-b border-stone bg-[#f7f1e6] px-5 py-6 sm:px-7"
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
          <div className="mt-5 max-w-md">
            <PhotoUploadCard
              kind="passport"
              required
              alreadyUploaded={false}
            />
          </div>
        </section>
      ) : null}

      {/* Four thresholds — spine path */}
      <section className="relative py-12 sm:py-14">
        <div className="mb-8 max-w-xl sm:mb-10">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Four thresholds
          </p>
          <h2 className="mt-2 font-display text-2xl tracking-[-0.02em] text-pine sm:text-3xl">
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
              className="relative flex gap-4 py-4 pl-0 lg:flex-col lg:gap-3 lg:px-3 lg:py-0 lg:first:pl-0"
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
                  className={`mt-1.5 text-sm leading-relaxed ${
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
      <section className="relative grid gap-px overflow-hidden border border-stone bg-stone lg:grid-cols-[1.4fr_1fr]">
        <div className="bg-stone/30 px-5 py-8 sm:px-7 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-[#6b4f2a]/75">
                Signal
              </p>
              <h2 className="mt-2 font-display text-2xl tracking-[-0.02em] text-pine">
                From the board
              </h2>
            </div>
            <Link
              href="/student/notices"
              className="text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:text-celadon"
            >
              All notices
            </Link>
          </div>

          {featured ? (
            <article className="mt-6 border-l-2 border-celadon pl-4 sm:pl-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg text-pine sm:text-xl">
                  {featured.title}
                </h3>
                {formatAnnouncementDate(featured.publishedAt) ? (
                  <time className="text-xs tracking-wide text-ink/45">
                    {formatAnnouncementDate(featured.publishedAt)}
                  </time>
                ) : null}
              </div>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
                {featured.body}
              </p>
              {featured.href &&
              featured.hrefLabel &&
              isSafeAnnouncementHref(featured.href) ? (
                featured.href.startsWith("http://") ||
                featured.href.startsWith("https://") ? (
                  <a
                    href={featured.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:text-celadon"
                  >
                    {featured.hrefLabel}
                  </a>
                ) : (
                  <Link
                    href={featured.href}
                    className="mt-3 inline-flex text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:text-celadon"
                  >
                    {featured.hrefLabel}
                  </Link>
                )
              ) : null}
            </article>
          ) : (
            <p className="mt-6 max-w-md text-sm leading-relaxed text-ink/55">
              Quiet for now. When the desk posts to the student board, the latest
              signal lands here.
            </p>
          )}
        </div>

        <div className="flex flex-col justify-between bg-mist px-5 py-8 sm:px-7 sm:py-10">
          <div>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
              Listening Desk
            </p>
            <h2 className="mt-2 font-display text-2xl tracking-[-0.02em] text-pine">
              Need a hand?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink/60">
              Signed in as {name}. Reach support anytime — tickets stay with your
              account.
            </p>
          </div>
          <Link
            href="/student/support"
            className="mt-8 inline-flex min-h-11 w-fit items-center border border-pine/30 px-5 py-3 text-sm font-medium tracking-wide text-pine transition-colors hover:border-pine hover:bg-stone/40"
          >
            Open support desk
          </Link>
        </div>
      </section>

      <div className="h-10 sm:h-14" aria-hidden />
    </div>
  );
}

function ApplicationView({
  profile,
  enrolment,
  status,
  payment,
  fee,
  needsPayment,
  proofInReview,
  paid,
}: {
  profile: StudentProfile;
  enrolment: StudentEnrolment | null;
  status: { title: string; body: string };
  payment: PaymentStatus;
  fee: { amountGbp: number } | null;
  needsPayment: boolean;
  proofInReview: boolean;
  paid: boolean;
}) {
  return (
    <div id="application" className="relative mx-auto w-full max-w-4xl scroll-mt-24 pt-1 sm:pt-4">
      <section className="pb-5 sm:pb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Application
        </p>
        <h1 className="mt-2 font-display text-[clamp(1.75rem,5.5vw,2.5rem)] tracking-[-0.02em] text-pine">
          Status and form
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
          Where your enrolment stands, and a read-only copy of what you
          submitted.
        </p>
      </section>

      <section className="pb-8 sm:pb-10">
        <div className="border border-pine/15 bg-pine text-mist">
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
                <div className="mt-6 grid grid-cols-1 gap-4 border-t border-mist/15 pt-5 text-sm sm:mt-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-4 sm:pt-6">
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
                      Payment
                    </p>
                    <p className="mt-1 break-words text-mist">
                      {paymentCopy(payment)}
                      {fee ? ` · ${formatGbp(fee.amountGbp)}` : null}
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
                      : `${APPLICATION_FEE.label} ${formatGbp(fee.amountGbp)} plus ${GRADUATION_FEE.label.toLowerCase()} ${formatGbp(GRADUATION_FEE.amountGbp)}.`}
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
        <section className="relative pb-10 sm:pb-12">
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
