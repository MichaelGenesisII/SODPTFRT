"use client";

import Link from "next/link";
import { useState } from "react";
import {
  downloadClassRollCsv,
  type ClassAttendanceRollup,
  type ClassRollRow,
} from "@/lib/admin/class-roll";
import { formatDuration, type AttendanceSource } from "@/lib/classes/types";

type RollLane = "attended" | "absent";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

function sourceLabel(source: AttendanceSource | null): string {
  if (!source) return "—";
  if (source === "zoom") return "Zoom";
  if (source === "code") return "Code";
  return "Manual";
}

function FeePills({ row }: { row: ClassRollRow }) {
  return (
    <div className="flex flex-wrap gap-1">
      <span
        className={`border px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.08em] ${
          row.tuition_paid
            ? "border-pine/25 text-pine"
            : "border-stone text-ink/40"
        }`}
      >
        Tuition {row.tuition_paid ? "paid" : "due"}
      </span>
      <span
        className={`border px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.08em] ${
          row.graduation_paid
            ? "border-pine/25 text-pine"
            : "border-stone text-ink/40"
        }`}
      >
        Grad {row.graduation_paid ? "paid" : "due"}
      </span>
    </div>
  );
}

function RollRow({
  row,
  showDuration,
}: {
  row: ClassRollRow;
  showDuration: boolean;
}) {
  return (
    <li>
      <div className="group grid items-center gap-3 px-3 py-3 transition-colors hover:bg-white/70 sm:px-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_5.5rem_2rem]">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center bg-stone/70 text-xs font-medium text-pine group-hover:bg-pine group-hover:text-mist">
            {initials(row.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink group-hover:text-pine">
              {row.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink/50">{row.email}</p>
          </div>
        </div>

        <div className="hidden min-w-0 md:block">
          <FeePills row={row} />
          <p className="mt-1 truncate text-[0.65rem] text-ink/45">
            {sourceLabel(row.source)}
          </p>
        </div>

        <div className="hidden md:block">
          {showDuration && row.source === "zoom" ? (
            <p className="text-sm tabular-nums text-ink/70">
              {formatDuration(row.duration_seconds ?? 0)}
            </p>
          ) : row.source === "zoom" ? (
            <p className="text-sm text-ink/40">—</p>
          ) : (
            <p className="text-xs text-ink/45">{sourceLabel(row.source)}</p>
          )}
          {showDuration && row.source === "zoom" ? (
            <p className="text-[0.65rem] tabular-nums text-ink/40">
              / {formatDuration(row.required_seconds ?? 0)}
            </p>
          ) : null}
        </div>

        <div className="hidden md:block">
          <span
            className={`inline-block border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] ${
              row.present
                ? "border-celadon/40 text-celadon"
                : "border-stone text-ink/40"
            }`}
          >
            {row.present ? "Present" : "Absent"}
          </span>
        </div>

        <Link
          href={`/admin/students/${row.user_id}`}
          className="hidden justify-self-end text-pine/40 transition group-hover:text-pine md:flex"
          aria-label={`Open ${row.name} student file`}
        >
          →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-stone/60 px-3 pb-3 md:hidden">
        <FeePills row={row} />
        {showDuration && row.source === "zoom" ? (
          <span className="text-xs tabular-nums text-ink/50">
            {formatDuration(row.duration_seconds ?? 0)} /{" "}
            {formatDuration(row.required_seconds ?? 0)}
          </span>
        ) : null}
        <Link
          href={`/admin/records/${row.user_id}`}
          className="text-xs font-medium text-pine"
        >
          Scorecard →
        </Link>
        <Link
          href={`/admin/students/${row.user_id}`}
          className="text-xs font-medium text-pine"
        >
          Student file →
        </Link>
      </div>
    </li>
  );
}

export function ClassAttendancePanel({
  rollup,
  classTitle,
  lastSyncedAt,
}: {
  rollup: ClassAttendanceRollup;
  classTitle: string;
  lastSyncedAt?: string | null;
}) {
  const [lane, setLane] = useState<RollLane>("attended");
  const rows = lane === "attended" ? rollup.attended : rollup.absent;
  const slug = classTitle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);

  return (
    <section className="border-t border-stone bg-mist/20">
      <div className="border-b border-stone bg-white/50 px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Roll call
            </p>
            <h3 className="mt-0.5 font-display text-xl text-pine">
              Attendance ledger
            </h3>
            <p className="mt-1 text-sm text-ink/55">
              {rollup.attended.length} attended · {rollup.absent.length} did
              not · {rollup.expected_total} expected
              {rollup.unmatched.length
                ? ` · ${rollup.unmatched.length} unmatched Zoom`
                : ""}
            </p>
            {lastSyncedAt ? (
              <p className="mt-1 text-xs text-ink/45">
                Last Zoom sync{" "}
                {new Date(lastSyncedAt).toLocaleString("en-GB")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                downloadClassRollCsv(rollup.attended, `${slug}-attended-${new Date().toISOString().slice(0, 10)}.csv`)
              }
              disabled={rollup.attended.length === 0}
              className="border border-pine/30 px-3 py-2 text-xs font-medium text-pine transition hover:border-pine disabled:opacity-40"
            >
              Export attended
            </button>
            <button
              type="button"
              onClick={() =>
                downloadClassRollCsv(rollup.absent, `${slug}-absent-${new Date().toISOString().slice(0, 10)}.csv`)
              }
              disabled={rollup.absent.length === 0}
              className="border border-stone px-3 py-2 text-xs font-medium text-ink/70 transition hover:border-pine hover:text-pine disabled:opacity-40"
            >
              Export absent
            </button>
          </div>
        </div>

        <nav
          className="mt-4 flex gap-1 overflow-x-auto border-b border-stone pb-px"
          aria-label="Attendance lanes"
        >
          {(
            [
              {
                id: "attended" as const,
                label: "Attended",
                count: rollup.attended.length,
              },
              {
                id: "absent" as const,
                label: "Did not attend",
                count: rollup.absent.length,
              },
            ] as const
          ).map((tab) => {
            const active = lane === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLane(tab.id)}
                className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                  active ? "text-pine" : "text-ink/50 hover:text-ink/80"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 tabular-nums text-ink/35">
                  {tab.count}
                </span>
                <span
                  className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden
                />
              </button>
            );
          })}
        </nav>
      </div>

      <div className="hidden border-b border-stone bg-white/40 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_5.5rem_2rem] md:gap-3">
        <span>Student</span>
        <span>Fees · source</span>
        <span>Duration</span>
        <span>Mark</span>
        <span />
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="font-display text-lg text-pine">
            {lane === "attended"
              ? "No one marked present yet"
              : "Everyone expected attended"}
          </p>
          <p className="mt-2 text-sm text-ink/55">
            {lane === "attended"
              ? "Share the check-in code, sync Zoom, or mark students manually above."
              : "Absent list fills from the class audience minus present marks."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-stone">
          {rows.map((row) => (
            <RollRow key={row.user_id} row={row} showDuration />
          ))}
        </ul>
      )}

      {rollup.unmatched.length > 0 ? (
        <div className="border-t border-stone px-3 py-4 sm:px-6">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
            Unmatched Zoom participants
          </p>
          <p className="mt-1 text-sm text-ink/55">
            These joined via Zoom but could not be tied to a student profile.
          </p>
          <ul className="mt-3 divide-y divide-stone border border-stone">
            {rollup.unmatched.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="truncate text-xs text-ink/50">{row.email}</p>
                </div>
                <div className="text-right text-xs">
                  <p className={row.present ? "text-celadon" : "text-ink/40"}>
                    {row.present ? "Present" : "Absent"} · {row.source}
                  </p>
                  {row.source === "zoom" ? (
                    <p className="tabular-nums text-ink/50">
                      {formatDuration(row.duration_seconds)} /{" "}
                      {formatDuration(row.required_seconds)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
