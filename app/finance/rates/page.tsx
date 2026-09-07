import type { Metadata } from "next";
import { FinanceRatesManager } from "@/components/finance/finance-rates-manager";
import { listRatesForFinance } from "@/app/finance/rates/actions";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Rates | Finance Portal",
};

export default async function FinanceRatesPage() {
  let rates: Awaited<ReturnType<typeof listRatesForFinance>> = [];
  let loadError: string | null = null;

  try {
    rates = await listRatesForFinance();
  } catch (error) {
    console.error("[finance/rates]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Rates"),
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Rates
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Session pay rates
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/65">
          One default rate per delivered session. The rate effective on the
          class date is applied automatically.
        </p>
      </section>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : (
        <FinanceRatesManager initialRates={rates} />
      )}
    </div>
  );
}
