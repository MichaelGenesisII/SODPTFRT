import type { Metadata } from "next";
import Link from "next/link";
import {
  currentMonthPeriod,
  buildPayPeriodReport,
} from "@/lib/finance/pay";
import { formatGbp } from "@/lib/finance/types";
import { getSessionFinance, financeDisplayName } from "@/lib/finance/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Home | Finance Portal",
};

export default async function FinanceHomePage() {
  const profile = await getSessionFinance();
  const first =
    profile?.full_name?.trim().split(/\s+/)[0] ||
    (profile ? financeDisplayName(profile).split(/\s+/)[0] : "there");

  const period = currentMonthPeriod();
  let report: Awaited<ReturnType<typeof buildPayPeriodReport>> | null = null;
  let loadError: string | null = null;

  try {
    report = await buildPayPeriodReport({
      year: period.year,
      month: period.month,
    });
  } catch (error) {
    console.error("[finance/home]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Pay periods"),
    );
  }

  const unpaid =
    report?.teachers.filter((t) => !t.markedPaidAt).length ?? 0;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden border border-stone/80 bg-white/50 px-5 pb-7 pt-8 sm:px-7 sm:pb-8 sm:pt-9">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.18),_transparent_55%)]"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Finance portal
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.85rem,5vw,2.6rem)] tracking-[-0.02em] text-pine">
            Hello, {first}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65 sm:text-[0.95rem]">
            Session pay for teachers — based on confirmed teaching, not Zoom
            hosts.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/finance/periods"
              className="inline-flex min-h-11 items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
            >
              Open periods
            </Link>
            <Link
              href="/finance/rates"
              className="inline-flex min-h-11 items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine"
            >
              Manage rates
            </Link>
          </div>
        </div>
      </section>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : report ? (
        <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            This month
          </p>
          <h2 className="mt-1 font-display text-xl text-pine">{report.label}</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                Sessions
              </dt>
              <dd className="mt-1 font-display text-2xl text-pine tabular-nums">
                {report.sessionCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                Gross
              </dt>
              <dd className="mt-1 font-display text-2xl text-pine tabular-nums">
                {formatGbp(report.grossGbp)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                Teachers unpaid
              </dt>
              <dd className="mt-1 font-display text-2xl text-pine tabular-nums">
                {unpaid}
              </dd>
            </div>
          </dl>
          <Link
            href={`/finance/periods?period=${encodeURIComponent(report.periodKey)}`}
            className="mt-5 inline-flex text-sm font-medium text-pine underline decoration-pine/25 underline-offset-2"
          >
            Review & export →
          </Link>
        </section>
      ) : null}
    </div>
  );
}
