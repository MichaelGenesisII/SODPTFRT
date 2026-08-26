"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  clearTempCohortSwitch,
  listMyTempSwitchOptions,
  requestTempCohortSwitch,
} from "@/app/student/classes/temp-switch-actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";

export function TempCohortSwitchCard() {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof listMyTempSwitchOptions>
  > | null>(null);

  function reload() {
    setBusyLabel("Loading…");
    startTransition(async () => {
      try {
        setData(await listMyTempSwitchOptions());
      } catch (err) {
        console.error("[temp switch load]", err);
        error("Could not load Saturday switch options.");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  if (!data?.homeSaturdayCohortId) {
    return null;
  }

  return (
    <section
      className="relative mb-6 border border-stone/80 bg-white/50 p-5"
      aria-busy={busy}
    >
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
        This month
      </p>
      <h2 className="mt-1 font-display text-xl text-pine">
        Temporary Saturday switch
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink/65">
        Home cohort: <span className="font-medium text-ink">{data.homeLabel}</span>
        . If you miss that Saturday in {data.forMonthLabel}, attend another
        Saturday this month only. Your home cohort stays the same.
      </p>

      {data.existingGuestId ? (
        <div className="mt-4 space-y-3 border border-pine/20 bg-stone/35 px-4 py-3 text-sm">
          <p>
            Guest seat this month:{" "}
            <span className="font-medium text-pine">
              {data.existingGuestLabel}
            </span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusyLabel("Clearing…");
              startTransition(async () => {
                try {
                  const result = await clearTempCohortSwitch();
                  if (result.ok) {
                    success(result.message);
                    setData(await listMyTempSwitchOptions());
                  } else error(result.message);
                } finally {
                  setBusyLabel(null);
                }
              });
            }}
            className="text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 disabled:opacity-50"
          >
            {busy && busyLabel?.startsWith("Clearing") ? (
              <DeskLoader label="Clearing…" />
            ) : (
              "Clear temporary switch"
            )}
          </button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                disabled={busy || !opt.selectable}
                onClick={() => {
                  setBusyLabel("Saving switch…");
                  startTransition(async () => {
                    try {
                      const result = await requestTempCohortSwitch({
                        guestSaturdayCohortId: opt.id,
                      });
                      if (result.ok) {
                        success(result.message);
                        setData(await listMyTempSwitchOptions());
                      } else error(result.message);
                    } finally {
                      setBusyLabel(null);
                    }
                  });
                }}
                className="flex w-full flex-col items-start border border-pine/20 px-3 py-3 text-left text-sm transition-colors hover:border-pine disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="font-medium text-pine">{opt.label}</span>
                <span className="mt-1 text-xs text-ink/50">
                  {opt.selectable
                    ? opt.recommended
                      ? "Recommended"
                      : "Available this month"
                    : "Currently full"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink/50">
        Missed every Saturday this month?{" "}
        <Link
          href={data.missMonthSupportHref}
          className="font-medium text-pine underline decoration-pine/30 underline-offset-4"
        >
          Contact support
        </Link>{" "}
        — an extra fee may apply.
      </p>
    </section>
  );
}
