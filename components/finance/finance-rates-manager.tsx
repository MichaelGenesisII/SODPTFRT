"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  createPayRate,
  deletePayRate,
  updatePayRate,
} from "@/app/finance/rates/actions";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { formatGbp, type TeacherPayRate } from "@/lib/finance/types";

const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

export function FinanceRatesManager({
  initialRates,
}: {
  initialRates: TeacherPayRate[];
}) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [rates, setRates] = useState(initialRates);
  const [amountGbp, setAmountGbp] = useState("50");
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<TeacherPayRate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeacherPayRate | null>(null);

  function refreshLocal(next: TeacherPayRate[]) {
    setRates(
      [...next].sort((a, b) =>
        b.effective_from.localeCompare(a.effective_from),
      ),
    );
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const form = new FormData();
    form.set("amountGbp", amountGbp);
    form.set("effectiveFrom", effectiveFrom);
    form.set("label", label);
    startTransition(async () => {
      const result = await createPayRate(form);
      if (!result.ok) {
        error(result.message, "Rates");
        return;
      }
      success(result.message, "Rates");
      setLabel("");
      // Soft refresh: re-fetch via navigation would be ideal; keep optimistic by
      // appending a temporary row until full reload — simplest is reload.
      window.location.reload();
    });
  }

  function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData();
    form.set("id", editing.id);
    form.set("amountGbp", amountGbp);
    form.set("effectiveFrom", effectiveFrom);
    form.set("label", label);
    startTransition(async () => {
      const result = await updatePayRate(form);
      if (!result.ok) {
        error(result.message, "Rates");
        return;
      }
      success(result.message, "Rates");
      refreshLocal(
        rates.map((r) =>
          r.id === editing.id
            ? {
                ...r,
                amount_gbp: Number(amountGbp),
                effective_from: effectiveFrom,
                label: label.trim() || null,
              }
            : r,
        ),
      );
      setEditing(null);
    });
  }

  function startEdit(rate: TeacherPayRate) {
    setEditing(rate);
    setAmountGbp(String(rate.amount_gbp));
    setEffectiveFrom(rate.effective_from);
    setLabel(rate.label ?? "");
  }

  function cancelEdit() {
    setEditing(null);
    setAmountGbp("50");
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setLabel("");
  }

  return (
    <div className="relative space-y-8">
      <DeskLoaderOverlay active={pending} label="Saving rate…" />

      <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          {editing ? "Edit rate" : "Add rate"}
        </p>
        <h2 className="mt-1 font-display text-xl text-pine">
          {editing ? "Update session rate" : "New session rate"}
        </h2>
        <p className="mt-2 text-sm text-ink/55">
          The rate in force on a class date is used for that session’s pay.
        </p>
        <form
          onSubmit={editing ? onSaveEdit : onCreate}
          className="mt-5 grid gap-4 sm:grid-cols-3"
        >
          <label className="block text-sm">
            <span className="text-ink/70">Amount (GBP)</span>
            <input
              className={fieldClass}
              inputMode="decimal"
              value={amountGbp}
              onChange={(e) => setAmountGbp(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/70">Effective from</span>
            <input
              type="date"
              className={fieldClass}
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/70">Label (optional)</span>
            <input
              className={fieldClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
              placeholder="e.g. Default session rate"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center bg-pine px-4 text-sm font-medium text-mist hover:bg-celadon"
            >
              {editing ? "Save changes" : "Add rate"}
            </button>
            {editing ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex min-h-11 items-center border border-pine/30 px-4 text-sm font-medium text-pine hover:border-pine"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section>
        <div className="mb-3">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            History
          </p>
          <h2 className="mt-1 font-display text-xl text-pine">
            Effective rates
          </h2>
        </div>
        {rates.length === 0 ? (
          <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center">
            <p className="font-display text-lg text-pine">No rates yet</p>
            <p className="mt-2 text-sm text-ink/55">
              Add a default session rate to start calculating pay.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone/70 border border-stone/80 bg-white/55">
            {rates.map((rate) => (
              <li
                key={rate.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {formatGbp(rate.amount_gbp)}
                    {rate.label ? (
                      <span className="ml-2 font-normal text-ink/50">
                        · {rate.label}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-ink/55">
                    From {rate.effective_from}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(rate)}
                    className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine hover:border-pine"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(rate)}
                    className="border border-red-800/20 px-3 py-2 text-sm font-medium text-red-900/80 hover:border-red-800/40"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeskConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove rate?"
        body={
          deleteTarget
            ? `Remove ${formatGbp(deleteTarget.amount_gbp)} from ${deleteTarget.effective_from}? Past periods already calculated keep their history in reports.`
            : ""
        }
        confirmLabel="Remove"
        destructive
        busy={pending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const form = new FormData();
          form.set("id", deleteTarget.id);
          startTransition(async () => {
            const result = await deletePayRate(form);
            if (!result.ok) {
              error(result.message, "Rates");
              return;
            }
            success(result.message, "Rates");
            refreshLocal(rates.filter((r) => r.id !== deleteTarget.id));
            setDeleteTarget(null);
          });
        }}
      />
    </div>
  );
}
