"use client";

import { useState } from "react";
import {
  dateSelectionIsActive,
  emptyDateSelection,
  monthKeyLabel,
  toggleListValue,
  type DateSelection,
  type DateSelectionMode,
} from "@/lib/finance/date-selection";
import { formatGbp } from "@/lib/finance/types";

const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

const MODES: { id: DateSelectionMode; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "days", label: "Days" },
  { id: "range", label: "Range" },
  { id: "months", label: "Months" },
  { id: "years", label: "Years" },
];

export function FinanceBooksDateTools({
  selection,
  onChange,
  monthSpend,
  lockedPeriodKeys,
}: {
  selection: DateSelection;
  onChange: (next: DateSelection) => void;
  monthSpend: Map<string, number>;
  lockedPeriodKeys: Set<string>;
}) {
  const now = new Date();
  const [pickerYear, setPickerYear] = useState(now.getUTCFullYear());
  const [gridCursor, setGridCursor] = useState(() => ({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  }));

  const daysInMonth = new Date(
    Date.UTC(gridCursor.year, gridCursor.month, 0),
  ).getUTCDate();
  const monthKey = `${gridCursor.year}-${String(gridCursor.month).padStart(2, "0")}`;
  const recentYears = Array.from({ length: 8 }, (_, i) =>
    String(now.getUTCFullYear() - i),
  );
  const yearMonths = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return `${pickerYear}-${m}`;
  });

  function setMode(mode: DateSelectionMode) {
    onChange({ ...emptyDateSelection(), mode });
  }

  function shiftGrid(delta: number) {
    const date = new Date(
      Date.UTC(gridCursor.year, gridCursor.month - 1 + delta, 1),
    );
    setGridCursor({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink/40">
          Date selection
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setMode(mode.id)}
              className={`px-3 py-1.5 text-xs font-medium uppercase tracking-[0.1em] ${
                selection.mode === mode.id
                  ? "bg-pine text-mist"
                  : "border border-pine/20 text-pine hover:border-pine"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {selection.mode === "days" ? (
        <label className="block text-sm font-medium text-ink">
          Add a day
          <input
            type="date"
            className={`${fieldClass} max-w-[14rem]`}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              if (!selection.days.includes(value)) {
                onChange({
                  ...selection,
                  days: [...selection.days, value].sort(),
                });
              }
              event.target.value = "";
            }}
          />
          {selection.days.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {selection.days.map((day) => (
                <li key={day}>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...selection,
                        days: selection.days.filter((d) => d !== day),
                      })
                    }
                    className="border border-stone bg-white/70 px-2 py-1 text-xs text-pine hover:border-pine"
                  >
                    {day} ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ink/45">
              Pick days above, or tap the month grid.
            </p>
          )}
        </label>
      ) : null}

      {selection.mode === "range" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            From
            <input
              type="date"
              value={selection.from}
              onChange={(event) =>
                onChange({ ...selection, from: event.target.value })
              }
              className={fieldClass}
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            To
            <input
              type="date"
              value={selection.to}
              onChange={(event) =>
                onChange({ ...selection, to: event.target.value })
              }
              className={fieldClass}
            />
          </label>
        </div>
      ) : null}

      {selection.mode === "months" ? (
        <div>
          <label className="block text-sm font-medium text-ink">
            Year
            <select
              className={`${fieldClass} max-w-[8rem]`}
              value={pickerYear}
              onChange={(event) => setPickerYear(Number(event.target.value))}
            >
              {recentYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {yearMonths.map((key) => {
              const selected = selection.months.includes(key);
              const locked = lockedPeriodKeys.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...selection,
                      months: toggleListValue(selection.months, key),
                    })
                  }
                  className={`px-2 py-2 text-left text-xs ${
                    selected
                      ? "bg-pine text-mist"
                      : "border border-stone bg-white/60 text-ink hover:border-pine"
                  }`}
                >
                  <span className="block font-medium">{monthKeyLabel(key)}</span>
                  {locked ? (
                    <span className="mt-0.5 block uppercase tracking-[0.1em] opacity-70">
                      Locked
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selection.mode === "years" ? (
        <div className="flex flex-wrap gap-2">
          {recentYears.map((year) => {
            const selected = selection.years.includes(year);
            return (
              <button
                key={year}
                type="button"
                onClick={() =>
                  onChange({
                    ...selection,
                    years: toggleListValue(selection.years, year),
                  })
                }
                className={`min-w-[4.5rem] px-3 py-2 text-sm font-medium ${
                  selected
                    ? "bg-pine text-mist"
                    : "border border-stone text-pine hover:border-pine"
                }`}
              >
                {year}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="border border-stone/70 bg-white/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
              Month at a glance
            </p>
            <p className="mt-1 font-display text-lg text-pine">
              {monthKeyLabel(monthKey)}
              {lockedPeriodKeys.has(monthKey) ? (
                <span className="ml-2 text-xs font-medium uppercase tracking-[0.12em] text-ink/40">
                  Locked
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => shiftGrid(-1)}
              className="border border-pine/25 px-2 py-1.5 text-xs font-medium text-pine hover:border-pine"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => shiftGrid(1)}
              className="border border-pine/25 px-2 py-1.5 text-xs font-medium text-pine hover:border-pine"
            >
              Next
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[0.65rem] uppercase tracking-[0.08em] text-ink/40">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from(
            { length: startPad(gridCursor.year, gridCursor.month) },
            (_, i) => <span key={`pad-${i}`} />,
          )}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const iso = `${monthKey}-${String(day).padStart(2, "0")}`;
            const spend = monthSpend.get(iso) ?? 0;
            const selected =
              selection.mode === "days" && selection.days.includes(iso);
            return (
              <button
                key={iso}
                type="button"
                title={spend ? `${iso}: ${formatGbp(spend)} out` : iso}
                onClick={() => {
                  if (selection.mode === "days") {
                    onChange({
                      ...selection,
                      days: toggleListValue(selection.days, iso),
                    });
                    return;
                  }
                  onChange({
                    mode: "days",
                    days: [iso],
                    from: "",
                    to: "",
                    months: [],
                    years: [],
                  });
                }}
                className={`min-h-[2.4rem] border px-0.5 py-1 text-[0.7rem] ${
                  selected
                    ? "border-pine bg-pine text-mist"
                    : spend > 0
                      ? "border-celadon/40 bg-celadon/10 text-pine"
                      : "border-stone/60 bg-white/50 text-ink/70 hover:border-pine"
                }`}
              >
                <span className="block font-medium">{day}</span>
                {spend > 0 ? (
                  <span className="block truncate text-[0.55rem] opacity-80">
                    {formatGbp(spend)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {dateSelectionIsActive(selection) ? (
          <button
            type="button"
            onClick={() => onChange(emptyDateSelection())}
            className="mt-3 text-xs font-medium text-ink/50 hover:text-pine"
          >
            Clear date selection
          </button>
        ) : null}
      </div>
    </div>
  );
}

function startPad(year: number, month: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (weekday + 6) % 7;
}
