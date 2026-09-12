import type { Metadata } from "next";
import {
  FinanceBooksDesk,
  type FinanceBooksPanel,
} from "@/components/finance/finance-books-desk";
import { loadFinancePeriodLocks } from "@/app/finance/books/period-actions";
import { listCategoriesForFinance } from "@/app/finance/categories/actions";
import { loadFinanceLedger } from "@/app/finance/ledger/actions";
import { parseDateSelection } from "@/lib/finance/date-selection";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Books | Finance Portal",
};

function parsePanel(value: string | undefined): FinanceBooksPanel {
  if (value === "categories" || value === "browse") {
    return value;
  }
  if (value === "entries" || value === "compose") return "browse";
  return "browse";
}

export default async function FinanceBooksPage({
  searchParams,
}: {
  searchParams: Promise<{
    panel?: string;
    view?: string;
    period?: string;
    dateMode?: string;
    days?: string;
    from?: string;
    to?: string;
    months?: string;
    years?: string;
  }>;
}) {
  const params = await searchParams;

  // Teacher pay moved to Payments.
  if (params.panel === "pay" || params.view === "pay") {
    const period = params.period?.trim();
    redirect(
      period
        ? `/finance/payments?period=${encodeURIComponent(period)}`
        : "/finance/payments",
    );
  }

  const panel = parsePanel(params.panel ?? params.view);
  const dateSelection = parseDateSelection({
    dateMode: params.dateMode,
    days: params.days,
    from: params.from,
    to: params.to,
    months: params.months,
    years: params.years,
  });

  let ledger: Awaited<ReturnType<typeof loadFinanceLedger>> | null = null;
  let categories: Awaited<ReturnType<typeof listCategoriesForFinance>> = [];
  let periodLocks: Awaited<ReturnType<typeof loadFinancePeriodLocks>> = [];
  let loadError: string | null = null;

  try {
    const [ledgerResult, categoryResult, locksResult] = await Promise.all([
      loadFinanceLedger(),
      listCategoriesForFinance({ includeRetired: true }),
      loadFinancePeriodLocks().catch((error) => {
        console.error("[finance/books/locks]", error);
        return [];
      }),
    ]);
    ledger = ledgerResult;
    categories = categoryResult;
    periodLocks = locksResult;
  } catch (error) {
    console.error("[finance/books]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("The books"),
    );
  }

  const activeCategories = categories.filter((category) => !category.retired_at);

  return (
    <div className="space-y-6">
      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : ledger ? (
        <FinanceBooksDesk
          panel={panel}
          ledger={ledger}
          categories={categories}
          activeCategories={activeCategories}
          initialDateSelection={dateSelection}
          periodLocks={periodLocks}
        />
      ) : null}
    </div>
  );
}
