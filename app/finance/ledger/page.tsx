import { redirect } from "next/navigation";

export default async function FinanceLedgerRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams;
  redirect("/finance/books?view=entries");
}
