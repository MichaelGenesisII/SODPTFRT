import type { Metadata } from "next";
import Link from "next/link";
import { listTeacherHistory } from "@/app/teacher/classes/actions";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "History | Teacher Portal",
};

export default async function TeacherHistoryPage() {
  let rows: Awaited<ReturnType<typeof listTeacherHistory>> = [];
  let loadError: string | null = null;

  try {
    rows = await listTeacherHistory();
  } catch (error) {
    console.error("[teacher/history]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("History"),
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Teaching
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          History
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/65">
          Sessions you were credited for, and their delivery status. Pay amounts
          are not shown here.
        </p>
      </section>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center">
          <p className="font-display text-lg text-pine">No teaching history yet</p>
          <p className="mt-2 text-sm text-ink/55">
            Confirmed and scheduled deliveries will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
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
