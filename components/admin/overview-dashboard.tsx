"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { getStatementOfReport } from "@/app/admin/overview/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  downloadStatementExcel,
  downloadStatementJpg,
  downloadStatementPdf,
  downloadStatementWord,
} from "@/lib/admin/statement-report-download";
import type {
  OverviewStats,
  StatementReportBundle,
} from "@/lib/admin/overview-types";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { publicActionMessage } from "@/lib/safe-action-message";
import type { Parish } from "@/lib/parishes";

type OverviewDashboardProps = {
  profile: AdminProfile;
  stats: OverviewStats;
  parishes: Pick<Parish, "id" | "name">[];
  firstName: string;
  greeting: string;
};

const fieldClass =
  "mt-1 w-full min-w-0 border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function MetricLink({
  href,
  label,
  value,
  hint,
  tone = "mist",
  compact = false,
}: {
  href: string;
  label: string;
  value: string | number;
  hint: string;
  tone?: "mist" | "pine" | "warn";
  compact?: boolean;
}) {
  const shell =
    tone === "pine"
      ? "bg-pine text-mist hover:bg-pine/90"
      : tone === "warn"
        ? "bg-[#f7efe8] text-ink hover:bg-[#f3e6da]"
        : "bg-mist text-ink hover:bg-white/85";
  const labelCls = tone === "pine" ? "text-mist/55" : "text-ink/45";
  const valueCls = tone === "pine" ? "text-mist" : "text-pine";
  const hintCls = tone === "pine" ? "text-mist/65" : "text-ink/55";

  return (
    <Link
      href={href}
      prefetch={false}
      className={`flex flex-col justify-between transition-colors ${shell} ${
        compact
          ? "min-h-[5.25rem] px-3 py-3 sm:min-h-[6.25rem] sm:px-3.5 sm:py-3.5"
          : "min-h-[5.75rem] px-3 py-3 sm:min-h-[7rem] sm:px-4 sm:py-4"
      }`}
    >
      <p
        className={`text-[0.58rem] font-medium uppercase tracking-[0.11em] sm:text-[0.65rem] ${labelCls}`}
      >
        {label}
      </p>
      <div className="mt-2">
        <p
          className={`font-display leading-none tabular-nums ${valueCls} ${
            compact
              ? "text-2xl sm:text-3xl"
              : "text-[1.75rem] sm:text-4xl"
          }`}
        >
          {value}
        </p>
        <p className={`mt-1 truncate text-[0.7rem] sm:mt-1.5 sm:text-sm ${hintCls}`}>
          {hint}
        </p>
      </div>
    </Link>
  );
}

