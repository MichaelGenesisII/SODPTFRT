import type { Metadata } from "next";
import { FinancePeriodsWorkspace } from "@/components/finance/finance-periods-workspace";
import { getPayPeriodReport } from "@/app/finance/periods/actions";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Periods | Finance Portal",
};

export default async function FinancePeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  let report: Awaited<ReturnType<typeof getPayPeriodReport>> | null = null;
  let loadError: string | null = null;

  try {
    report = await getPayPeriodReport(params.period);
  } catch (error) {
    console.error("[finance/periods]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Pay periods"),
    );
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : report ? (
        <FinancePeriodsWorkspace report={report} />
      ) : null}
    </div>
  );
}
