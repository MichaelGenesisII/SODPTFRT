/** Advanced Books date selection — serialised into URL search params. */

export type DateSelectionMode = "all" | "days" | "range" | "months" | "years";

export type DateSelection = {
  mode: DateSelectionMode;
  days: string[];
  from: string;
  to: string;
  months: string[];
  years: string[];
};

export const emptyDateSelection = (): DateSelection => ({
  mode: "all",
  days: [],
  from: "",
  to: "",
  months: [],
  years: [],
});

function uniqSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort();
}

export function parseDateSelection(
  params: Record<string, string | undefined>,
): DateSelection {
  const modeRaw = (params.dateMode ?? "all").trim();
  const mode: DateSelectionMode =
    modeRaw === "days" ||
    modeRaw === "range" ||
    modeRaw === "months" ||
    modeRaw === "years"
      ? modeRaw
      : "all";

  return {
    mode,
    days: uniqSorted((params.days ?? "").split(",")),
    from: (params.from ?? "").trim(),
    to: (params.to ?? "").trim(),
    months: uniqSorted((params.months ?? "").split(",")),
    years: uniqSorted((params.years ?? "").split(",")),
  };
}

export function dateSelectionToSearchParams(
  selection: DateSelection,
  base?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base?.toString());
  for (const key of ["dateMode", "days", "from", "to", "months", "years"]) {
    params.delete(key);
  }
  if (selection.mode === "all") return params;

  params.set("dateMode", selection.mode);
  if (selection.mode === "days" && selection.days.length) {
    params.set("days", selection.days.join(","));
  }
  if (selection.mode === "range") {
    if (selection.from) params.set("from", selection.from);
    if (selection.to) params.set("to", selection.to);
  }
  if (selection.mode === "months" && selection.months.length) {
    params.set("months", selection.months.join(","));
  }
  if (selection.mode === "years" && selection.years.length) {
    params.set("years", selection.years.join(","));
  }
  return params;
}

export function dateSelectionIsActive(selection: DateSelection): boolean {
  if (selection.mode === "all") return false;
  if (selection.mode === "days") return selection.days.length > 0;
  if (selection.mode === "range") return Boolean(selection.from || selection.to);
  if (selection.mode === "months") return selection.months.length > 0;
  if (selection.mode === "years") return selection.years.length > 0;
  return false;
}

export function entryMatchesDateSelection(
  incurredOn: string,
  selection: DateSelection,
): boolean {
  if (!dateSelectionIsActive(selection)) return true;
  const day = incurredOn.slice(0, 10);
  const month = day.slice(0, 7);
  const year = day.slice(0, 4);

  switch (selection.mode) {
    case "days":
      return selection.days.includes(day);
    case "range": {
      if (selection.from && day < selection.from) return false;
      if (selection.to && day > selection.to) return false;
      return Boolean(selection.from || selection.to);
    }
    case "months":
      return selection.months.includes(month);
    case "years":
      return selection.years.includes(year);
    default:
      return true;
  }
}

export function toggleListValue(list: string[], value: string): string[] {
  const set = new Set(list);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set].sort();
}

export function monthKeyLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
