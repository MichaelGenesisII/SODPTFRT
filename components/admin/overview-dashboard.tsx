"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { getStatementOfReport } from "@/app/admin/overview/actions";
import { useAdminTourOptional } from "@/components/admin/admin-tour-provider";
import { OverviewWalkthroughTrigger } from "@/components/admin/overview-walkthrough";
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
import { SOD_ADMIN_TOUR_TAB_EVENT } from "@/lib/admin/overview-tour-steps";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import {
  ENROLMENT_STATUSES,
  ENROLMENT_STATUS_META,
} from "@/lib/admin/students";
import { formatCohortLabel, type Cohort } from "@/lib/cohorts";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";
import { publicActionMessage } from "@/lib/safe-action-message";
import type { EnrolmentStatus } from "@/lib/student/types";

type OverviewDashboardProps = {
  profile: AdminProfile;
  stats: OverviewStats;
  parishes: Pick<Parish, "id" | "name">[];
  cohorts: Cohort[];
  batches: Batch[];
  firstName: string;
  greeting: string;
};

type PageView = "today" | "pulse" | "learning" | "statement";
type DownloadFormat = "PDF" | "Excel" | "Word" | "JPG";
type PendingConfirm = { kind: "download"; format: DownloadFormat };
type StatementStep = "scope" | "preview" | "export";
type FeeFocus = "paid" | "review" | "unpaid" | null;

const DOWNLOAD_HANDLERS: Record<
  DownloadFormat,
  (bundle: StatementReportBundle) => void
> = {
  PDF: downloadStatementPdf,
  Excel: downloadStatementExcel,
  Word: downloadStatementWord,
  JPG: downloadStatementJpg,
};

const fieldClass =
  "mt-2 w-full min-w-0 border border-stone bg-white/80 px-3.5 py-3 text-sm outline-none transition-colors focus:border-pine";

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

type AttentionItem = {
  id: string;
  label: string;
  value: number;
  hint: string;
  href: string;
  detail: string;
  hot: boolean;
};

