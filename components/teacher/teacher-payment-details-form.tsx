"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveTeacherPaymentDetails } from "@/app/teacher/account/payment-actions";
import { DeskLoader } from "@/components/ui/desk-loader";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";
import {
  methodLabel,
  type TeacherPaymentDetailsOwn,
  type TeacherPaymentMethod,
} from "@/lib/teacher/payment-details";

const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine sm:py-2";

export function TeacherPaymentDetailsForm({
  initial,
  encryptionReady,
}: {
  initial: TeacherPaymentDetailsOwn | null;
  encryptionReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [method, setMethod] = useState<TeacherPaymentMethod>(
    initial?.preferredMethod ?? "paypal",
  );
  const [paypalEmail, setPaypalEmail] = useState(initial?.paypalEmail ?? "");
  const [bankAccountName, setBankAccountName] = useState(
    initial?.bankAccountName ?? "",
  );
  const [bankSortCode, setBankSortCode] = useState(initial?.bankSortCode ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(
    initial?.bankAccountNumber ?? "",
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!encryptionReady) {
      await deskError({
        text: "Payment details are temporarily unavailable. Please try again later.",
      });
      return;
    }
    if (method === "paypal") {
      if (!paypalEmail.trim()) {
        await deskError({ text: "Enter your PayPal email." });
        return;
      }
    } else if (
      !bankAccountName.trim() ||
      !bankSortCode.trim() ||
      !bankAccountNumber.trim()
    ) {
      await deskError({ text: "Enter your full bank details." });
      return;
    }

    const ok = await deskConfirm({
      title: "Save payment details?",
      text: `Method: ${methodLabel(method)}. A confirmation email will be sent. Finance will only see a masked version of these details.`,
      confirmLabel: "Save details",
      cancelLabel: "Go back",
    });
    if (!ok) return;

    const form = new FormData();
    form.set("method", method);
    if (method === "paypal") {
      form.set("paypalEmail", paypalEmail.trim());
    } else {
      form.set("bankAccountName", bankAccountName.trim());
      form.set("bankSortCode", bankSortCode.trim());
      form.set("bankAccountNumber", bankAccountNumber.trim());
    }
    startTransition(async () => {
      const result = await saveTeacherPaymentDetails(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
    });
  }

  return (
    <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
        How you get paid
      </p>
      <h2 className="mt-1 font-display text-xl text-pine">Payment details</h2>
      <p className="mt-2 max-w-lg text-sm text-ink/55">
        Finance uses these details to pay you. Only you can edit them. Finance
        sees a masked version and cannot change them.
      </p>

      {!encryptionReady ? (
        <p className="mt-4 border border-amber-800/25 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Payment details are temporarily unavailable. Please try again later.
        </p>
      ) : null}

      {initial?.recentlyChanged ? (
        <p className="mt-4 border border-pine/20 bg-pine/5 px-4 py-3 text-sm text-pine">
          These details were updated recently. Finance will see a notice for 30
          days.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-5 max-w-md space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">
            Preferred method
          </legend>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name="method"
              checked={method === "paypal"}
              onChange={() => setMethod("paypal")}
              disabled={!encryptionReady || pending}
            />
            PayPal
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name="method"
              checked={method === "bank_transfer"}
              onChange={() => setMethod("bank_transfer")}
              disabled={!encryptionReady || pending}
            />
            Bank transfer
          </label>
        </fieldset>

        {method === "paypal" ? (
          <label className="block text-sm font-medium text-ink">
            PayPal email
            <input
              type="email"
              autoComplete="email"
              value={paypalEmail}
              onChange={(event) => setPaypalEmail(event.target.value)}
              className={fieldClass}
              disabled={!encryptionReady || pending}
              required
            />
          </label>
        ) : (
          <>
            <label className="block text-sm font-medium text-ink">
              Account name
              <input
                type="text"
                autoComplete="name"
                value={bankAccountName}
                onChange={(event) => setBankAccountName(event.target.value)}
                className={fieldClass}
                disabled={!encryptionReady || pending}
                required
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Sort code
              <input
                type="text"
                inputMode="numeric"
                placeholder="12-34-56"
                value={bankSortCode}
                onChange={(event) => setBankSortCode(event.target.value)}
                className={fieldClass}
                disabled={!encryptionReady || pending}
                required
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Account number
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={bankAccountNumber}
                onChange={(event) => setBankAccountNumber(event.target.value)}
                className={fieldClass}
                disabled={!encryptionReady || pending}
                required
              />
            </label>
          </>
        )}

        <button
          type="submit"
          disabled={!encryptionReady || pending}
          className="inline-flex min-h-11 w-full items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60 sm:w-auto"
        >
          {pending ? (
            <DeskLoader label="Saving…" tone="mist" />
          ) : (
            "Save payment details"
          )}
        </button>
      </form>
    </section>
  );
}
