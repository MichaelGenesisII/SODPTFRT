"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelPayout,
  refreshPaypalPayout,
  releasePayout,
  requestPayoutAuthorisation,
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

  const [requestTarget, setRequestTarget] = useState<FinancePayout | null>(
    null,
  );
  const [cancelTarget, setCancelTarget] = useState<FinancePayout | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<FinancePayout | null>(
    null,
  );
  const [emailCode, setEmailCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [amountConfirm, setAmountConfirm] = useState("");

  const selected = useMemo(
    () => initial.payouts.find((p) => p.id === selectedId) ?? null,
    [initial.payouts, selectedId],
  );
  const challenge = selected
    ? initial.challengesByPayoutId[selected.id]
    : undefined;

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

  function runRequest() {
    if (!requestTarget) return;
    const payout = requestTarget;
    setRequestTarget(null);
    setBusyLabel("Requesting authorisation…");
    const form = new FormData();
    form.set("payoutId", payout.id);
    startTransition(async () => {
      const result = await requestPayoutAuthorisation(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      router.refresh();
    });
  }

  function runCancel() {
    if (!cancelTarget) return;
    const payout = cancelTarget;
    setCancelTarget(null);
    setBusyLabel("Cancelling…");
    const form = new FormData();
    form.set("payoutId", payout.id);
    startTransition(async () => {
      const result = await cancelPayout(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      router.refresh();
    });
  }

  async function runRelease() {
    if (!releaseTarget) return;
    if (!emailCode.trim() || !totpCode.trim()) {
      await deskError({ text: "Enter both codes." });
      return;
    }
    if (!amountConfirmOk) {
      await deskError({ text: "Type the amount to confirm." });
      return;
    }
    const payout = releaseTarget;
    setReleaseTarget(null);
    setBusyLabel("Releasing payment…");
    const form = new FormData();
    form.set("payoutId", payout.id);
    form.set("emailCode", emailCode.trim());
    form.set("totpCode", totpCode.trim());
    setEmailCode("");
    setTotpCode("");
    setAmountConfirm("");
    startTransition(async () => {
      const result = await releasePayout(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      router.refresh();
    });
  }

  return (
    <div className="relative space-y-6">
      <DeskLoaderOverlay active={pending} label={busyLabel} />

      {!embedded ? (
        <section className="relative overflow-hidden border border-stone/80 bg-white/50 px-5 pb-6 pt-7 sm:px-7">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(95,143,122,0.16),_transparent_50%),linear-gradient(135deg,rgba(20,53,44,0.03),transparent_40%)]"
            aria-hidden
          />
          <div className="relative">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
              Approvals
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.75rem,5vw,2.55rem)] tracking-[-0.02em] text-pine">
              Approve and send
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
              Request approval, then enter both codes. PayPal teachers
              are sent{initial.paypalEnv === "live" ? "" : " in sandbox"} after
              release; bank teachers settle outside.
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
        <div className="border border-dashed border-stone bg-white/40 px-5 py-12 text-center">
          <p className="font-display text-lg text-pine">No payments waiting</p>
          <p className="mt-2 text-sm text-ink/55">
            Prepare a payment from Teacher pay or Send payment. Drafts appear here.
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

          <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
            {selected ? (
              <div className="space-y-5">
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
                    {payoutStatusLabel(selected.status)}
                  </p>
                  <h2 className="mt-1 font-display text-2xl text-pine">
                    {selected.payee_name}
                  </h2>
                  <p className="mt-2 text-lg tabular-nums text-ink">
                    {formatGbp(selected.amount_gbp)}
                  </p>
                  {selected.reason ? (
                    <p className="mt-2 text-sm text-ink/65">{selected.reason}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-ink/45">
                    Prepared {formatWhen(selected.created_at)}
                    {selected.period_key
                      ? ` · Period ${selected.period_key}`
                      : ""}
                    {selected.provider === "paypal" ? " · PayPal" : " · Outside"}
                  </p>
                </div>

                {selected.status === "pending_authorisation" ? (
                  <p className="border border-pine/20 bg-pine/5 px-4 py-3 text-sm text-pine">
                    Authorisation requested — waiting for the code. Ask the
                    authoriser for the code.
                    {challenge?.expiresAt ? (
                      <>
                        {" "}
                        Code expires {formatWhen(challenge.expiresAt)}.
                      </>
                    ) : null}
                  </p>
                ) : null}

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
                    Authorised but not yet sent. Retry send when the payout rail
                    is ready.
                  </p>
                ) : null}

                {selected.status === "frozen" ? (
                  <p className="border border-red-800/20 bg-red-50 px-4 py-3 text-sm text-red-900">
                    Frozen after incorrect codes. Request approval again to
                    continue.
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {initial.railConfigured &&
                  ["draft", "frozen", "expired", "pending_authorisation"].includes(
                    selected.status,
                  ) ? (
                    <button
                      type="button"
                      onClick={() => setRequestTarget(selected)}
                      className="bg-pine px-3 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
                    >
                      {selected.status === "pending_authorisation"
                        ? "Send code again"
                        : "Request approval"}
                    </button>
                  ) : null}

                  {initial.railConfigured &&
                  selected.status === "pending_authorisation" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEmailCode("");
                        setTotpCode("");
                        setAmountConfirm("");
                        setReleaseTarget(selected);
                      }}
                      className="border border-pine/25 px-3 py-2.5 text-sm font-medium text-pine hover:border-pine"
                    >
                      Enter codes
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
        open={Boolean(requestTarget)}
        title="Request approval?"
        body={
          requestTarget ? (
            <div className="space-y-2">
              <p className="font-medium text-ink">
                {requestTarget.payee_name} ·{" "}
                {formatGbp(requestTarget.amount_gbp)}
              </p>
              <p>{requestTarget.reason ?? "Teacher pay"}</p>
              <p className="text-ink/55">
                A one-time code goes to the authoriser. Ask them for it — their
                identity is never shown here.
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Request approval"
        busy={pending}
        onClose={() => setRequestTarget(null)}
        onConfirm={runRequest}
      />

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
                You will need to request approval again if you prepare this payment later.
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
        title="Release this payment?"
        body={
          releaseTarget ? (
            <div className="space-y-3">
              <p className="font-medium text-ink">
                {releaseTarget.payee_name} ·{" "}
                {formatGbp(releaseTarget.amount_gbp)}
              </p>
              <p>{releaseTarget.reason ?? "Teacher pay"}</p>
              <label className="block text-sm font-medium text-ink">
                Emailed code
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={emailCode}
                  onChange={(event) => setEmailCode(event.target.value)}
                  className={fieldClass}
                  placeholder="8-digit code"
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                Authenticator code
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  className={fieldClass}
                  placeholder="6-digit code"
                />
              </label>
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
              <p className="text-ink/55">
                Both codes are checked together.
                {releaseTarget.provider === "paypal"
                  ? " On success, PayPal is called to send the payment."
                  : " This records settlement outside the portal."}
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Release payment"
        busy={pending}
        confirmDisabled={
          !emailCode.trim() ||
          !totpCode.trim() ||
          !amountConfirmOk
        }
        onClose={() => {
          setReleaseTarget(null);
          setEmailCode("");
          setTotpCode("");
          setAmountConfirm("");
        }}
        onConfirm={runRelease}
      />
    </div>
  );
}
