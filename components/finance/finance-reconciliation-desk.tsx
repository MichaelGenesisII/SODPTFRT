"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  refreshPaypalPayout,
  type FinancePayoutDeskPayload,
} from "@/app/finance/payouts/actions";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { deskError, deskSuccess } from "@/lib/ui/desk-alert";
import type { FinancePayout } from "@/lib/finance/payouts";
import {
  isPayoutNeedsReconciliation,
  reconciliationHint,
} from "@/lib/finance/payout-reconciliation";
import { payoutStatusLabel } from "@/lib/finance/payout-status";
import { formatGbp } from "@/lib/finance/types";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FinanceReconciliationDesk({
  initial,
  embedded = false,
}: {
  initial: FinancePayoutDeskPayload;
  /** Hide the standalone hero when nested in the Payments corridor. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState("Working…");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(
    () => initial.payouts.filter(isPayoutNeedsReconciliation),
    [initial.payouts],
  );
  const selected =
    rows.find((p) => p.id === selectedId) ?? rows[0] ?? null;

  function runRefresh(payout: FinancePayout) {
    setBusyLabel("Refreshing PayPal status…");
    startTransition(async () => {
      const form = new FormData();
      form.set("payoutId", payout.id);
      const result = await refreshPaypalPayout(form);
      if (result.ok) await deskSuccess({ text: result.message });
      else await deskError({ text: result.message });
      router.refresh();
    });
  }

  return (
    <div className="relative space-y-6">
      <DeskLoaderOverlay active={pending} label={busyLabel} />
      {!embedded ? (
        <section className="relative overflow-hidden border border-stone/80 bg-white/55 px-5 py-6 sm:px-7">
          <div
            className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-pine/[0.06]"
            aria-hidden
          />
          <div className="relative">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
              Follow up
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.75rem,5vw,2.55rem)] tracking-[-0.02em] text-pine">
              Fix stuck payments
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
              PayPal payouts that are still sending, unclaimed, failed, or
              returned — plus any authorised payment held by a locked period.
            </p>
          </div>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <div className="border border-dashed border-stone bg-white/40 px-5 py-12 text-center">
          <p className="font-display text-lg text-pine">Nothing needs follow-up</p>
          <p className="mt-2 text-sm text-ink/55">
            Every release is either settled or still moving as expected.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="border border-stone/80 bg-white/55">
            <div className="border-b border-stone/70 px-4 py-3">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
                Queue · {rows.length}
              </p>
            </div>
            <ul className="divide-y divide-stone/60">
              {rows.map((payout) => (
                <li key={payout.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(payout.id)}
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
                      selected?.id === payout.id
                        ? "bg-pine/5"
                        : "hover:bg-mist/80"
                    }`}
                  >
                    <span className="font-medium text-ink">
                      {payout.payee_name}
                    </span>
                    <span className="text-sm text-ink/55">
                      {formatGbp(payout.amount_gbp)} ·{" "}
                      {payoutStatusLabel(payout.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {selected ? (
            <section className="border border-stone/80 bg-white/55 px-5 py-5">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
                Detail
              </p>
              <h2 className="mt-2 font-display text-2xl text-pine">
                {selected.payee_name}
              </h2>
              <p className="mt-1 text-sm text-ink/60">
                {formatGbp(selected.amount_gbp)} ·{" "}
                {payoutStatusLabel(selected.status)}
                {selected.provider === "paypal" ? " · PayPal" : " · Outside"}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-ink/70">
                {reconciliationHint(selected)}
              </p>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink/45">Updated</dt>
                  <dd className="mt-0.5 text-ink">
                    {formatWhen(selected.updated_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/45">Period</dt>
                  <dd className="mt-0.5 text-ink">
                    {selected.period_key ?? "—"}
                  </dd>
                </div>
              </dl>
              {selected.provider === "paypal" &&
              selected.provider_batch_id ? (
                <div className="mt-6">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runRefresh(selected)}
                    className="bg-pine px-4 py-2.5 text-sm font-semibold text-mist hover:bg-celadon disabled:opacity-60"
                  >
                    Refresh status
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
