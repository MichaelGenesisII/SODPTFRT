import type { Metadata } from "next";
import { loadFinancePayoutsDesk } from "@/app/finance/payouts/actions";
import { getPayPeriodReport } from "@/app/finance/periods/actions";
import {
  FinancePaymentsDesk,
  type FinancePaymentsPanel,
} from "@/components/finance/finance-payments-desk";
import { listFinanceCategories } from "@/lib/finance/ledger";
import { requireSessionFinance } from "@/lib/finance/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { teacherDisplayName } from "@/lib/teacher/types";

export const metadata: Metadata = {
  title: "Payments | Finance Portal",
};

function parsePanel(
  value: string | undefined,
  hasFocusId: boolean,
): FinancePaymentsPanel {
  if (value === "releases" || value === "payouts") return "releases";
  if (value === "reconcile" || value === "reconciliation") return "reconcile";
  if (value === "send" || value === "custom") return "send";
  if (value === "teachers" || value === "pay") return "teachers";
  if (hasFocusId) return "releases";
  return "teachers";
}

export default async function FinancePaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    panel?: string;
    period?: string;
  }>;
}) {
  const params = await searchParams;
  const focusId = params.id?.trim() || undefined;
  const panel = parsePanel(params.panel, Boolean(focusId));

  let payouts: Awaited<ReturnType<typeof loadFinancePayoutsDesk>> | null =
    null;
  let periodReport: Awaited<ReturnType<typeof getPayPeriodReport>> | null =
    null;
  let loadError: string | null = null;
  let periodError: string | null = null;
  let categories: { id: string; name: string }[] = [];
  let teachers: { id: string; label: string }[] = [];

  try {
    await requireSessionFinance();
    const [payoutsResult, periodResult, categoryRows, teacherRows] =
      await Promise.all([
        loadFinancePayoutsDesk(),
        getPayPeriodReport(params.period).catch((error) => {
          console.error("[finance/payments/period]", error);
          periodError = publicActionMessage(
            error,
            publicUnavailableMessage("Teacher pay"),
          );
          return null;
        }),
        listFinanceCategories().catch((error) => {
          console.error("[finance/payments/categories]", error);
          return [];
        }),
        (async () => {
          const service = createServiceSupabaseClient();
          const { data, error } = await service
            .from("teacher_profiles")
            .select("id, email, full_name, is_active")
            .eq("is_active", true)
            .order("full_name", { ascending: true });
          if (error) {
            console.error("[finance/payments/teachers]", error.message);
            return [];
          }
          return (data ?? []).map((t) => ({
            id: t.id as string,
            label: teacherDisplayName({
              email: t.email as string,
              full_name: (t.full_name as string | null) ?? null,
            }),
          }));
        })(),
      ]);
    payouts = payoutsResult;
    periodReport = periodResult;
    categories = categoryRows.map((c) => ({ id: c.id, name: c.name }));
    teachers = teacherRows;
  } catch (error) {
    console.error("[finance/payments]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Payments"),
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
      ) : payouts ? (
        <FinancePaymentsDesk
          panel={panel}
          periodKey={periodReport?.periodKey ?? params.period ?? ""}
          periodReport={periodReport}
          periodError={periodError}
          payouts={payouts}
          focusId={focusId}
          categories={categories}
          teachers={teachers}
        />
      ) : null}
    </div>
  );
}