export function OverviewDashboard({
  profile,
  stats,
  parishes,
  cohorts,
  batches,
  firstName,
  greeting,
}: OverviewDashboardProps) {
  const { success, error, info } = useToast();
  const tour = useAdminTourOptional();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const national = isNationalAdmin(profile);

  const [pageView, setPageView] = useState<PageView>("today");
  const [expandedAttention, setExpandedAttention] = useState<string | null>(
    null,
  );
  const [funnelFocus, setFunnelFocus] = useState<string | null>(null);
  const [feeFocus, setFeeFocus] = useState<FeeFocus>(null);
  const [learningFocus, setLearningFocus] = useState<
    "classes" | "exams" | "records" | null
  >(null);

  const [parishId, setParishId] = useState(
    national ? "" : profile.parish_id ?? "",
  );
  const [cohortId, setCohortId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [enrolmentStatus, setEnrolmentStatus] = useState<"" | EnrolmentStatus>(
    "",
  );
  const [paidOnly, setPaidOnly] = useState(true);
  const [preview, setPreview] = useState<StatementReportBundle | null>(null);
  const [statementStep, setStatementStep] = useState<StatementStep>("scope");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

  useEffect(() => {
    function onTourTab(event: Event) {
      const tab = (event as CustomEvent<{ tab?: PageView }>).detail?.tab;
      if (!tab) return;
      setPageView(tab);
      if (tab === "statement") setStatementStep("scope");
    }
    window.addEventListener(SOD_ADMIN_TOUR_TAB_EVENT, onTourTab);
    return () =>
      window.removeEventListener(SOD_ADMIN_TOUR_TAB_EVENT, onTourTab);
  }, []);

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

  const attentionItems = useMemo<AttentionItem[]>(
    () => [
      {
        id: "tickets",
        label: "Desk inbox",
        value: stats.openTickets,
        hint: `${stats.unsettledTickets} unsettled`,
        href: "/admin/tickets",
        detail:
          "Open support notes waiting for a reply or settle. Start here when students are blocked.",
        hot: stats.openTickets > 0,
      },
      {
        id: "review",
        label: "Applications",
        value: stats.applicationsInReview,
        hint: "Need a decision",
        href: "/admin/students",
        detail:
          "Enrolment forms marked under review. Accept, request payment, or reject from Students.",
        hot: stats.applicationsInReview > 0,
      },
      {
        id: "proofs",
        label: "Payment proofs",
        value: stats.pendingPayments,
        hint: "Bank uploads",
        href: "/admin/payments",
        detail:
          "Students uploaded transfer proof. Approve to mark the fee paid, or return for a new upload.",
        hot: stats.pendingPayments > 0,
      },
      {
        id: "exams",
        label: "Exam queue",
        value: stats.examsNeedingGrade,
        hint: "Awaiting grade",
        href: "/admin/exams?tab=queue",
        detail:
          "Submitted attempts ready for release or manual marking on the Exams queue.",
        hot: stats.examsNeedingGrade > 0,
      },
    ],
    [stats],
  );

  const hotCount = attentionItems.filter((item) => item.hot).length;
  const activeAttention =
    attentionItems.find((item) => item.id === expandedAttention) ?? null;

  const enrolmentStages = [
    {
      id: "submitted",
      label: "Submitted",
      count: stats.enrolmentByStatus.submitted,
      blurb: "Just arrived — not yet reviewed.",
    },
    {
      id: "under_review",
      label: "Under review",
      count: stats.enrolmentByStatus.under_review,
      blurb: "Staff are reading the application.",
    },
    {
      id: "accepted",
      label: "Accepted",
      count: stats.enrolmentByStatus.accepted,
      blurb: "Place offered; payment may follow.",
    },
    {
      id: "payment_pending",
      label: "Payment pending",
      count: stats.enrolmentByStatus.payment_pending,
      blurb: "Awaiting tuition confirmation.",
    },
    {
      id: "paid",
      label: "Paid / secured",
      count: stats.enrolmentByStatus.paid,
      blurb: "Seat secured on the programme.",
    },
    {
      id: "rejected",
      label: "Rejected",
      count: stats.enrolmentByStatus.rejected,
      blurb: "Not progressing this intake.",
    },
  ];

  const focusedStage =
    enrolmentStages.find((s) => s.id === funnelFocus) ?? null;

  const scopedBatches = useMemo(() => {
    return batches.filter((batch) => {
      if (parishId && batch.parish_id !== parishId) return false;
      if (cohortId && batch.cohort_id && batch.cohort_id !== cohortId)
        return false;
      if (cohortId && !batch.cohort_id) return false;
      return true;
    });
  }, [batches, parishId, cohortId]);

  const activeCohorts = useMemo(
    () => cohorts.filter((c) => c.is_active),
    [cohorts],
  );

  const scopePreviewLabel = useMemo(() => {
    const parts: string[] = [];
    if (!national) {
      parts.push(stats.parishName ?? "Your parish");
    } else if (!parishId) {
      parts.push("All UK parishes");
    } else {
      parts.push(
        parishes.find((p) => p.id === parishId)?.name ?? "Selected parish",
      );
    }
    if (cohortId) {
      const cohort = cohorts.find((c) => c.id === cohortId);
      parts.push(cohort ? formatCohortLabel(cohort) : "Selected cohort");
    }
    if (batchId) {
      const batch = batches.find((b) => b.id === batchId);
      parts.push(batch ? formatBatchLabel(batch) : "Selected batch");
    }
    return parts.join(" · ");
  }, [
    national,
    parishId,
    cohortId,
    batchId,
    parishes,
    cohorts,
    batches,
    stats.parishName,
  ]);

  const scopeFilterSummary = useMemo(() => {
    const parts: string[] = [
      paidOnly ? "tuition paid only" : "all payment states",
    ];
    if (enrolmentStatus) {
      parts.push(ENROLMENT_STATUS_META[enrolmentStatus].label.toLowerCase());
    } else {
      parts.push("all statuses");
    }
    return parts.join(" · ");
  }, [paidOnly, enrolmentStatus]);

  function resetStatementPreview() {
    setPreview(null);
    setStatementStep("scope");
  }

  useEffect(() => {
    if (!pendingConfirm) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setPendingConfirm(null);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingConfirm, busy]);

  useEffect(() => {
    if (!batchId) return;
    if (!scopedBatches.some((b) => b.id === batchId)) {
      setBatchId("");
    }
  }, [batchId, scopedBatches]);

  function loadReport(
    thenDownload?: (bundle: StatementReportBundle) => void,
    label = "Building statement…",
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const bundle = await getStatementOfReport({
          parishId: parishId || undefined,
          cohortId: cohortId || undefined,
          batchId: batchId || undefined,
          enrolmentStatus: enrolmentStatus || undefined,
          paidOnly,
        });
        setPreview(bundle);
        setStatementStep("preview");
        setPendingConfirm(null);
        if (thenDownload) {
          thenDownload(bundle);
          setStatementStep("export");
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

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    loadReport(
      DOWNLOAD_HANDLERS[pendingConfirm.format],
      `Preparing ${pendingConfirm.format}…`,
    );
  }

  function goToView(view: PageView) {
    setPageView(view);
    if (view === "statement" && !preview) setStatementStep("scope");
  }

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute -left-24 top-0 hidden h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(95,143,122,0.14),transparent_68%)] lg:block"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 top-40 hidden h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(20,53,44,0.08),transparent_70%)] lg:block"
        aria-hidden
      />

      {/* Hero */}
      <header
        data-tour="overview-hero"
        className="animate-fade-rise relative pb-6 sm:pb-10"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Overview · {seatLabel} desk
          </p>
          <OverviewWalkthroughTrigger onClick={() => tour?.startTour()} />
        </div>
        <div className="mt-3 flex flex-col gap-6 sm:mt-4 sm:gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-xl">
            <h1 className="font-display text-[clamp(1.85rem,9vw,3.4rem)] leading-[1.02] tracking-[-0.03em] text-pine sm:leading-[0.98]">
              {greeting}
              {firstName ? (
                <>
                  ,<br className="hidden sm:block" /> {firstName}
                </>
              ) : null}
              .
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink/60 sm:mt-4 sm:text-base">
              {stats.deskLabel}. Snapshot as of {stats.generatedAtLabel}.
            </p>
          </div>

          <button
            type="button"
            data-tour="overview-attention"
            onClick={() => {
              goToView("today");
              setExpandedAttention(
                attentionItems.find((item) => item.hot)?.id ?? null,
              );
            }}
            className={`group relative w-full border px-4 py-3.5 text-left transition-all duration-300 sm:max-w-[15rem] sm:px-4 sm:py-4 ${
              hotCount > 0
                ? "border-[#c4a574]/50 bg-[#f7efe8] hover:border-[#c4a574]"
                : "border-pine/20 bg-white/70 hover:border-pine/40"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                  {hotCount > 0 ? "Needs you" : "Desk clear"}
                </p>
                <p className="mt-1 font-display text-3xl leading-none tabular-nums text-pine">
                  {stats.attentionTotal}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium text-pine opacity-80 transition-opacity group-hover:opacity-100">
                Today →
              </span>
            </div>
            <p className="mt-2 text-xs text-ink/55 sm:text-sm">
              {hotCount > 0
                ? `${hotCount} lane${hotCount === 1 ? "" : "s"} open`
                : "Nothing blocking"}
            </p>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav
        data-tour="overview-tabs"
        className="sticky top-0 z-20 -mx-4 mb-6 border-b border-stone bg-mist/95 px-4 backdrop-blur-md sm:-mx-1 sm:mb-8 sm:px-1 lg:top-[4.75rem]"
        aria-label="Overview sections"
      >
        <div className="flex gap-0.5 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              { id: "today" as const, label: "Today", hint: "Act first" },
              { id: "pulse" as const, label: "Pulse", hint: "Cohort & fees" },
              {
                id: "learning" as const,
                label: "Learning",
                hint: "Classes & exams",
              },
              {
                id: "statement" as const,
                label: "Statement",
                hint: "Export report",
              },
            ] as const
          ).map((tab) => {
            const active = pageView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => goToView(tab.id)}
                className={`relative min-h-[3rem] shrink-0 px-3 py-2.5 text-left transition-colors sm:min-h-0 sm:px-4 sm:py-3 ${
                  active ? "text-pine" : "text-ink/45 hover:text-ink/75"
                }`}
              >
                <span className="block text-sm font-medium tracking-wide">
                  {tab.label}
                </span>
                <span className="mt-0.5 hidden text-[0.65rem] text-ink/40 sm:block">
                  {tab.hint}
                </span>
                <span
                  className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity sm:inset-x-3 ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </nav>

      {pageView === "today" ? (
        <section key="today" className="animate-panel-in space-y-6 pb-12 sm:space-y-8 sm:pb-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                Today&apos;s lane
              </p>
              <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
                {hotCount > 0 ? "Act on these first" : "Nothing urgent"}
              </h2>
              <p className="mt-1.5 max-w-lg text-sm text-ink/55">
                Open work on your desk — tap a row for context, then go.
              </p>
            </div>
            {hotCount > 0 ? (
              <p className="text-sm tabular-nums text-ink/50">
                <span className="font-medium text-pine">{hotCount}</span> needing
                attention
              </p>
            ) : null}
          </div>

          <ul
            data-tour="overview-today-lanes"
            className="divide-y divide-stone border border-stone bg-white/80"
          >
            {attentionItems.map((item) => {
              const open = expandedAttention === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedAttention(open ? null : item.id)
                    }
                    aria-expanded={open}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors sm:gap-4 sm:px-4 sm:py-3.5 ${
                      open
                        ? "bg-pine text-mist"
                        : item.hot
                          ? "bg-[#f7efe8]/80 hover:bg-[#f7efe8]"
                          : "hover:bg-mist/70"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-12 shrink-0 items-center justify-center font-display text-xl tabular-nums sm:h-10 sm:w-14 sm:text-2xl ${
                        open
                          ? "text-mist"
                          : item.hot
                            ? "text-pine"
                            : "text-ink/70"
                      }`}
                    >
                      {item.value}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm font-medium ${
                          open ? "text-mist" : "text-ink"
                        }`}
                      >
                        {item.label}
                      </span>
                      <span
                        className={`mt-0.5 block text-xs sm:text-sm ${
                          open ? "text-mist/65" : "text-ink/50"
                        }`}
                      >
                        {item.hint}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-lg leading-none transition-transform duration-200 ${
                        open ? "rotate-45 text-mist" : "text-ink/35"
                      }`}
                      aria-hidden
                    >
                      +
                    </span>
                  </button>
                  {open && activeAttention?.id === item.id ? (
                    <div className="animate-disclose border-t border-pine/20 bg-mist/40 px-3.5 py-3.5 sm:px-4 sm:py-4">
                      <p className="max-w-2xl text-sm leading-relaxed text-ink/70">
                        {activeAttention.detail}
                      </p>
                      <Link
                        href={activeAttention.href}
                        prefetch={false}
                        className="mt-3 inline-flex min-h-[2.4rem] items-center bg-pine px-3.5 py-2 text-sm font-medium text-mist transition-colors hover:bg-celadon"
                      >
                        Open {activeAttention.label.toLowerCase()} →
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Quick jumps
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(
                [
                  ["/admin/students", "Students"],
                  ["/admin/classes", "Classes"],
                  ["/admin/campaigns", "Campaigns"],
                  ["/admin/announcements", "Notices"],
                  ["/admin/access", "Access"],
                ] as const
              ).map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  className="inline-flex min-h-[2.25rem] items-center border border-stone bg-white/80 px-3 py-1.5 text-sm text-pine transition-colors hover:border-pine hover:bg-pine hover:text-mist"
                >
                  {label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => goToView("statement")}
                className="inline-flex min-h-[2.25rem] items-center border border-pine/30 bg-white/80 px-3 py-1.5 text-sm text-pine transition-colors hover:border-pine hover:bg-pine hover:text-mist"
              >
                Statement
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {pageView === "pulse" ? (
        <section
          key="pulse"
          data-tour="overview-pulse"
          className="animate-panel-in space-y-8 pb-12 sm:space-y-12 sm:pb-16"
        >
          <div className="flex flex-col gap-4 sm:gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                Cohort pulse
              </p>
              <h2 className="mt-2 font-display text-[clamp(1.45rem,5vw,2.2rem)] tracking-[-0.02em] text-pine">
                {stats.students} student{stats.students === 1 ? "" : "s"}
              </h2>
              <p className="mt-2 text-sm text-ink/60">
                {stats.studentsActive} active · {stats.studentsPaused} paused ·{" "}
                {paidRate}% tuition paid
              </p>
            </div>
            <Link
              href="/admin/students"
              prefetch={false}
              className="inline-flex min-h-[2.75rem] w-full items-center justify-center border border-pine px-5 py-2.5 text-sm font-medium text-pine transition-colors hover:bg-pine hover:text-mist sm:w-auto"
            >
              Open Students →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                label: "New · 7 days",
                value: stats.newEnrolments7d,
              },
              {
                label: "New · 30 days",
                value: stats.newEnrolments30d,
              },
              {
                label: "Open batches",
                value: stats.openBatches,
              },
            ].map((tile) => (
              <div
                key={tile.label}
                className="border border-stone bg-white/70 px-4 py-5 sm:px-5 sm:py-6"
              >
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                  {tile.label}
                </p>
                <p className="mt-3 font-display text-3xl tabular-nums text-pine sm:text-4xl">
                  {tile.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-8">
            <div className="border border-stone bg-white/60 p-4 sm:p-7">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Enrolment funnel
              </p>
              <p className="mt-2 text-sm text-ink/55">
                Tap a stage to inspect it. Bars scale to the full cohort.
              </p>
              <ul className="mt-5 space-y-1.5 sm:mt-6 sm:space-y-2">
                {enrolmentStages.map((stage) => {
                  const width = Math.max(
                    stage.count > 0 ? 6 : 0,
                    pct(stage.count, stats.students),
                  );
                  const selected = funnelFocus === stage.id;
                  return (
                    <li key={stage.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setFunnelFocus(selected ? null : stage.id)
                        }
                        className={`group w-full px-2.5 py-2.5 text-left transition-colors sm:px-3 sm:py-3 ${
                          selected
                            ? "bg-pine text-mist"
                            : "hover:bg-mist/80"
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span
                            className={
                              selected ? "text-mist" : "text-ink/75"
                            }
                          >
                            {stage.label}
                          </span>
                          <span
                            className={`tabular-nums font-medium ${
                              selected ? "text-mist" : "text-ink"
                            }`}
                          >
                            {stage.count}
                          </span>
                        </div>
                        <div
                          className={`mt-2 h-1.5 overflow-hidden ${
                            selected ? "bg-mist/25" : "bg-stone/70"
                          }`}
                        >
                          <div
                            className={`h-full transition-[width] duration-500 ${
                              selected ? "bg-celadon" : "bg-pine/70"
                            }`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col justify-between border border-stone bg-mist/40 p-4 sm:p-7">
              {focusedStage ? (
                <div className="animate-disclose">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                    Selected stage
                  </p>
                  <h3 className="mt-3 font-display text-2xl text-pine sm:text-3xl">
                    {focusedStage.label}
                  </h3>
                  <p className="mt-4 font-display text-4xl tabular-nums text-pine sm:text-5xl">
                    {focusedStage.count}
                  </p>
                  <p className="mt-2 text-sm text-ink/55">
                    {pct(focusedStage.count, stats.students)}% of the cohort ·{" "}
                    {focusedStage.blurb}
                  </p>
                  <Link
                    href="/admin/students"
                    prefetch={false}
                    className="mt-6 inline-flex min-h-[2.5rem] items-center text-sm font-medium text-pine underline-offset-4 hover:underline sm:mt-8"
                  >
                    Review on Students →
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                    Hint
                  </p>
                  <h3 className="mt-3 font-display text-xl text-pine sm:text-2xl">
                    Choose a funnel stage
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink/60">
                    Each bar is live enrolment status from the Students desk.
                    Selection stays until you clear it.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Fees
                </p>
                <h3 className="mt-2 font-display text-xl text-pine sm:text-2xl">
                  Payment pulse
                </h3>
              </div>
              <Link
                href="/admin/payments"
                prefetch={false}
                className="text-sm font-medium text-pine underline-offset-4 hover:underline"
              >
                Payments desk →
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    id: "paid" as const,
                    label: "Paid seats",
                    value: stats.paidSeats,
                    note: "Tuition confirmed",
                  },
                  {
                    id: "review" as const,
                    label: "In review",
                    value: stats.paymentPendingSeats,
                    note: "Payment flag",
                  },
                  {
                    id: "unpaid" as const,
                    label: "Unpaid",
                    value: stats.unpaidSeats,
                    note: "No payment yet",
                  },
                ] as const
              ).map((tile) => {
                const selected = feeFocus === tile.id;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() =>
                      setFeeFocus(selected ? null : tile.id)
                    }
                    className={`border px-4 py-5 text-left transition-all duration-300 sm:px-5 sm:py-6 ${
                      selected
                        ? "border-pine bg-pine text-mist"
                        : "border-stone bg-white/70 hover:border-pine/40"
                    }`}
                  >
                    <p
                      className={`text-[0.65rem] font-medium uppercase tracking-[0.12em] ${
                        selected ? "text-mist/60" : "text-ink/40"
                      }`}
                    >
                      {tile.label}
                    </p>
                    <p
                      className={`mt-3 font-display text-3xl tabular-nums sm:text-4xl ${
                        selected ? "text-mist" : "text-pine"
                      }`}
                    >
                      {tile.value}
                    </p>
                    <p
                      className={`mt-2 text-sm ${
                        selected ? "text-mist/70" : "text-ink/50"
                      }`}
                    >
                      {tile.note}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 border border-stone bg-white/70 px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    Bank proofs waiting
                  </p>
                  <p className="mt-1 text-sm text-ink/55">
                    Upload queue on Payments — separate from enrolment flags.
                  </p>
                </div>
                <p className="font-display text-3xl tabular-nums text-pine">
                  {stats.pendingPayments}
                </p>
              </div>
              <div className="mt-4 h-2 overflow-hidden bg-stone/60">
                <div
                  className="h-full bg-pine transition-[width] duration-700"
                  style={{
                    width: `${Math.min(100, Math.max(stats.pendingPayments > 0 ? 8 : 0, stats.pendingPayments * 10))}%`,
                  }}
                />
              </div>
              {feeFocus ? (
                <p className="mt-3 text-sm text-ink/60">
                  Focusing{" "}
                  <span className="font-medium text-ink">
                    {feeFocus === "paid"
                      ? "paid seats"
                      : feeFocus === "review"
                        ? "payment-in-review seats"
                        : "unpaid seats"}
                  </span>
                  . Open Payments or Students to work the list.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {pageView === "learning" ? (
        <section
          key="learning"
          data-tour="overview-learning"
          className="animate-panel-in space-y-6 pb-12 sm:space-y-8 sm:pb-16"
        >
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Learning path
            </p>
            <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
              Classes, exams & records
            </h2>
            <p className="mt-1.5 max-w-lg text-sm text-ink/55">
              Live counts for each desk — open a row to work it.
            </p>
          </div>

          {stats.classesLive > 0 ? (
            <Link
              href="/admin/classes"
              prefetch={false}
              className="flex items-center justify-between gap-3 border border-pine bg-pine px-3.5 py-3 text-mist transition-colors hover:bg-pine/90 sm:px-4"
            >
              <p className="text-sm font-medium">
                <span className="text-celadon">Live · </span>
                {stats.classesLive} class
                {stats.classesLive === 1 ? "" : "es"} in session
              </p>
              <span className="shrink-0 text-sm">Open →</span>
            </Link>
          ) : null}

          <ul className="divide-y divide-stone border border-stone bg-white/80">
            {(
              [
                {
                  id: "classes" as const,
                  title: "Classes",
                  href: "/admin/classes",
                  primary: stats.classesUpcoming,
                  primaryLabel: "upcoming this week",
                  secondary: [
                    { label: "Live now", value: stats.classesLive },
                  ],
                },
                {
                  id: "exams" as const,
                  title: "Exams",
                  href: "/admin/exams",
                  primary: stats.publishedExams,
                  primaryLabel: "published",
                  secondary: [
                    { label: "Drafts", value: stats.draftExams },
                    {
                      label: "In progress",
                      value: stats.attemptsInProgress,
                    },
                    {
                      label: "To grade",
                      value: stats.examsNeedingGrade,
                    },
                  ],
                },
                {
                  id: "records" as const,
                  title: "Records",
                  href: "/admin/records",
                  primary: stats.scorecards,
                  primaryLabel: "scorecards",
                  secondary: [
                    {
                      label: "Attendance coverage",
                      value: `${attendanceCoverage}%`,
                    },
                    {
                      label: "With marks",
                      value: stats.recordsWithAttendance,
                    },
                  ],
                },
              ] as const
            ).map((panel) => {
              const open = learningFocus === panel.id;
              return (
                <li key={panel.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setLearningFocus(open ? null : panel.id)
                    }
                    aria-expanded={open}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors sm:gap-4 sm:px-4 sm:py-3.5 ${
                      open
                        ? "bg-pine text-mist"
                        : "hover:bg-mist/70"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm font-medium ${
                          open ? "text-mist" : "text-ink"
                        }`}
                      >
                        {panel.title}
                      </span>
                      <span
                        className={`mt-0.5 block text-xs sm:text-sm ${
                          open ? "text-mist/65" : "text-ink/50"
                        }`}
                      >
                        <span className="tabular-nums font-medium">
                          {panel.primary}
                        </span>{" "}
                        {panel.primaryLabel}
                      </span>
                    </span>
                    <span
                      className={`hidden text-xs sm:inline ${
                        open ? "text-mist/55" : "text-ink/40"
                      }`}
                    >
                      {open ? "Hide" : "Details"}
                    </span>
                    <span
                      className={`shrink-0 text-lg leading-none transition-transform duration-200 ${
                        open ? "rotate-45 text-mist" : "text-ink/35"
                      }`}
                      aria-hidden
                    >
                      +
                    </span>
                  </button>
                  {open ? (
                    <div className="animate-disclose border-t border-pine/20 bg-mist/40 px-3.5 py-3.5 sm:px-4 sm:py-4">
                      <dl className="grid gap-2 sm:grid-cols-2 sm:gap-x-8">
                        {panel.secondary.map((row) => (
                          <div
                            key={row.label}
                            className="flex items-baseline justify-between gap-3 text-sm"
                          >
                            <dt className="text-ink/55">{row.label}</dt>
                            <dd className="tabular-nums font-medium text-ink">
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <Link
                        href={panel.href}
                        prefetch={false}
                        className="mt-3 inline-flex min-h-[2.4rem] items-center bg-pine px-3.5 py-2 text-sm font-medium text-mist transition-colors hover:bg-celadon"
                      >
                        Open {panel.title} →
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Also on the desk
            </p>
            <ul className="mt-2.5 divide-y divide-stone border border-stone bg-white/70">
              {[
                {
                  label: "Staff seats",
                  value: stats.activeAdmins,
                  href: "/admin/access",
                  hint: national ? "Active admins" : "In your scope",
                },
                {
                  label: "Notices live",
                  value: stats.liveNotices,
                  href: "/admin/announcements",
                  hint: national ? "Home page" : "Student board",
                },
                {
                  label: "Unsettled desk",
                  value: stats.unsettledTickets,
                  href: "/admin/tickets",
                  hint: "Open · progress · waiting",
                },
                {
                  label: "Campaigns",
                  value: "Mail",
                  href: "/admin/campaigns",
                  hint: "Reach the cohort",
                },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-mist/70 sm:px-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink/45">
                        {item.hint}
                      </span>
                    </span>
                    <span className="font-display text-lg tabular-nums text-pine">
                      {item.value}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {pageView === "statement" ? (
        <section
          key="statement"
          data-tour="overview-statement"
          className="animate-panel-in relative space-y-8 pb-12 sm:space-y-10 sm:pb-16"
          aria-busy={busy}
        >
          <DeskLoaderOverlay
            active={busy && !pendingConfirm}
            label={busyLabel ?? "Building statement…"}
          />

          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Documents
            </p>
            <h2 className="mt-2 font-display text-[clamp(1.45rem,5vw,2.2rem)] tracking-[-0.02em] text-pine">
              Statement of Report
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/60">
              Official proof of application, enrolment, and attendance. Set
              scope, preview, then download.
            </p>
          </div>

          <ol className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
            {(
              [
                { id: "scope" as const, label: "1 · Scope", short: "Scope" },
                {
                  id: "preview" as const,
                  label: "2 · Preview",
                  short: "Preview",
                },
                {
                  id: "export" as const,
                  label: "3 · Download",
                  short: "Download",
                },
              ] as const
            ).map((step) => {
              const active = statementStep === step.id;
              const done =
                (step.id === "scope" &&
                  (statementStep === "preview" ||
                    statementStep === "export")) ||
                (step.id === "preview" && statementStep === "export");
              return (
                <li key={step.id} className="min-w-0 sm:min-w-0">
                  <button
                    type="button"
                    disabled={step.id !== "scope" && !preview}
                    onClick={() => {
                      if (step.id === "scope") setStatementStep("scope");
                      if (step.id === "preview" && preview)
                        setStatementStep("preview");
                      if (step.id === "export" && preview)
                        setStatementStep("export");
                    }}
                    className={`w-full border px-2 py-2.5 text-center text-xs font-medium transition-colors disabled:opacity-40 sm:w-auto sm:px-4 sm:text-left sm:text-sm ${
                      active
                        ? "border-pine bg-pine text-mist"
                        : done
                          ? "border-celadon/40 bg-celadon/10 text-pine"
                          : "border-stone text-ink/55 hover:border-pine/30"
                    }`}
                  >
                    <span className="sm:hidden">{step.short}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          {statementStep === "scope" ? (
            <div className="animate-disclose space-y-6 border border-stone bg-white/70 p-4 sm:p-8">
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Who appears
                </p>
                <p className="mt-2 text-sm text-ink/60">
                  Narrow by programme placement first, then payment and status.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm text-ink/60">
                  Cohort
                  <select
                    value={cohortId}
                    onChange={(e) => {
                      setCohortId(e.target.value);
                      setBatchId("");
                      resetStatementPreview();
                    }}
                    disabled={busy}
                    className={`${fieldClass} disabled:opacity-50`}
                  >
                    <option value="">All cohorts</option>
                    {activeCohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatCohortLabel(c)}
                      </option>
                    ))}
                    {cohorts
                      .filter((c) => !c.is_active)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {formatCohortLabel(c)} (inactive)
                        </option>
                      ))}
                  </select>
                </label>

                <label className="block text-sm text-ink/60">
                  Batch
                  <select
                    value={batchId}
                    onChange={(e) => {
                      setBatchId(e.target.value);
                      resetStatementPreview();
                    }}
                    disabled={busy}
                    className={`${fieldClass} disabled:opacity-50`}
                  >
                    <option value="">
                      {cohortId || parishId
                        ? "All batches in scope"
                        : "All batches"}
                    </option>
                    {scopedBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {formatBatchLabel(b)}
                      </option>
                    ))}
                  </select>
                </label>

                {national ? (
                  <label className="block text-sm text-ink/60">
                    Parish
                    <select
                      value={parishId}
                      onChange={(e) => {
                        setParishId(e.target.value);
                        resetStatementPreview();
                      }}
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
                  <div className="border border-stone bg-mist/40 px-4 py-3.5">
                    <p className="text-xs text-ink/45">Parish</p>
                    <p className="mt-1.5 text-base font-medium text-ink sm:text-lg">
                      {stats.parishName ?? "Your parish"}
                    </p>
                  </div>
                )}

                <label className="block text-sm text-ink/60">
                  Enrolment status
                  <select
                    value={enrolmentStatus}
                    onChange={(e) => {
                      setEnrolmentStatus(
                        (e.target.value || "") as "" | EnrolmentStatus,
                      );
                      resetStatementPreview();
                    }}
                    disabled={busy}
                    className={`${fieldClass} disabled:opacity-50`}
                  >
                    <option value="">All statuses</option>
                    {ENROLMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ENROLMENT_STATUS_META[status].label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-start gap-3 border border-stone bg-mist/30 px-4 py-3.5 text-sm text-ink/70 sm:items-center">
                <input
                  type="checkbox"
                  checked={paidOnly}
                  disabled={busy}
                  onChange={(e) => {
                    setPaidOnly(e.target.checked);
                    resetStatementPreview();
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-pine disabled:opacity-50 sm:mt-0"
                />
                <span>
                  <span className="font-medium text-ink">
                    Tuition paid seats only
                  </span>
                  <span className="mt-0.5 block text-ink/55">
                    Uncheck to include unpaid and in-review seats in this
                    statement.
                  </span>
                </span>
              </label>

              <p className="text-sm leading-relaxed text-ink/55">
                Preparing for{" "}
                <span className="font-medium text-ink">{scopePreviewLabel}</span>
                {" · "}
                {scopeFilterSummary}.
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() => loadReport(undefined, "Building preview…")}
                className="inline-flex min-h-[2.75rem] w-full items-center justify-center bg-pine px-6 py-3 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-50 sm:w-auto"
              >
                {busy && busyLabel?.startsWith("Building preview") ? (
                  <DeskLoader label={busyLabel} tone="mist" />
                ) : (
                  "Build preview"
                )}
              </button>
            </div>
          ) : null}

          {statementStep === "preview" && preview ? (
            <div className="animate-disclose overflow-hidden border border-stone bg-white">
              <div className="bg-pine px-4 py-5 text-mist sm:px-8 sm:py-8">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                  School of Disciples
                </p>
                <p className="mt-2 font-display text-2xl tracking-[-0.02em] sm:text-3xl">
                  {preview.title}
                </p>
                <p className="mt-2 text-sm text-mist/75 sm:text-base">
                  {preview.subtitle}
                </p>
              </div>
              <div className="space-y-6 px-4 py-5 sm:px-8 sm:py-8">
                <p className="max-w-2xl text-sm leading-relaxed text-ink/70">
                  {preview.purpose}
                </p>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-[0.6rem] uppercase tracking-[0.12em] text-ink/40">
                      Scope
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-snug text-ink sm:text-base">
                      {preview.scopeLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.6rem] uppercase tracking-[0.12em] text-ink/40">
                      Filter
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-snug text-ink sm:text-base">
                      {preview.filterLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.6rem] uppercase tracking-[0.12em] text-ink/40">
                      Issued
                    </dt>
                    <dd className="mt-1 text-ink/80">{preview.issuedAtLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.6rem] uppercase tracking-[0.12em] text-ink/40">
                      Issued by
                    </dt>
                    <dd className="mt-1 text-ink/80">{preview.issuedBy}</dd>
                  </div>
                </dl>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                  {[
                    ["Students", preview.summary.total],
                    ["Refs on file", preview.summary.applicationOnFile],
                    ["Attendance", preview.summary.attendanceOnFile],
                    [
                      "Avg attendance",
                      preview.summary.averageAttendancePercent != null
                        ? `${preview.summary.averageAttendancePercent}%`
                        : "—",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="border border-stone bg-mist/40 px-3 py-3"
                    >
                      <p className="text-[0.55rem] uppercase tracking-[0.1em] text-ink/45">
                        {label}
                      </p>
                      <p className="mt-2 font-display text-xl tabular-nums text-pine sm:text-2xl">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => setStatementStep("export")}
                    className="inline-flex min-h-[2.75rem] items-center justify-center bg-pine px-5 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
                  >
                    Continue to download →
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatementStep("scope")}
                    className="inline-flex min-h-[2.75rem] items-center justify-center border border-stone px-5 py-2.5 text-sm text-ink/65 hover:border-pine"
                  >
                    Adjust scope
                  </button>
                </div>
              </div>
              <div className="max-h-72 overflow-auto border-t border-stone sm:max-h-80">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-stone bg-mist/90 text-[0.65rem] uppercase tracking-[0.1em] text-ink/45 backdrop-blur">
                    <tr>
                      <th className="px-3 py-3 font-medium sm:px-4">Student</th>
                      <th className="hidden px-4 py-3 font-medium sm:table-cell">
                        Parish
                      </th>
                      <th className="px-3 py-3 font-medium sm:px-4">Payment</th>
                      <th className="px-3 py-3 font-medium sm:px-4">
                        Attendance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone">
                    {preview.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-12 text-center text-ink/50"
                        >
                          No students match this statement.
                        </td>
                      </tr>
                    ) : (
                      preview.rows.slice(0, 40).map((row) => (
                        <tr key={`${row.email}-${row.reference}`}>
                          <td className="px-3 py-3 sm:px-4">
                            <p className="font-medium text-ink">
                              {row.student_name}
                            </p>
                            <p className="mt-0.5 text-xs text-ink/45">
                              {row.reference || "No ref"}
                              {row.batch_label ? (
                                <span className="sm:hidden">
                                  {" · "}
                                  {row.batch_label}
                                </span>
                              ) : null}
                            </p>
                          </td>
                          <td className="hidden px-4 py-3 text-ink/70 sm:table-cell">
                            {row.parish_name || "—"}
                          </td>
                          <td className="px-3 py-3 text-ink/70 sm:px-4">
                            {row.payment_status}
                          </td>
                          <td className="px-3 py-3 text-ink/70 sm:px-4">
                            {row.attendance_percent != null
                              ? `${row.attendance_proof} (${row.attendance_percent}%)`
                              : row.attendance_proof}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 40 ? (
                <p className="border-t border-stone px-4 py-2.5 text-xs text-ink/45">
                  First 40 shown — downloads include all {preview.rows.length}.
                </p>
              ) : null}
            </div>
          ) : null}

          {statementStep === "export" && preview ? (
            <div className="animate-disclose space-y-6 border border-stone bg-white/70 p-4 sm:p-8">
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Ready to export
                </p>
                <h3 className="mt-2 font-display text-xl leading-snug text-pine sm:text-2xl">
                  {preview.summary.total} student
                  {preview.summary.total === 1 ? "" : "s"} ·{" "}
                  {preview.scopeLabel}
                </h3>
                <p className="mt-2 text-sm text-ink/55">
                  Choose a format. Each download asks for confirmation.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                {(["PDF", "Excel", "Word", "JPG"] as const).map((label) => (
                  <button
                    key={label}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPendingConfirm({ kind: "download", format: label })
                    }
                    className="inline-flex min-h-[3.25rem] items-center justify-center border border-pine bg-pine px-3 py-3 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-50"
                  >
                    {busy && busyLabel?.includes(label) ? (
                      <DeskLoader label={busyLabel} tone="mist" />
                    ) : (
                      label
                    )}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStatementStep("preview")}
                className="text-sm font-medium text-pine underline-offset-4 hover:underline"
              >
                ← Back to preview
              </button>
            </div>
          ) : null}

          {statementStep !== "scope" && !preview ? (
            <p className="text-sm text-ink/50">
              Build a preview from Scope first.
            </p>
          ) : null}
        </section>
      ) : null}

      {pendingConfirm ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="statement-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Preparing…"}
            />
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Download statement
            </p>
            <h3
              id="statement-confirm-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              Download {pendingConfirm.format}?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Builds the Statement of Report for{" "}
              <span className="font-medium text-ink">{scopePreviewLabel}</span>
              {" · "}
              {scopeFilterSummary}. Uses live desk data and may take a moment
              for large cohorts.
            </p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPendingConfirm(null)}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmPendingAction}
                className="inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
              >
                {busy ? (
                  <DeskLoader label="Preparing…" tone="mist" />
                ) : (
                  `Download ${pendingConfirm.format}`
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
