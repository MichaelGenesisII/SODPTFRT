"use client";

import Link from "next/link";
import {
  formatClassScheduleRange,
  type ZoomClass,
} from "@/lib/classes/types";
import {
  TEACHING_DELIVERY_STATUS_META,
  type TeachingDeliveryStatus,
} from "@/lib/teacher/types";

export function TeacherClassesList({
  classes,
  compact = false,
}: {
  classes: ZoomClass[];
  compact?: boolean;
}) {
  if (classes.length === 0) {
    return (
      <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center">
        <p className="font-display text-lg text-pine">
          No classes assigned to you yet
        </p>
        <p className="mt-2 text-sm text-ink/55">
          The desk will assign sessions when you are scheduled to teach.
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <ul className="space-y-2">
        {classes.map((item) => (
          <ClassCard key={item.id} item={item} />
        ))}
      </ul>
    );
  }

  const now = Date.now();
  const upcoming = classes.filter(
    (c) =>
      new Date(c.scheduled_end).getTime() >= now && c.status !== "cancelled",
  );
  const past = classes.filter(
    (c) =>
      new Date(c.scheduled_end).getTime() < now || c.status === "cancelled",
  );

  return (
    <div className="space-y-8">
      <ClassGroup title="Upcoming" items={upcoming} />
      <ClassGroup title="Past" items={past} />
    </div>
  );
}

function ClassGroup({ title, items }: { title: string; items: ZoomClass[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="font-display text-xl text-pine">{title}</h2>
        <span className="text-sm tabular-nums text-ink/40">{items.length}</span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <ClassCard key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ClassCard({ item }: { item: ZoomClass }) {
  const status = (item.teaching_delivery_status ??
    "scheduled") as TeachingDeliveryStatus;
  const meta = TEACHING_DELIVERY_STATUS_META[status];

  return (
    <li>
      <Link
        href={`/teacher/classes/${item.id}`}
        prefetch={false}
        className="group flex items-start justify-between gap-4 border border-stone/80 bg-white/55 px-4 py-4 transition-colors hover:border-pine/35 hover:bg-white"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink group-hover:text-pine">
            {item.title}
          </span>
          <span className="mt-1.5 block text-sm text-ink/55">
            {formatClassScheduleRange(item.scheduled_start, item.scheduled_end)}
          </span>
          <span className="mt-2 inline-flex border border-stone px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/50">
            {meta?.label ?? status}
          </span>
        </span>
        <span
          className="mt-1 shrink-0 text-pine/35 transition-colors group-hover:text-pine"
          aria-hidden
        >
          →
        </span>
      </Link>
    </li>
  );
}
