"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TeacherClassesList } from "@/components/teacher/teacher-classes";
import type { ZoomClass } from "@/lib/classes/types";
import type { TeachingDeliveryStatus } from "@/lib/teacher/types";

export type TeacherHistoryRow = {
  class_id: string;
  title: string;
  scheduled_start: string;
  status: TeachingDeliveryStatus;
  status_label: string;
  confirmed_at: string | null;
};

type Panel = "schedule" | "history";

export function TeacherClassesDesk({
  classes,
  history,
  classesError,
  historyError,
}: {
  classes: ZoomClass[];
  history: TeacherHistoryRow[];
  classesError: string | null;
  historyError: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const panel: Panel =
    searchParams.get("panel") === "history" ? "history" : "schedule";

  function setPanel(next: Panel) {
    const href =
      next === "history"
        ? "/teacher/classes?panel=history"
        : "/teacher/classes";
    router.replace(href, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Teaching
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Classes
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/65">
          Your assigned schedule and teaching history in one place. Open a class
          for the register and join details.
        </p>

        <div
          className="mt-5 flex gap-1 border border-stone/80 bg-white/40 p-1"
          role="tablist"
          aria-label="Classes sections"
        >
          <PanelTab
            selected={panel === "schedule"}
            onSelect={() => setPanel("schedule")}
            label="Schedule"
            count={classes.length}
          />
          <PanelTab
            selected={panel === "history"}
            onSelect={() => setPanel("history")}
            label="History"
            count={history.length}
          />
        </div>
      </section>

      {panel === "schedule" ? (
        classesError ? (
          <div
            className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
            role="alert"
          >
            {classesError}
          </div>
        ) : (
          <TeacherClassesList classes={classes} />
        )
      ) : historyError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {historyError}
        </div>
      ) : history.length === 0 ? (
        <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center">
          <p className="font-display text-lg text-pine">
            No teaching history yet
          </p>
          <p className="mt-2 text-sm text-ink/55">
            Confirmed and scheduled deliveries will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {history.map((row) => (
            <li key={row.class_id}>
              <Link
                href={`/teacher/classes/${row.class_id}`}
                prefetch={false}
                className="group flex items-start justify-between gap-4 border border-stone/80 bg-white/55 px-4 py-4 transition-colors hover:border-pine/35 hover:bg-white"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink group-hover:text-pine">
                    {row.title}
                  </span>
                  <span className="mt-1.5 block text-sm text-ink/55">
                    {row.scheduled_start
                      ? new Date(row.scheduled_start).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </span>
                  <span className="mt-2 inline-flex border border-stone px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/50">
                    {row.status_label}
                  </span>
                </span>
                <span
                  className="mt-1 shrink-0 text-pine/35 group-hover:text-pine"
                  aria-hidden
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PanelTab({
  selected,
  onSelect,
  label,
  count,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 px-3 text-sm font-medium transition-colors ${
        selected
          ? "bg-pine text-mist"
          : "text-ink/60 hover:bg-white/70 hover:text-pine"
      }`}
    >
      {label}
      <span
        className={`tabular-nums text-[0.7rem] ${
          selected ? "text-mist/70" : "text-ink/35"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