function FunnelBar({
  label,
  count,
  total,
  href,
}: {
  label: string;
  count: number;
  total: number;
  href: string;
}) {
  const width = total > 0 ? Math.max(4, pct(count, total)) : 0;
  return (
    <Link href={href} prefetch={false} className="group block py-1 sm:py-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs sm:gap-3 sm:text-sm">
        <span className="min-w-0 truncate text-ink/70 group-hover:text-pine">
          {label}
        </span>
        <span className="shrink-0 tabular-nums font-medium text-ink">
          {count}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden bg-stone/70 sm:mt-1.5 sm:h-1.5">
        <div
          className="h-full bg-celadon/80 transition-[width] duration-500 group-hover:bg-pine"
          style={{ width: `${width}%` }}
        />
      </div>
    </Link>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="min-w-0 border border-stone/80 bg-white/55 px-2.5 py-2.5 sm:px-3.5 sm:py-3">
      <p className="truncate text-[0.55rem] font-medium uppercase tracking-[0.1em] text-ink/45 sm:text-[0.6rem]">
        {label}
      </p>
      <p className="mt-1.5 font-display text-xl leading-none text-pine tabular-nums sm:mt-2 sm:text-3xl">
        {value}
      </p>
      {sub ? (
        <p className="mt-1 truncate text-[0.65rem] text-ink/50 sm:mt-1.5 sm:text-xs">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3 sm:mb-3">
      <div className="min-w-0">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon sm:text-[0.65rem]">
          {eyebrow}
        </p>
        <h2 className="mt-0.5 font-display text-lg tracking-[-0.02em] text-pine sm:mt-1 sm:text-2xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function OverviewDashboard({
  profile,
  stats,
  parishes,
  firstName,
  greeting,
}: OverviewDashboardProps) {
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const national = isNationalAdmin(profile);
  const [parishId, setParishId] = useState(
    national ? "" : profile.parish_id ?? "",
  );
  const [paidOnly, setPaidOnly] = useState(true);
  const [preview, setPreview] = useState<StatementReportBundle | null>(null);

  const seatLabel =
    profile.role === "master"
      ? "Master"
      : national
        ? "National"
        : "Parish";

  const paidRate = pct(stats.paidSeats, stats.students);
  const attendanceCoverage = pct(
    stats.recordsWithAttendance,
    stats.scorecards,
  );

  const attentionItems = useMemo(
    () =>
      [
        {
          label: "desk notes",
          value: stats.openTickets,
        },
        {
          label: "in review",
          value: stats.applicationsInReview,
        },
        {
          label: "proofs",
          value: stats.pendingPayments,
        },
        {
          label: "to grade",
          value: stats.examsNeedingGrade,
        },
      ].filter((i) => i.value > 0),
    [stats],
  );

  const enrolmentStages = [
    { label: "Submitted", count: stats.enrolmentByStatus.submitted },
    { label: "Under review", count: stats.enrolmentByStatus.under_review },
    { label: "Accepted", count: stats.enrolmentByStatus.accepted },
    { label: "Payment pending", count: stats.enrolmentByStatus.payment_pending },
    { label: "Paid / secured", count: stats.enrolmentByStatus.paid },
    { label: "Rejected", count: stats.enrolmentByStatus.rejected },
  ];

  function loadReport(
    thenDownload?: (bundle: StatementReportBundle) => void,
    label = "Building statement…",
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const bundle = await getStatementOfReport({
          parishId: parishId || undefined,
          paidOnly,
        });
        setPreview(bundle);
        if (thenDownload) {
          thenDownload(bundle);
          success(
            `Downloaded statement (${bundle.rows.length} student${bundle.rows.length === 1 ? "" : "s"}).`,
            "Overview",
          );
        } else {
          info(
            `Loaded ${bundle.rows.length} student${bundle.rows.length === 1 ? "" : "s"}.`,
            "Overview",
          );
        }
      } catch (err) {
        error(publicActionMessage(err), "Overview");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Hero — compact on mobile, split on desktop */}
      <section className="animate-fade-rise relative overflow-hidden border-b border-stone pb-5 sm:pb-8">
        <div
          className="pointer-events-none absolute -right-12 -top-16 hidden h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(95,143,122,0.16),transparent_70%)] sm:block"
          aria-hidden
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon sm:text-[0.65rem]">
              Overview · {seatLabel}
            </p>
            <h1 className="mt-1.5 font-display text-[clamp(1.55rem,7vw,2.75rem)] leading-[1.02] tracking-[-0.02em] text-pine sm:mt-2">
              {greeting}
              {firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="mt-2 line-clamp-2 max-w-xl text-xs leading-relaxed text-ink/60 sm:mt-3 sm:line-clamp-none sm:text-base sm:text-ink/65">
              {stats.deskLabel}
              <span className="hidden sm:inline">
                . Updated {stats.generatedAtLabel}
              </span>
            </p>
          </div>

          <div
            className={`flex shrink-0 items-center justify-between gap-4 border px-3.5 py-2.5 sm:min-w-[9.5rem] sm:flex-col sm:items-stretch sm:justify-start sm:px-5 sm:py-4 ${
              stats.attentionTotal > 0
                ? "border-[#c4a574]/45 bg-[#f7efe8]"
                : "border-pine/20 bg-pine/5"
            }`}
          >
            <div>
              <p className="text-[0.55rem] font-medium uppercase tracking-[0.12em] text-ink/45 sm:text-[0.6rem]">
                Needs attention
              </p>
              <p className="mt-0.5 hidden text-xs text-ink/50 sm:mt-1.5 sm:block">
                {stats.attentionTotal === 0
                  ? "Desk is clear"
                  : "Open items across desks"}
              </p>
            </div>
            <p className="font-display text-3xl leading-none text-pine tabular-nums sm:mt-1 sm:text-4xl">
              {stats.attentionTotal}
            </p>
          </div>
        </div>
      </section>

      {/* Attention lane */}
      <section className="animate-fade-rise-delay-1 mt-5 sm:mt-7">
        <SectionHead eyebrow="Today's lane" title="Act on these first" />
        <div className="grid grid-cols-2 gap-px overflow-hidden border border-stone bg-stone lg:grid-cols-4">
          <MetricLink
            href="/admin/tickets"
            label="Desk inbox"
            value={stats.openTickets}
            hint={`${stats.unsettledTickets} unsettled`}
            tone={stats.openTickets > 0 ? "warn" : "mist"}
          />
          <MetricLink
            href="/admin/students"
            label="In review"
            value={stats.applicationsInReview}
            hint="Applications"
            tone={stats.applicationsInReview > 0 ? "warn" : "mist"}
          />
          <MetricLink
            href="/admin/payments"
            label="Payment proofs"
            value={stats.pendingPayments}
            hint="Bank uploads"
            tone={stats.pendingPayments > 0 ? "warn" : "mist"}
          />
          <MetricLink
            href="/admin/exams?tab=queue"
            label="Exam queue"
            value={stats.examsNeedingGrade}
            hint="Awaiting grade"
            tone={stats.examsNeedingGrade > 0 ? "pine" : "mist"}
          />
        </div>
        <p className="mt-2.5 text-[0.7rem] leading-relaxed text-ink/50 sm:mt-3 sm:text-sm">
          {attentionItems.length > 0 ? (
            <>
              Priority:{" "}
              {attentionItems
                .map((i) => `${i.value} ${i.label}`)
                .join(" · ")}
            </>
          ) : (
            <>No blocking work — good moment for Records or Campaigns.</>
          )}
        </p>
      </section>

      {/* Cohort + Finance */}
      <section className="animate-fade-rise-delay-2 mt-6 grid gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-2">
        <div className="border border-stone bg-mist/40 p-3.5 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon sm:text-[0.65rem]">
                Cohort
              </p>
              <h2 className="mt-0.5 font-display text-lg text-pine sm:mt-1 sm:text-xl">
                {stats.students} student{stats.students === 1 ? "" : "s"}
              </h2>
              <p className="mt-1 text-xs text-ink/55 sm:text-sm">
                {stats.studentsActive} active · {stats.studentsPaused} paused
              </p>
            </div>
            <Link
              href="/admin/students"
              className="shrink-0 pt-0.5 text-xs font-medium text-pine underline-offset-2 hover:underline sm:text-sm"
            >
              Open →
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">
            <StatTile label="7 days" value={stats.newEnrolments7d} sub="New" />
            <StatTile
              label="30 days"
              value={stats.newEnrolments30d}
              sub="New"
            />
            <StatTile
              label="Paid rate"
              value={`${paidRate}%`}
              sub={`${stats.paidSeats} seats`}
            />
          </div>

          <div className="mt-4 sm:mt-5">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-ink/40">
              Enrolment funnel
            </p>
            <div className="mt-1.5 sm:mt-2">
              {enrolmentStages.map((stage) => (
                <FunnelBar
                  key={stage.label}
                  label={stage.label}
                  count={stage.count}
                  total={stats.students}
                  href="/admin/students"
                />
              ))}
            </div>
          </div>
        </div>

        <div className="border border-stone bg-mist/40 p-3.5 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon sm:text-[0.65rem]">
                Fees
              </p>
              <h2 className="mt-0.5 font-display text-lg text-pine sm:mt-1 sm:text-xl">
                Payment pulse
              </h2>
              <p className="mt-1 text-xs text-ink/55 sm:text-sm">
                Enrolment payment flags
              </p>
            </div>
            <Link
              href="/admin/payments"
              className="shrink-0 pt-0.5 text-xs font-medium text-pine underline-offset-2 hover:underline sm:text-sm"
            >
              Desk →
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">
            <StatTile label="Paid" value={stats.paidSeats} />
            <StatTile
              label="In review"
              value={stats.paymentPendingSeats}
              sub="Flag"
            />
            <StatTile label="Unpaid" value={stats.unpaidSeats} />
          </div>

          <div className="mt-3 border border-stone bg-white/60 p-3 sm:mt-5 sm:p-4">
            <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
              <span className="text-ink/60">Bank proofs waiting</span>
              <span className="font-display text-xl text-pine tabular-nums sm:text-2xl">
                {stats.pendingPayments}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden bg-stone/70 sm:mt-3 sm:h-2">
              <div
                className="h-full bg-pine transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, stats.pendingPayments * 12)}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[0.65rem] text-ink/50 sm:mt-2 sm:text-xs">
              Upload queue on Payments — separate from flags above.
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:mt-4 sm:gap-2">
            <StatTile
              label="Open batches"
              value={stats.openBatches}
              sub="Enrolment open"
            />
            <StatTile
              label={national ? "Active parishes" : "Your parish"}
              value={stats.activeParishes}
              sub={
                national
                  ? "On the network"
                  : stats.parishName ?? "Assigned"
              }
            />
          </div>
        </div>
      </section>

      {/* Learning — scroll row on narrow phones, grid from sm */}
      <section className="mt-6 sm:mt-8">
        <SectionHead
          eyebrow="Learning path"
          title="Classes, exams & records"
        />
        <div className="-mx-0 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
          <div className="grid min-w-[28rem] grid-cols-3 gap-px overflow-hidden border border-stone bg-stone sm:min-w-0 sm:grid-cols-3 lg:grid-cols-6">
            <MetricLink
              compact
              href="/admin/classes"
              label="Upcoming"
              value={stats.classesUpcoming}
              hint="Next 7 days"
            />
            <MetricLink
              compact
              href="/admin/classes"
              label="Live now"
              value={stats.classesLive}
              hint="Zoom"
              tone={stats.classesLive > 0 ? "pine" : "mist"}
            />
            <MetricLink
              compact
              href="/admin/exams"
              label="Published"
              value={stats.publishedExams}
              hint={`${stats.draftExams} draft`}
            />
            <MetricLink
              compact
              href="/admin/exams?tab=queue"
              label="In progress"
              value={stats.attemptsInProgress}
              hint="Attempts"
            />
            <MetricLink
              compact
              href="/admin/records"
              label="Scorecards"
              value={stats.scorecards}
              hint="Records"
            />
            <MetricLink
              compact
              href="/admin/records"
              label="Attendance"
              value={`${attendanceCoverage}%`}
              hint={`${stats.recordsWithAttendance} marked`}
            />
          </div>
        </div>
      </section>

      {/* Ops — always 2×2 on mobile, 4 on desktop */}
      <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-stone bg-stone sm:mt-8 lg:grid-cols-4">
        <div className="flex min-h-[7.5rem] flex-col justify-between bg-mist px-3 py-3 sm:min-h-[8.5rem] sm:px-5 sm:py-4">
          <div>
            <p className="text-[0.55rem] font-medium uppercase tracking-[0.11em] text-ink/45 sm:text-[0.6rem]">
              Staff seats
            </p>
            <p className="mt-1.5 font-display text-2xl text-pine tabular-nums sm:mt-2 sm:text-3xl">
              {stats.activeAdmins}
            </p>
            <p className="mt-1 line-clamp-2 text-[0.65rem] text-ink/50 sm:text-xs">
              {national ? "Active admins (UK)" : "In your parish scope"}
            </p>
          </div>
          <Link
            href="/admin/access"
            className="mt-2 text-xs font-medium text-pine sm:text-sm"
          >
            Access →
          </Link>
        </div>
        <div className="flex min-h-[7.5rem] flex-col justify-between bg-mist px-3 py-3 sm:min-h-[8.5rem] sm:px-5 sm:py-4">
          <div>
            <p className="text-[0.55rem] font-medium uppercase tracking-[0.11em] text-ink/45 sm:text-[0.6rem]">
              Notices live
            </p>
            <p className="mt-1.5 font-display text-2xl text-pine tabular-nums sm:mt-2 sm:text-3xl">
              {stats.liveNotices}
            </p>
            <p className="mt-1 line-clamp-2 text-[0.65rem] text-ink/50 sm:text-xs">
              {national ? "Home page" : "Student board"}
            </p>
          </div>
          <Link
            href="/admin/announcements"
            className="mt-2 text-xs font-medium text-pine sm:text-sm"
          >
            Notices →
          </Link>
        </div>
        <div className="flex min-h-[7.5rem] flex-col justify-between bg-mist px-3 py-3 sm:min-h-[8.5rem] sm:px-5 sm:py-4">
          <div>
            <p className="text-[0.55rem] font-medium uppercase tracking-[0.11em] text-ink/45 sm:text-[0.6rem]">
              Unsettled desk
            </p>
            <p className="mt-1.5 font-display text-2xl text-pine tabular-nums sm:mt-2 sm:text-3xl">
              {stats.unsettledTickets}
            </p>
            <p className="mt-1 line-clamp-2 text-[0.65rem] text-ink/50 sm:text-xs">
              Open · progress · waiting
            </p>
          </div>
          <Link
            href="/admin/tickets"
            className="mt-2 text-xs font-medium text-pine sm:text-sm"
          >
            Desk →
          </Link>
        </div>
        <div className="flex min-h-[7.5rem] flex-col justify-between bg-pine px-3 py-3 text-mist sm:min-h-[8.5rem] sm:px-5 sm:py-4">
          <div>
            <p className="text-[0.55rem] font-medium uppercase tracking-[0.11em] text-mist/55 sm:text-[0.6rem]">
              Campaigns
            </p>
            <p className="mt-1.5 font-display text-lg leading-snug sm:mt-2 sm:text-2xl sm:leading-none">
              Reach the cohort
            </p>
            <p className="mt-1 line-clamp-2 text-[0.65rem] text-mist/65 sm:text-xs">
              Custom mass mail
            </p>
          </div>
          <Link
            href="/admin/campaigns"
            className="mt-2 text-xs font-medium text-celadon sm:text-sm"
          >
            Open →
          </Link>
        </div>
      </section>

      {/* Statement */}
      <section
        className="relative mt-6 border border-stone bg-mist/40 p-3.5 sm:mt-8 sm:p-6"
        aria-busy={busy}
      >
        <DeskLoaderOverlay
          active={busy}
          label={busyLabel ?? "Building statement…"}
        />
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon sm:text-[0.65rem]">
          Documents
        </p>
        <h2 className="mt-0.5 font-display text-lg tracking-[-0.02em] text-pine sm:mt-1 sm:text-2xl">
          Statement of Report
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-ink/60 sm:mt-2 sm:max-w-2xl sm:text-sm">
          Proof of Application / Enrolment and Attendance
          {paidOnly ? " (tuition paid)" : ""}.{" "}
          <span className="hidden sm:inline">
            {national
              ? "Export the UK network or one parish."
              : "Exports only students in your parish."}
          </span>
        </p>

        <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {national ? (
              <label className="block text-xs text-ink/50">
                Parish scope
                <select
                  value={parishId}
                  onChange={(e) => setParishId(e.target.value)}
                  disabled={busy}
                  className={`${fieldClass} disabled:opacity-50`}
                >
                  <option value="">All UK parishes</option>
                  {parishes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="border border-stone/80 bg-white/50 px-3 py-2.5">
                <p className="text-xs text-ink/45">Parish scope</p>
                <p className="mt-1 truncate text-sm font-medium text-ink">
                  {stats.parishName ?? "Your parish"}
                </p>
              </div>
            )}
            <label className="flex min-h-[2.75rem] items-center gap-2 sm:self-end text-sm text-ink/70">
              <input
                type="checkbox"
                checked={paidOnly}
                disabled={busy}
                onChange={(e) => setPaidOnly(e.target.checked)}
                className="h-4 w-4 accent-pine disabled:opacity-50"
              />
              Tuition paid only
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => loadReport(undefined, "Building preview…")}
              className="inline-flex min-h-[2.5rem] w-full items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine disabled:opacity-50 sm:w-auto sm:self-start"
            >
              {busy && busyLabel?.startsWith("Building preview") ? (
                <DeskLoader label={busyLabel} />
              ) : (
                "Preview list"
              )}
            </button>
            <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
              {(
                [
                  ["PDF", downloadStatementPdf],
                  ["Excel", downloadStatementExcel],
                  ["Word", downloadStatementWord],
                  ["JPG", downloadStatementJpg],
                ] as const
              ).map(([label, fn]) => (
                <button
                  key={label}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    loadReport(fn, `Preparing ${label}…`)
                  }
                  className="inline-flex min-h-[2.5rem] items-center justify-center bg-pine px-2 py-2.5 text-xs font-medium text-mist disabled:opacity-50 sm:min-w-[4.5rem] sm:px-3 sm:text-sm"
                >
                  {busy && busyLabel?.includes(label) ? (
                    <DeskLoader label={busyLabel} tone="mist" />
                  ) : (
                    label
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {preview ? (
          <div className="mt-4 overflow-hidden border border-stone bg-white/80 sm:mt-5">
            <div className="border-b border-stone px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="text-sm font-medium text-ink">
                {preview.rows.length} student
                {preview.rows.length === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink/50">
                {preview.scopeLabel}
              </p>
            </div>
            <ul className="max-h-56 divide-y divide-stone overflow-y-auto overscroll-contain sm:max-h-72">
              {preview.rows.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-ink/50">
                  No students match this statement.
                </li>
              ) : (
                preview.rows.slice(0, 40).map((row) => (
                  <li
                    key={`${row.email}-${row.reference}`}
                    className="px-3 py-2 sm:px-4 sm:py-3"
                  >
                    <p className="truncate text-sm font-medium text-ink">
                      {row.student_name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-ink/50 sm:text-xs">
                      {row.reference || "No ref"} · {row.parish_name || "—"} ·
                      App {row.application_proof} · Att {row.attendance_proof}
                      {row.attendance_percent != null
                        ? ` (${row.attendance_percent}%)`
                        : ""}
                    </p>
                  </li>
                ))
              )}
            </ul>
            {preview.rows.length > 40 ? (
              <p className="border-t border-stone px-3 py-2 text-[0.7rem] text-ink/45 sm:px-4 sm:text-xs">
                First 40 shown — downloads include all.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
