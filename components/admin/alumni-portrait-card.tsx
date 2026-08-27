"use client";

import type { AlumniLegacyPerson } from "@/lib/alumni/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

type Props = {
  person: AlumniLegacyPerson;
  selected: boolean;
  onSelect: () => void;
};

export function AlumniPortraitCard({ person, selected, onSelect }: Props) {
  const portalReady = Boolean(person.activated_user_id);
  const scored = person.exams.filter((e) => e.percent != null);
  const avg =
    scored.length > 0
      ? Math.round(
          scored.reduce((sum, e) => sum + Number(e.percent), 0) / scored.length,
        )
      : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors sm:px-4 sm:py-3.5 ${
        selected ? "bg-pine text-mist" : "hover:bg-white/70"
      }`}
    >
      <span
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center text-xs font-medium ${
          selected ? "bg-mist/15 text-mist" : "bg-stone/70 text-pine"
        }`}
        aria-hidden
      >
        {initials(person.display_name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-medium">{person.display_name}</span>
          <span
            className={`shrink-0 text-[0.65rem] uppercase tracking-[0.1em] ${
              selected ? "text-mist/55" : "text-ink/40"
            }`}
          >
            {person.batch_year}
          </span>
        </span>
        <span
          className={`mt-1 block truncate text-xs ${
            selected ? "text-mist/65" : "text-ink/50"
          }`}
        >
          {person.centre || person.batch_label}
          {person.centre && person.batch_label !== String(person.batch_year)
            ? ` · ${person.batch_label}`
            : ""}
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          <span
            className={`border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] ${
              selected
                ? "border-mist/25 text-mist/80"
                : portalReady
                  ? "border-celadon/40 text-celadon"
                  : "border-pine/25 text-pine/75"
            }`}
          >
            {portalReady ? "Portal ready" : "Needs email"}
          </span>
          {avg != null ? (
            <span
              className={`border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] tabular-nums ${
                selected
                  ? "border-mist/25 text-mist/70"
                  : "border-stone text-ink/55"
              }`}
            >
              Avg {avg}%
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
