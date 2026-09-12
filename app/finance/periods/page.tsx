import { redirect } from "next/navigation";

export default async function FinancePeriodsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period = params.period?.trim();
  if (period) {
    redirect(
      `/finance/payments?period=${encodeURIComponent(period)}`,
    );
  }
  redirect("/finance/payments");
}
