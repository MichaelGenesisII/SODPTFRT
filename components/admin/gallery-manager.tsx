"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  deleteGallerySelfie,
  flagGallerySelfie,
  restoreGallerySelfie,
  takeDownGallerySelfie,
  type AdminGalleryItem,
} from "@/app/admin/gallery/actions";
import { useRefreshOnVisible } from "@/components/student/use-refresh-on-visible";
import { useToast } from "@/components/ui/toast";

type FilterTab = "all" | "flagged" | "taken_down";

type Props = {
  items: AdminGalleryItem[];
  flaggedCount: number;
  takenDownCount: number;
  national: boolean;
};

export function AdminGalleryManager({
  items,
  flaggedCount,
  takenDownCount,
  national,
}: Props) {
  useRefreshOnVisible();
  const [tab, setTab] = useState<FilterTab>(
    flaggedCount > 0 ? "flagged" : "all",
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();

  const rows = useMemo(() => {
    if (tab === "flagged") {
      return items.filter((i) => i.moderationStatus === "flagged");
    }
    if (tab === "taken_down") {
      return items.filter((i) => i.moderationStatus === "taken_down");
    }
    return items;
  }, [items, tab]);

  function run(
    action: () => Promise<{ ok: boolean; message: string }>,
    clearNote = true,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        error(result.message);
        return;
      }
      success(result.message);
      if (clearNote) setNote("");
      setOpenId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-3 gap-px border border-stone bg-stone sm:gap-0 sm:bg-mist/50">
        <MiniStat label="Portraits" value={String(items.length)} />
        <MiniStat label="Flagged" value={String(flaggedCount)} />
        <MiniStat label="Taken down" value={String(takenDownCount)} />
      </div>

      <nav
        className="grid grid-cols-3 border border-stone bg-mist/40 sm:flex sm:gap-1 sm:border-0 sm:border-b sm:bg-transparent sm:pb-px"
        aria-label="Gallery filters"
      >
        {(
          [
            ["all", "All", items.length],
            ["flagged", "Flagged", flaggedCount],
            ["taken_down", "Taken down", takenDownCount],
          ] as const
        ).map(([id, label, count]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setOpenId(null);
                setNote("");
              }}
              className={`relative min-h-12 px-2 py-3 text-center text-sm font-medium tracking-wide transition-colors sm:min-h-0 sm:shrink-0 sm:px-3 sm:py-2 sm:text-left ${
                active
                  ? "bg-mist text-pine sm:bg-transparent"
                  : "text-ink/50 hover:text-ink/80"
              }`}
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                {label}
                <span className="tabular-nums text-[0.65rem] text-ink/40">
                  {count}
                </span>
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

      <section className="border border-stone bg-mist">
        <div className="border-b border-stone px-4 py-4 sm:px-5 sm:py-5">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
            {national ? "Network" : "Parish"} gallery
          </p>
          <h2 className="mt-1.5 font-display text-xl text-pine sm:text-2xl">
            Graduation selfies
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
            Tap a portrait to flag, take down with a reason, restore, or delete.
          </p>
        </div>

        <div className="px-3 py-4 sm:px-5 sm:py-5">
          {rows.length === 0 ? (
            <p className="border border-dashed border-stone px-4 py-10 text-center text-sm text-ink/50">
              No portraits in this view.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {rows.map((item) => {
                const open = openId === item.userId;
                return (
                  <li
                    key={item.userId}
                    className={
                      open
                        ? "col-span-2 sm:col-span-3 lg:col-span-4"
                        : undefined
                    }
                  >
                    <div
                      className={
                        open
                          ? "grid gap-3 border border-pine/30 bg-white/40 p-2 sm:grid-cols-[minmax(0,12rem)_1fr] sm:gap-4 sm:p-3 md:grid-cols-[minmax(0,14rem)_1fr]"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(open ? null : item.userId);
                          setNote(item.moderationNote ?? "");
                        }}
                        aria-expanded={open}
                        className={`group relative overflow-hidden border text-left transition-colors ${
                          open
                            ? "border-pine"
                            : "border-stone hover:border-pine/40"
                        }`}
                      >
                        <div className="aspect-[3/4] overflow-hidden bg-pine/5">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={`Graduation selfie of ${item.displayName}`}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-stone text-xs text-ink/40">
                              Removed
                            </span>
                          )}
                        </div>
                        <div className="absolute inset-x-0 top-0 flex justify-between gap-1 p-1.5 sm:p-2">
                          <span
                            className={`px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] ${
                              item.moderationStatus === "flagged"
                                ? "bg-[#efe8dc] text-[#6b4f2a]"
                                : item.moderationStatus === "taken_down"
                                  ? "bg-red-50 text-red-900"
                                  : "bg-mist/90 text-pine"
                            }`}
                          >
                            {statusLabel(item.moderationStatus)}
                          </span>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 bg-pine/90 px-2 py-2 sm:px-3 sm:py-2.5">
                          <p className="truncate font-display text-sm leading-snug text-mist sm:text-base">
                            {item.displayName}
                          </p>
                          <p className="mt-0.5 truncate text-[0.6rem] uppercase tracking-[0.08em] text-mist/65">
                            {item.batchLabel || "Batch"}
                            {national && item.parishName
                              ? ` · ${item.parishName}`
                              : ""}
                          </p>
                        </div>
                      </button>

                      {open ? (
                        <div className="space-y-3 px-1 py-1 sm:px-0 sm:py-0">
                          <div>
                            <p className="font-display text-lg text-pine">
                              {item.displayName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-ink/50">
                              {item.email}
                              {national && item.parishName
                                ? ` · ${item.parishName}`
                                : ""}
                            </p>
                          </div>
                          {item.moderationNote ? (
                            <p className="text-sm text-ink/65">
                              Last note: {item.moderationNote}
                            </p>
                          ) : null}
                          <label className="block text-sm font-medium text-ink">
                            Reason / note
                            <textarea
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              rows={2}
                              maxLength={500}
                              placeholder="Why this action is needed"
                              className="mt-2 w-full border border-stone bg-mist/40 px-3 py-2 text-sm outline-none focus:border-pine"
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {item.moderationStatus !== "flagged" &&
                            item.path ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    flagGallerySelfie(item.userId, note),
                                  )
                                }
                                className="border border-[#c4a574] px-3 py-2 text-sm font-medium text-[#6b4f2a] disabled:opacity-60"
                              >
                                Flag
                              </button>
                            ) : null}
                            {item.moderationStatus !== "taken_down" &&
                            item.path ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    takeDownGallerySelfie(item.userId, note),
                                  )
                                }
                                className="border border-pine/30 px-3 py-2 text-sm font-medium text-pine disabled:opacity-60"
                              >
                                Take down
                              </button>
                            ) : null}
                            {item.moderationStatus !== "visible" &&
                            item.path ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    restoreGallerySelfie(item.userId),
                                  )
                                }
                                className="border border-stone px-3 py-2 text-sm font-medium text-ink/70 disabled:opacity-60"
                              >
                                Restore
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run(() =>
                                  deleteGallerySelfie(item.userId, note),
                                )
                              }
                              className="border border-red-800/30 px-3 py-2 text-sm font-medium text-red-900 disabled:opacity-60"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenId(null)}
                              className="border border-stone px-3 py-2 text-sm text-ink/55"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function statusLabel(status: AdminGalleryItem["moderationStatus"]) {
  if (status === "flagged") return "Flagged";
  if (status === "taken_down") return "Taken down";
  return "Visible";
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-mist/80 px-2.5 py-3 sm:bg-transparent sm:px-4 sm:py-3">
      <p className="text-[0.58rem] uppercase tracking-[0.1em] text-ink/40 sm:text-[0.6rem] sm:tracking-[0.12em]">
        {label}
      </p>
      <p className="mt-0.5 font-display text-lg tabular-nums text-pine sm:text-xl">
        {value}
      </p>
    </div>
  );
}
