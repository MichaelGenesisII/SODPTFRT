import type { Metadata } from "next";
import { declinePayoutFromToken } from "@/app/finance/payouts/actions";

export const metadata: Metadata = {
  title: "Decline payment",
  robots: { index: false, follow: false },
};

export default async function PayoutDeclinePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const token = params.t?.trim() ?? "";
  const result = token
    ? await declinePayoutFromToken(token)
    : { ok: false, message: "This link is incomplete." };

  return (
    <main className="min-h-screen bg-[#e8efe9] px-4 py-16 text-[#1a1a1a]">
      <div className="mx-auto max-w-md border border-[#d5ddd6] bg-white px-6 py-8">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-[#5f8f7a]">
          Authorisation
        </p>
        <h1 className="mt-3 font-serif text-2xl text-[#14352c]">
          {result.ok ? "Payment declined" : "Link unavailable"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#5a655e]">
          {result.message}
        </p>
      </div>
    </main>
  );
}
