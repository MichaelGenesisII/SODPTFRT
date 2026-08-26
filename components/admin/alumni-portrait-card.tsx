"use client";

import type { AlumniLegacyPerson } from "@/lib/alumni/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function examSummary(person: AlumniLegacyPerson): string | null {
  const scored = person.exams.filter((e) => e.percent != null);
  if (!scored.length) return null;
  return scored
    .map((e) => `${e.percent}%`)
    .slice(0, 3)
    .join(" · ");
}

type Props = {
  person: AlumniLegacyPerson;
  selected: boolean;
  onSelect: () => void;
};

export function AlumniPortraitCard({ person, selected, onSelect }: Props) {
  const portalReady = Boolean(person.activated_user_id);
  const exams = examSummary(person);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative w-full overflow-hidden text-left transition-[transform,box-shadow] duration-300 ${
        selected
          ? "scale-[1.01] shadow-[0_18px_50px_-28px_rgba(20,53,44,0.55)]"
          : "hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-28px_rgba(20,53,44,0.4)]"
      }`}
    >
      <div
        className={`relative border bg-[linear-gradient(165deg,#f7faf8_0%,#eef3f0_48%,#e4ebe6_100%)] p-[3px] ${
          selected ? "border-pine" : "border-pine/25"
        }`}
      >
        <div className="relative border border-pine/20 px-4 pb-4 pt-5 sm:px-5">
          <div
            className="pointer-events-none absolute inset-x-6 top-3 h-px bg-gradient-to-r from-transparent via-celadon/50 to-transparent"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-6 bottom-3 h-px bg-gradient-to-r from-transparent via-pine/25 to-transparent"
            aria-hidden
          />

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-celadon">
                School of Disciples
              </p>
              <p className="mt-1 text-[0.7rem] tracking-[0.12em] text-ink/45">
                {person.batch_label}
              </p>
            </div>
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-pine/30 bg-pine text-sm font-medium tracking-wide text-mist"
              aria-hidden
            >
              {initials(person.display_name)}
            </div>
          </div>

          <h3 className="mt-5 font-display text-[1.35rem] leading-tight tracking-[-0.02em] text-pine sm:text-[1.5rem]">
            {person.display_name}
          </h3>

          <dl className="mt-4 space-y-1.5 text-sm text-ink/70">
            {person.centre ? (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
                  Centre
                </dt>
                <dd className="min-w-0 break-words">{person.centre}</dd>
              </div>
            ) : null}
            {person.student_id || person.legacy_ref ? (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
                  ID
                </dt>
                <dd className="min-w-0 break-all font-mono text-[0.8rem] text-ink/75">
                  {person.student_id || person.legacy_ref}
                </dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
                Email
              </dt>
              <dd className="min-w-0 break-all">
                {person.email ?? (
                  <span className="text-ink/40">Not assigned</span>
                )}
              </dd>
            </div>
            {exams ? (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
                  Exams
                </dt>
                <dd className="min-w-0">{exams}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] ${
                portalReady
                  ? "bg-pine text-mist"
                  : "border border-pine/25 text-pine/80"
              }`}
            >
              {portalReady ? "Portal ready" : "Awaiting email"}
            </span>
            {person.tuition_covered || person.tuition_paid_gbp > 0 ? (
              <span className="inline-flex items-center border border-celadon/35 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                {person.tuition_covered
                  ? "Tuition covered"
                  : `£${Number(person.tuition_paid_gbp).toFixed(0)} paid`}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
