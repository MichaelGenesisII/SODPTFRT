"use client";

import Link from "next/link";
import type { AlumniLegacyPerson } from "@/lib/alumni/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function examAverage(person: AlumniLegacyPerson): number | null {
  const scored = person.exams.filter((e) => e.percent != null);
  if (!scored.length) return null;
  return Math.round(
    scored.reduce((sum, e) => sum + Number(e.percent), 0) / scored.length,
  );
}

export function AlumniListRow({
  person,
  href,
  checked,
  onToggle,
  disabled,
}: {
  person: AlumniLegacyPerson;
  href: string;
  checked?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  const portalReady = Boolean(person.activated_user_id);
  const avg = examAverage(person);
  const selectable = typeof onToggle === "function";

  return (
    <li>
      <div className="group grid items-center gap-3 px-3 py-3 transition-colors hover:bg-white/70 sm:px-4 md:grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_5rem_7rem_5rem_2rem]">
        {selectable ? (
          <label className="flex items-center justify-center">
            <span className="sr-only">Select {person.display_name}</span>
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={onToggle}
              onClick={(event) => event.stopPropagation()}
              className="size-4 accent-pine"
            />
          </label>
        ) : null}

        <Link href={href} className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center bg-stone/70 text-xs font-medium text-pine group-hover:bg-pine group-hover:text-mist">
            {initials(person.display_name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink group-hover:text-pine">
              {person.display_name}
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink/50">
              {person.email ?? "No email yet"}
            </span>
            {avg != null ? (
              <span className="mt-1 inline-block text-[0.65rem] tabular-nums text-ink/40">
                Exam avg {avg}%
              </span>
            ) : null}
          </span>
        </Link>

        <Link href={href} className="hidden min-w-0 md:block">
          <p className="truncate text-sm text-ink/75">
            {person.centre ?? person.batch_label}
          </p>
          <p className="truncate text-xs text-ink/45">
            {person.batch_label !== String(person.batch_year)
              ? person.batch_label
              : "Graduating batch"}
          </p>
        </Link>

        <Link
          href={href}
          className="hidden text-sm tabular-nums text-ink/60 md:block"
        >
          {person.batch_year}
        </Link>

        <Link href={href} className="hidden md:block">
          <span
            className={`inline-block border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] ${
              portalReady
                ? "border-celadon/40 bg-celadon/10 text-pine"
                : "border-pine/25 text-pine"
            }`}
          >
            {portalReady ? "Portal ready" : "Needs email"}
          </span>
        </Link>

        <Link href={href} className="hidden text-sm text-ink/55 md:block">
          {person.tuition_covered
            ? "Covered"
            : person.tuition_paid_gbp > 0
              ? `£${Number(person.tuition_paid_gbp).toFixed(0)}`
              : "—"}
        </Link>

        <Link
          href={href}
          className="hidden justify-self-end text-pine/40 group-hover:text-pine md:flex"
          aria-label={`Open ${person.display_name}`}
        >
          →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-stone/60 px-3 pb-3 pt-0 md:hidden">
        <span className="text-xs text-ink/50">
          {person.centre ?? person.batch_label} · {person.batch_year}
        </span>
        <span
          className={`border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] ${
            portalReady
              ? "border-celadon/40 bg-celadon/10 text-pine"
              : "border-pine/25 text-pine"
          }`}
        >
          {portalReady ? "Portal ready" : "Needs email"}
        </span>
      </div>
    </li>
  );
}
