"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  createPayRate,
  deletePayRate,
  updatePayRate,
} from "@/app/finance/rates/actions";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { deskConfirm, deskError } from "@/lib/ui/desk-alert";
import { formatGbp, type TeacherPayRate } from "@/lib/finance/types";

const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function rateInForce(rates: TeacherPayRate[], day = todayIso()) {
  return (
    [...rates]
      .filter((rate) => rate.effective_from <= day)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ??
    null
  );
}

type Draft = {
  amountGbp: string;
  effectiveFrom: string;
  label: string;
};

function emptyDraft(): Draft {
  return {
    amountGbp: "50",
    effectiveFrom: todayIso(),
    label: "",
  };
}

export function FinanceRatesManager({
  initialRates,
}: {
  initialRates: TeacherPayRate[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState("Updating rates…");
  const [rates, setRates] = useState(initialRates);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherPayRate | null>(null);

  const current = useMemo(() => rateInForce(rates), [rates]);
  const timeline = useMemo(
    () =>
      [...rates].sort((a, b) =>
        b.effective_from.localeCompare(a.effective_from),
      ),
    [rates],
  );

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setComposeOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("finance-rate-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function openEdit(rate: TeacherPayRate) {
    setEditing(rate);
    setDraft({
      amountGbp: String(rate.amount_gbp),
      effectiveFrom: rate.effective_from,
      label: rate.label ?? "",
    });
    setComposeOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("finance-rate-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function closeCompose() {
    if (pending) return;
    setComposeOpen(false);
    setEditing(null);
    setDraft(emptyDraft());
  }

  async function onComposeSubmit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(draft.amountGbp);
    if (!Number.isFinite(amount) || amount < 0) {
      await deskError({ text: "Enter a valid amount in pounds." });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveFrom)) {
      await deskError({ text: "Choose a valid start date." });
      return;
    }

    const ok = await deskConfirm({
      title: editing ? "Save rate changes?" : "Publish this rate?",
      html: [
        `<p><strong>${formatGbp(amount)}</strong> from ${draft.effectiveFrom}</p>`,
        draft.label.trim() ? `<p>${draft.label.trim()}</p>` : "",
        `<p style="opacity:0.7">${
          editing
            ? "This updates the rate on the timeline."
            : "New sessions on or after this date will use this amount."
        }</p>`,
      ]
        .filter(Boolean)
        .join(""),
      confirmLabel: editing ? "Save changes" : "Publish rate",
      cancelLabel: "Go back",
    });
    if (!ok) return;

    setBusyLabel("Saving rate…");
    const form = new FormData();
    form.set("amountGbp", draft.amountGbp);
    form.set("effectiveFrom", draft.effectiveFrom);
    form.set("label", draft.label);
    if (editing) form.set("id", editing.id);

    startTransition(async () => {
      const result = editing
        ? await updatePayRate(form)
        : await createPayRate(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      closeCompose();
      window.location.reload();
    });
  }

  async function onDelete(rate: TeacherPayRate) {
    const ok = await deskConfirm({
      title: "Delete this rate?",
      text: `Delete ${formatGbp(rate.amount_gbp)} from ${rate.effective_from}? Past months already calculated keep their figures.`,
      confirmLabel: "Delete rate",
      cancelLabel: "Keep rate",
      danger: true,
    });
    if (!ok) return;

    setBusyLabel("Deleting rate…");
    const form = new FormData();
    form.set("id", rate.id);
    startTransition(async () => {
      const result = await deletePayRate(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      setRates(rates.filter((row) => row.id !== rate.id));
    });
  }

  return (
    <div className="relative space-y-8">
      <DeskLoaderOverlay active={pending} label={busyLabel} />

      <section className="relative overflow-hidden border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.16),_transparent_55%)]"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              In force today
            </p>
            <h2 className="mt-2 font-display text-[clamp(1.8rem,5vw,2.6rem)] tracking-[-0.02em] text-pine tabular-nums">
              {current ? formatGbp(current.amount_gbp) : "No rate set"}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink/60">
              {current
                ? `Applies to sessions on or after ${current.effective_from}${
                    current.label ? ` · ${current.label}` : ""
                  }. Earlier rates stay on the timeline so past months keep their original pay.`
                : "Add a session rate so teacher pay can be calculated."}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 items-center bg-pine px-4 text-sm font-medium text-mist hover:bg-celadon"
          >
            Set a new rate
          </button>
        </div>
      </section>

      {composeOpen ? (
        <section
          id="finance-rate-form"
          className="animate-fade-rise border border-pine/25 bg-white/70 px-5 py-6 sm:px-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                {editing ? "Edit rate" : "New rate"}
              </p>
              <h3 className="mt-2 font-display text-2xl tracking-[-0.02em] text-pine">
                {editing ? "Update this rate" : "Publish a session rate"}
              </h3>
              <p className="mt-2 max-w-xl text-sm text-ink/60">
                Sessions use the rate whose start date is on or before the class
                date.
              </p>
            </div>
            <button
              type="button"
              onClick={closeCompose}
              disabled={pending}
              className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine hover:border-pine disabled:opacity-60"
            >
              Close
            </button>
          </div>

          <form
            onSubmit={onComposeSubmit}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <label className="block text-sm font-medium text-ink">
              Amount (GBP)
              <input
                className={fieldClass}
                inputMode="decimal"
                value={draft.amountGbp}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    amountGbp: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Start date
              <input
                type="date"
                className={fieldClass}
                value={draft.effectiveFrom}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    effectiveFrom: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="block text-sm font-medium text-ink sm:col-span-2">
              Label (optional)
              <input
                className={fieldClass}
                value={draft.label}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    label: event.target.value,
                  }))
                }
                maxLength={120}
                placeholder="e.g. Default session rate"
              />
            </label>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={closeCompose}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
              >
                Review and save
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section>
        <div className="mb-3">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Timeline
          </p>
          <h2 className="mt-1 font-display text-xl text-pine">
            Rates finance has set
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink/55">
            Each row is a rate published with a start date. The newest date that
            is not in the future is the current rate. Older rows are history for
            past classes.
          </p>
        </div>

        {timeline.length === 0 ? (
          <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center">
            <p className="font-display text-lg text-pine">No rates yet</p>
            <p className="mt-2 text-sm text-ink/55">
              Publish a default session rate to start calculating pay.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone/70 border border-stone/80 bg-white/55">
            {timeline.map((rate) => {
              const isCurrent = current?.id === rate.id;
              const isFuture = rate.effective_from > todayIso();
              return (
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
                      {isCurrent ? (
                        <span className="ml-2 text-xs font-medium uppercase tracking-[0.12em] text-celadon">
                          Current
                        </span>
                      ) : null}
                      {isFuture ? (
                        <span className="ml-2 text-xs font-medium uppercase tracking-[0.12em] text-ink/40">
                          Scheduled
                        </span>
                      ) : null}
                      {!isCurrent && !isFuture ? (
                        <span className="ml-2 text-xs font-medium uppercase tracking-[0.12em] text-ink/40">
                          Earlier
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(rate)}
                      className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine hover:border-pine"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(rate)}
                      className="border border-red-800/20 px-3 py-2 text-sm font-medium text-red-900/80 hover:border-red-800/40"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
