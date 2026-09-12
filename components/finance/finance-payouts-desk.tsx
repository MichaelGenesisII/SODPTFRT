"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelPayout,
  refreshPaypalPayout,
  releasePayout,
  retryPaypalPayoutSend,
  type FinancePayoutDeskPayload,
} from "@/app/finance/payouts/actions";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { deskError, deskSuccess } from "@/lib/ui/desk-alert";
import {
  FINANCE_PAYOUT_HIGH_VALUE_GBP,
  FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE,
} from "@/lib/finance/payout-constants";
import type { FinancePayout } from "@/lib/finance/payouts";
import { payoutStatusLabel } from "@/lib/finance/payout-status";
import { formatGbp } from "@/lib/finance/types";

const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FinancePayoutsDesk({
  initial,
  focusId,
  embedded = false,
}: {
  initial: FinancePayoutDeskPayload;
  focusId?: string;
  /** Hide the standalone hero when nested in the Payments corridor. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState("Working…");
  const [selectedId, setSelectedId] = useState(
    focusId && initial.payouts.some((p) => p.id === focusId)
      ? focusId
      : initial.payouts[0]?.id ?? null,
  );

  const [cancelTarget, setCancelTarget] = useState<FinancePayout | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<FinancePayout | null>(
    null,
  );
  const [amountConfirm, setAmountConfirm] = useState("");

  const selected = useMemo(
    () => initial.payouts.find((p) => p.id === selectedId) ?? null,
    [initial.payouts, selectedId],
  );

  const needsAmountConfirm = Boolean(
    releaseTarget && releaseTarget.amount_gbp > FINANCE_PAYOUT_HIGH_VALUE_GBP,
  );
  const amountConfirmOk =
    !needsAmountConfirm ||
    amountConfirm.replace(/[£,\s]/g, "") ===
      releaseTarget!.amount_gbp.toFixed(2);

  const open = initial.payouts.filter((p) =>
    [
      "draft",
      "pending_authorisation",
      "authorised",
      "sending",
      "failed",
      "frozen",
      "expired",
    ].includes(p.status),
  );
  const closed = initial.payouts.filter(
    (p) => !open.some((o) => o.id === p.id),
  );

  function runCancel() {
    if (!cancelTarget) return;
    const payout = cancelTarget;
    setCancelTarget(null);
    setBusyLabel("Cancelling…");
    startTransition(async () => {
      const form = new FormData();
      form.set("payoutId", payout.id);
      const result = await cancelPayout(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      router.refresh();
    });
  }

  function runRelease() {
    if (!releaseTarget) return;
    if (needsAmountConfirm && !amountConfirmOk) {
      void deskError({ text: "Type the amount exactly to confirm." });
      return;
    }
    const payout = releaseTarget;
    setReleaseTarget(null);
    setAmountConfirm("");
    setBusyLabel(
      payout.provider === "paypal" ? "Sending via PayPal…" : "Releasing…",
    );
    startTransition(async () => {
      const form = new FormData();
      form.set("payoutId", payout.id);
      const result = await releasePayout(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      router.refresh();
    });
  }

  const releasableStatuses = [
    "draft",
    "pending_authorisation",
    "frozen",
    "expired",
    "authorised",
  ];

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
              In progress
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.75rem,5vw,2.55rem)] tracking-[-0.02em] text-pine">
              Open payments
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
              Payments still sending, failed, or waiting on PayPal. Retry or
              cancel here — new payments send from Teacher pay or Send payment.
            </p>
          </div>
        </section>
      ) : null}

      {!initial.railConfigured ? (
        <div
          className="border border-amber-800/25 bg-amber-50 px-5 py-4 text-sm text-amber-950"
          role="status"
        >
          {FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE}
        </div>
      ) : null}

      {initial.payouts.length === 0 ? (
        <div className="border border-stone/80 bg-white/55 px-5 py-12 text-center">
          <p className="font-display text-lg text-pine">No payments yet</p>
          <p className="mt-2 text-sm text-ink/55">
            Nothing waiting. New payments send from Teacher pay or Send payment.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="border border-stone/80 bg-white/55">
            <div className="border-b border-stone/70 px-4 py-3">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
                Open
              </p>
            </div>
            <ul className="divide-y divide-stone/60">
              {open.length === 0 ? (
                <li className="px-4 py-8 text-sm text-ink/55">
                  Nothing waiting.
                </li>
              ) : (
                open.map((payout) => (
                  <li key={payout.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(payout.id)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
                        selectedId === payout.id
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
                ))
              )}
            </ul>
            {closed.length ? (
              <>
                <div className="border-y border-stone/70 px-4 py-3">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                    Recent closed
                  </p>
                </div>
                <ul className="divide-y divide-stone/60">
                  {closed.slice(0, 12).map((payout) => (
                    <li key={payout.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(payout.id)}
                        className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
                          selectedId === payout.id
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
              </>
            ) : null}
          </section>

          <section className="border border-stone/80 bg-white/55 px-5 py-5">
            {selected ? (
              <div className="space-y-4">
                <div>
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
                  <p className="mt-3 text-sm text-ink/70">
                    {selected.reason ?? "Payment"}
                  </p>
                  <p className="mt-2 text-xs text-ink/45">
                    Created {formatWhen(selected.created_at)}
                    {selected.period_key
                      ? ` · Period ${selected.period_key}`
                      : ""}
                  </p>
                </div>

                {selected.status === "sending" ? (
                  <p className="border border-pine/20 bg-pine/5 px-4 py-3 text-sm text-pine">
                    Sent to PayPal — waiting for confirmation
                    {selected.provider_status
                      ? ` (${selected.provider_status})`
                      : ""}
                    .
                  </p>
                ) : null}

                {selected.status === "failed" ? (
                  <p className="border border-red-800/20 bg-red-50 px-4 py-3 text-sm text-red-900">
                    PayPal could not complete this payment. Retry uses the same
                    request id so it will not double-pay.
                  </p>
                ) : null}

                {selected.status === "authorised" &&
                selected.provider === "paypal" ? (
                  <p className="border border-amber-800/25 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    Ready but not yet sent. Retry send when the payout rail is
                    ready.
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {initial.railConfigured &&
                  releasableStatuses.includes(selected.status) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAmountConfirm("");
                        setReleaseTarget(selected);
                      }}
                      className="bg-pine px-3 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
                    >
                      Complete payment
                    </button>
                  ) : null}

                  {selected.provider === "paypal" &&
                  ["authorised", "failed"].includes(selected.status) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBusyLabel("Sending via PayPal…");
                        const form = new FormData();
                        form.set("payoutId", selected.id);
                        startTransition(async () => {
                          const result = await retryPaypalPayoutSend(form);
                          if (!result.ok) {
                            await deskError({ text: result.message });
                            return;
                          }
                          await deskSuccess({ text: result.message });
                          router.refresh();
                        });
                      }}
                      className="bg-pine px-3 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
                    >
                      Retry PayPal send
                    </button>
                  ) : null}

                  {selected.provider === "paypal" &&
                  ["sending", "failed", "paid", "returned"].includes(
                    selected.status,
                  ) &&
                  selected.provider_batch_id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBusyLabel("Refreshing PayPal status…");
                        const form = new FormData();
                        form.set("payoutId", selected.id);
                        startTransition(async () => {
                          const result = await refreshPaypalPayout(form);
                          if (!result.ok) {
                            await deskError({ text: result.message });
                            return;
                          }
                          await deskSuccess({ text: result.message });
                          router.refresh();
                        });
                      }}
                      className="border border-pine/25 px-3 py-2.5 text-sm font-medium text-pine hover:border-pine"
                    >
                      Refresh status
                    </button>
                  ) : null}

                  {[
                    "draft",
                    "pending_authorisation",
                    "frozen",
                    "expired",
                  ].includes(selected.status) ? (
                    <button
                      type="button"
                      onClick={() => setCancelTarget(selected)}
                      className="border border-red-800/25 px-3 py-2.5 text-sm font-medium text-red-900 hover:border-red-800/50"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink/55">Select a payment.</p>
            )}
          </section>
        </div>
      )}

      <DeskConfirmModal
        open={Boolean(cancelTarget)}
        title="Cancel this payment?"
        body={
          cancelTarget ? (
            <div className="space-y-2">
              <p className="font-medium text-ink">
                {cancelTarget.payee_name} ·{" "}
                {formatGbp(cancelTarget.amount_gbp)}
              </p>
              <p className="text-ink/55">
                You can send a new payment later if needed.
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Cancel payment"
        destructive
        busy={pending}
        onClose={() => setCancelTarget(null)}
        onConfirm={runCancel}
      />

      <DeskConfirmModal
        open={Boolean(releaseTarget)}
        title="Complete this payment?"
        body={
          releaseTarget ? (
            <div className="space-y-3">
              <p className="font-medium text-ink">
                {releaseTarget.payee_name} ·{" "}
                {formatGbp(releaseTarget.amount_gbp)}
              </p>
              <p>{releaseTarget.reason ?? "Payment"}</p>
              <p className="text-ink/55">
                {releaseTarget.provider === "paypal"
                  ? "This will send money via PayPal now."
                  : "This will record the payment as settled outside the portal."}
              </p>
              {needsAmountConfirm ? (
                <label className="block text-sm font-medium text-ink">
                  Type the amount to confirm
                  <input
                    value={amountConfirm}
                    onChange={(event) => setAmountConfirm(event.target.value)}
                    className={fieldClass}
                    placeholder={releaseTarget.amount_gbp.toFixed(2)}
                  />
                </label>
              ) : null}
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Complete payment"
        confirmDisabled={needsAmountConfirm && !amountConfirmOk}
        busy={pending}
        onClose={() => {
          setReleaseTarget(null);
          setAmountConfirm("");
        }}
        onConfirm={runRelease}
      />
    </div>
  );
}
