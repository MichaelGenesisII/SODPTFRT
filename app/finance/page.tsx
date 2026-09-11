import type { Metadata } from "next";
import Link from "next/link";
import { loadFinancePayoutsDesk } from "@/app/finance/payouts/actions";
import { listRatesForFinance } from "@/app/finance/rates/actions";
import { getSessionFinance, financeDisplayName } from "@/lib/finance/auth";
import {
  buildPayPeriodReport,
  currentMonthPeriod,
} from "@/lib/finance/pay";
import { isPayoutNeedsReconciliation } from "@/lib/finance/payout-reconciliation";
import { formatGbp } from "@/lib/finance/types";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Home | Finance Portal",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function rateInForce(
  rates: { amount_gbp: number; effective_from: string; label: string | null }[],
) {
  const day = todayIso();
  return (
    [...rates]
      .filter((rate) => rate.effective_from <= day)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ??
    null
  );
}

export default async function FinanceHomePage() {
  const profile = await getSessionFinance();
  const first =
    profile?.full_name?.trim().split(/\s+/)[0] ||
    (profile ? financeDisplayName(profile).split(/\s+/)[0] : "there");

  const period = currentMonthPeriod();
  let report: Awaited<ReturnType<typeof buildPayPeriodReport>> | null = null;
  let openApprovals = 0;
  let followUps = 0;
  let currentRate: { amount_gbp: number; effective_from: string } | null = null;
  let loadError: string | null = null;

  try {
    const [periodReport, payouts, rates] = await Promise.all([
      buildPayPeriodReport({
        year: period.year,
        month: period.month,
      }),
      loadFinancePayoutsDesk().catch((error) => {
        console.error("[finance/home/payouts]", error);
        return null;
      }),
      listRatesForFinance().catch((error) => {
        console.error("[finance/home/rates]", error);
        return [];
      }),
    ]);
    report = periodReport;
    if (payouts) {
      openApprovals = payouts.payouts.filter((p) =>
        [
          "draft",
          "pending_authorisation",
          "authorised",
          "sending",
          "failed",
          "frozen",
          "expired",
        ].includes(p.status),
      ).length;
      followUps = payouts.payouts.filter(isPayoutNeedsReconciliation).length;
    }
    currentRate = rateInForce(rates);
  } catch (error) {
    console.error("[finance/home]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("This desk"),
    );
  }

  const unpaid =
    report?.teachers.filter((t) => !t.markedPaidAt).length ?? 0;
  const paid =
    report?.teachers.filter((t) => Boolean(t.markedPaidAt)).length ?? 0;

  const needsAttention = [
    unpaid > 0
      ? {
          label: `${unpaid} teacher${unpaid === 1 ? "" : "s"} still unpaid`,
          href: report
            ? `/finance/payments?period=${encodeURIComponent(report.periodKey)}`
            : "/finance/payments",
          detail: "Open Teacher pay",
        }
      : null,
    openApprovals > 0
      ? {
          label: `${openApprovals} payment${openApprovals === 1 ? "" : "s"} waiting for approval`,
          href: "/finance/payments?panel=releases",
          detail: "Open Approvals",
        }
      : null,
    followUps > 0
      ? {
          label: `${followUps} payment${followUps === 1 ? "" : "s"} need follow-up`,
          href: "/finance/payments?panel=reconcile",
          detail: "Open Follow up",
        }
      : null,
    !currentRate
      ? {
          label: "No session rate is set",
          href: "/finance/rates",
          detail: "Set a rate",
        }
      : null,
  ].filter(Boolean) as {
    label: string;
    href: string;
    detail: string;
  }[];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden border border-stone/80 bg-white/55 px-5 pb-6 pt-7 sm:px-7 sm:pb-7 sm:pt-8">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(95,143,122,0.18),_transparent_52%),linear-gradient(125deg,rgba(20,53,44,0.04),transparent_42%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-8 top-0 h-full w-24 bg-gradient-to-l from-pine/[0.06] to-transparent"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-celadon">
            Finance desk
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.85rem,5vw,2.55rem)] leading-[1.05] tracking-[-0.03em] text-pine">
            Hello, {first}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/65">
            Pay teachers, keep the books, and set session rates — all from this
            desk.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/finance/payments"
              className="inline-flex min-h-11 items-center justify-center bg-pine px-4 py-2.5 text-sm font-semibold text-mist hover:bg-celadon"
            >
              Go to Payments
            </Link>
            <Link
              href="/finance/books"
              className="inline-flex min-h-11 items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine"
            >
              Go to Books
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
      ) : null}

      {report ? (
        <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                This month
              </p>
              <h2 className="mt-1 font-display text-[clamp(1.35rem,3.5vw,1.85rem)] tracking-[-0.02em] text-pine">
                {report.label}
              </h2>
              <p className="mt-1.5 text-sm text-ink/55">
                Delivered sessions and teacher pay for the current month.
              </p>
            </div>
            <Link
              href={`/finance/payments?period=${encodeURIComponent(report.periodKey)}`}
              className="inline-flex border border-pine/25 px-3.5 py-2.5 text-sm font-medium text-pine hover:border-pine"
            >
              Review Teacher pay
            </Link>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-stone/70 bg-mist/40 px-4 py-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                Sessions
              </dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-pine">
                {report.sessionCount}
              </dd>
            </div>
            <div className="border border-stone/70 bg-mist/40 px-4 py-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                Gross pay
              </dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-pine">
                {formatGbp(report.grossGbp)}
              </dd>
            </div>
            <div className="border border-stone/70 bg-mist/40 px-4 py-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                Paid
              </dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-pine">
                {paid}
              </dd>
            </div>
            <div className="border border-stone/70 bg-mist/40 px-4 py-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                Still unpaid
              </dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-pine">
                {unpaid}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {needsAttention.length > 0 ? (
        <section className="border border-amber-800/20 bg-amber-50/70 px-5 py-5 sm:px-6">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-amber-900/70">
            Needs attention
          </p>
          <h2 className="mt-1 font-display text-xl text-pine">
            Start with these
          </h2>
          <ul className="mt-4 divide-y divide-amber-900/10 border border-amber-900/10 bg-white/60">
            {needsAttention.map((item) => (
              <li key={item.href + item.label}>
                <Link
                  href={item.href}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-mist/80"
                >
                  <span className="text-sm font-medium text-ink">
                    {item.label}
                  </span>
                  <span className="text-sm font-medium text-pine">
                    {item.detail} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : report ? (
        <section className="border border-dashed border-stone bg-white/40 px-5 py-8 text-center sm:px-6">
          <p className="font-display text-lg text-pine">Nothing waiting</p>
          <p className="mt-2 text-sm text-ink/55">
            Teacher pay looks clear for this month, and no payments need
            follow-up right now.
          </p>
        </section>
      ) : null}
    </div>
  );
}
