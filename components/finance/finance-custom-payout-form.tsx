"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareCustomPayout } from "@/app/finance/payouts/actions";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { deskError, deskSuccess } from "@/lib/ui/desk-alert";
import { formatGbp, monthPeriodKey } from "@/lib/finance/types";

const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

export type CustomPayoutCategoryOption = {
  id: string;
  name: string;
};

export type CustomPayoutTeacherOption = {
  id: string;
  label: string;
};

export function FinanceCustomPayoutForm({
  categories,
  teachers,
  defaultPeriodKey,
  onPrepared,
  embedded = false,
}: {
  categories: CustomPayoutCategoryOption[];
  teachers: CustomPayoutTeacherOption[];
  defaultPeriodKey?: string;
  onPrepared?: (payoutId: string) => void;
  /** Hide the standalone hero when nested in the Payments corridor. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [payeeName, setPayeeName] = useState("");
  const [provider, setProvider] = useState<"paypal" | "outside">("paypal");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [amountGbp, setAmountGbp] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [periodKey, setPeriodKey] = useState(defaultPeriodKey ?? "");

  const amount = Number(amountGbp);
  const amountOk = Number.isFinite(amount) && amount > 0;
  const paypalOk =
    provider === "outside" ||
    (paypalEmail.includes("@") && paypalEmail.trim().length > 3);
  const teacherLinkOk =
    (!teacherId && !periodKey) || (Boolean(teacherId) && Boolean(periodKey));
  const canSubmit =
    payeeName.trim().length > 0 &&
    amountOk &&
    Boolean(categoryId) &&
    reason.trim().length > 0 &&
    paypalOk &&
    teacherLinkOk;

  function submit() {
    setConfirmOpen(false);
    startTransition(async () => {
      const form = new FormData();
      form.set("payeeName", payeeName.trim());
      form.set("provider", provider);
      form.set("paypalEmail", paypalEmail.trim());
      form.set("amountGbp", amount.toFixed(2));
      form.set("categoryId", categoryId);
      form.set("reason", reason.trim());
      if (teacherId) form.set("teacherId", teacherId);
      if (periodKey) form.set("periodKey", periodKey);
      const result = await prepareCustomPayout(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      setPayeeName("");
      setPaypalEmail("");
      setAmountGbp("");
      setReason("");
      setTeacherId("");
      if (result.payoutId && onPrepared) onPrepared(result.payoutId);
      else router.refresh();
    });
  }

  const now = new Date();
  const periodOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthPeriodKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
    const label = d.toLocaleString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return { key, label };
  });

  return (
    <div className="relative space-y-6">
      <DeskLoaderOverlay active={pending} label="Preparing payment…" />
      {!embedded ? (
        <section className="relative overflow-hidden border border-stone/80 bg-white/55 px-5 py-6 sm:px-7">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Send payment
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.75rem,5vw,2.55rem)] tracking-[-0.02em] text-pine">
            Create a payment
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
            Pay anyone by PayPal, or record a bank payment made outside the
            portal. It still needs approval before money is sent.
          </p>
        </section>
      ) : null}

      <section className="border border-stone/80 bg-white/55 px-5 py-5 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="text-ink/70">Payee name</span>
            <input
              className={fieldClass}
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              maxLength={200}
              autoComplete="off"
              placeholder="Name as it should appear on the books"
            />
          </label>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm text-ink/70">Method</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="provider"
                  checked={provider === "paypal"}
                  onChange={() => setProvider("paypal")}
                />
                PayPal
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="provider"
                  checked={provider === "outside"}
                  onChange={() => setProvider("outside")}
                />
                Bank / outside
              </label>
            </div>
          </fieldset>

          {provider === "paypal" ? (
            <label className="block text-sm sm:col-span-2">
              <span className="text-ink/70">PayPal email</span>
              <input
                className={fieldClass}
                type="email"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
                autoComplete="off"
                placeholder="payee@example.com"
              />
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="text-ink/70">Amount (GBP)</span>
            <input
              className={fieldClass}
              inputMode="decimal"
              value={amountGbp}
              onChange={(e) => setAmountGbp(e.target.value)}
              placeholder="0.00"
            />
          </label>

          <label className="block text-sm">
            <span className="text-ink/70">Category</span>
            <select
              className={fieldClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.length === 0 ? (
                <option value="">No categories</option>
              ) : null}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="text-ink/70">Reason</span>
            <textarea
              className={`${fieldClass} min-h-[88px]`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              placeholder="What is this payment for?"
            />
          </label>

          <div className="sm:col-span-2 border-t border-stone/70 pt-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
              Optional — mark teacher paid
            </p>
            <p className="mt-1 text-sm text-ink/55">
              Link a teacher and pay period if this payment should clear their
              teacher-pay mark when released.
            </p>
          </div>

          <label className="block text-sm">
            <span className="text-ink/70">Teacher</span>
            <select
              className={fieldClass}
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">None</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-ink/70">Pay period</span>
            <select
              className={fieldClass}
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              disabled={!teacherId}
            >
              <option value="">None</option>
              {periodOptions.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit || pending || categories.length === 0}
            onClick={() => setConfirmOpen(true)}
            className="bg-pine px-4 py-2.5 text-sm font-semibold text-mist hover:bg-celadon disabled:opacity-50"
          >
            Prepare payment
          </button>
          <p className="text-sm text-ink/50">
            Creates a draft under Approvals. You still need to approve it before
            money is sent.
          </p>
        </div>
      </section>

      <DeskConfirmModal
        open={confirmOpen}
        title="Prepare this payment?"
        body={
          <div className="space-y-2 text-sm text-ink/70">
            <p>
              <strong className="text-ink">{payeeName.trim() || "Payee"}</strong>
              {" · "}
              {amountOk ? formatGbp(amount) : "—"}
              {" · "}
              {provider === "paypal" ? "PayPal" : "Bank / outside"}
            </p>
            <p>{reason.trim() || "No reason"}</p>
            {teacherId && periodKey ? (
              <p>
                When this payment settles, the linked teacher will be marked
                paid for {periodKey}.
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Prepare payment"
        cancelLabel="Go back"
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
      />
    </div>
  );
}
