"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  createBatch,
  createParish,
  deleteBatch,
  deleteParish,
  retireBatch,
  setBatchEnrolmentOpen,
  updateBatch,
  updateParish,
  type ParishActionResult,
} from "@/app/admin/parishes/actions";
import { useToast } from "@/components/ui/toast";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";

const fieldClass =
  "w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none transition-[border-color,background-color] duration-300 focus:border-pine focus:bg-mist";

const PARISHES_PAGE_SIZE = 8;

type DeskPanel = "batches" | "details" | "add-parish";
type PageView = "desk" | "insight";

type ParishesManagerProps = {
  profile: AdminProfile;
  parishes: Parish[];
  batches: Batch[];
};

function StatTile({
  label,
  shortLabel,
  value,
  hint,
}: {
  label: string;
  shortLabel?: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-stone/50 bg-white px-2 py-2.5 text-center shadow-[0_10px_24px_-12px_rgba(20,53,44,0.32),0_2px_6px_-3px_rgba(20,53,44,0.1)] sm:flex-row sm:items-center sm:gap-3.5 sm:px-0 sm:py-3.5 sm:pl-3.5 sm:pr-4 sm:text-left sm:shadow-[0_12px_30px_-12px_rgba(20,53,44,0.35),0_2px_8px_-4px_rgba(20,53,44,0.12)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine sm:h-12 sm:w-12">
        <span className="font-display text-[1.25rem] leading-none tracking-[-0.03em] text-mist tabular-nums sm:text-[1.55rem]">
          {value}
        </span>
      </div>
      <div className="min-w-0 sm:flex-1 sm:border-l sm:border-stone/70 sm:pl-3.5">
        <p className="truncate text-[0.7rem] font-medium leading-tight text-pine sm:text-sm">
          <span className="sm:hidden">{shortLabel ?? label}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="mt-0.5 hidden truncate text-xs leading-snug text-ink/50 sm:block">
          {hint}
        </p>
      </div>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 11V8a4 4 0 1 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="6"
        y="11"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function UnlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 11V8a4 4 0 0 1 7.5-1.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="6"
        y="11"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function ParishesManager({
  profile,
  parishes,
  batches,
}: ParishesManagerProps) {
  const router = useRouter();
  const national = isNationalAdmin(profile);
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selectedParishId, setSelectedParishId] = useState(
    profile.parish_id || parishes[0]?.id || "",
  );
  const [panel, setPanel] = useState<DeskPanel>("batches");
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [addingBatch, setAddingBatch] = useState(false);
  const [filterOpenOnly, setFilterOpenOnly] = useState(false);
  const [pageView, setPageView] = useState<PageView>("desk");
  const [page, setPage] = useState(1);
  /** Mobile: show directory or workspace one at a time. Desktop (lg+) shows both. */
  const [mobileSurface, setMobileSurface] = useState<"directory" | "workspace">(
    () =>
      profile.parish_id || parishes.length === 1 ? "workspace" : "directory",
  );

  useEffect(() => {
    if (
      selectedParishId &&
      parishes.some((p) => p.id === selectedParishId)
    ) {
      return;
    }
    setSelectedParishId(profile.parish_id || parishes[0]?.id || "");
  }, [parishes, selectedParishId, profile.parish_id]);

  const selectedParish = useMemo(
    () => parishes.find((p) => p.id === selectedParishId) ?? null,
    [parishes, selectedParishId],
  );

  const openBatchCount = useMemo(
    () => batches.filter((b) => b.enrolment_open && b.is_active).length,
    [batches],
  );

  const batchesByParish = useMemo(() => {
    const map = new Map<string, { total: number; open: number }>();
    for (const batch of batches) {
      const current = map.get(batch.parish_id) ?? { total: 0, open: 0 };
      current.total += 1;
      if (batch.enrolment_open && batch.is_active) current.open += 1;
      map.set(batch.parish_id, current);
    }
    return map;
  }, [batches]);

  const filteredParishes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parishes.filter((parish) => {
      if (!q) return true;
      return [parish.name, parish.region, parish.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [parishes, query]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredParishes.length / PARISHES_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PARISHES_PAGE_SIZE;
  const pageParishes = filteredParishes.slice(
    pageStart,
    pageStart + PARISHES_PAGE_SIZE,
  );
  const rangeFrom = filteredParishes.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(
    pageStart + PARISHES_PAGE_SIZE,
    filteredParishes.length,
  );

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const parishBatches = useMemo(() => {
    const rows = batches.filter((b) => b.parish_id === selectedParishId);
    if (!filterOpenOnly) return rows;
    return rows.filter((b) => b.enrolment_open);
  }, [batches, selectedParishId, filterOpenOnly]);

  useEffect(() => {
    setExpandedBatchId(null);
    setAddingBatch(false);
    if (panel === "add-parish") return;
    setPanel("batches");
  }, [selectedParishId]);

  function run(action: () => Promise<ParishActionResult>) {
    startTransition(async () => {
      const next = await action();
      if (next.ok) {
        success(next.message, "Parishes & batches");
        if (next.parishId) {
          setSelectedParishId(next.parishId);
          setPanel("batches");
          setMobileSurface("workspace");
        }
        router.refresh();
      } else {
        error(next.message, "Parishes & batches");
      }
    });
  }

  function selectParish(id: string) {
    setSelectedParishId(id);
    setPanel("batches");
    setMobileSurface("workspace");
  }

  function openNewParish() {
    setPanel("add-parish");
    setMobileSurface("workspace");
  }

  function backToDirectory() {
    setPanel("batches");
    setMobileSurface("directory");
  }

  function goToPage(next: number) {
    setPage(Math.min(totalPages, Math.max(1, next)));
  }

  const tabs: {
    id: DeskPanel;
    label: string;
    shortLabel: string;
    show: boolean;
  }[] = [
    {
      id: "batches",
      label: "Batches",
      shortLabel: "Batches",
      show: Boolean(selectedParish),
    },
    {
      id: "details",
      label: "Parish settings",
      shortLabel: "Settings",
      show: Boolean(selectedParish),
    },
    {
      id: "add-parish",
      label: "New parish",
      shortLabel: "New",
      show: national,
    },
  ];

  const directoryClass =
    mobileSurface === "directory" ? "block" : "hidden lg:block";
  const workspaceClass =
    mobileSurface === "workspace" ? "block" : "hidden lg:block";

  return (
    <div className="space-y-3 sm:space-y-4">
      <section className="grid grid-cols-3 gap-2 sm:gap-3.5">
        <StatTile
          label="Parishes"
          value={parishes.length}
          hint={national ? "On the UK network" : "Your desk"}
        />
        <StatTile
          label="Open batches"
          shortLabel="Open"
          value={openBatchCount}
          hint="Visible on enrol"
        />
        <StatTile
          label="All batches"
          shortLabel="Batches"
          value={batches.length}
          hint="Every course run"
        />
      </section>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
        aria-label="Parishes page"
      >
        {(
          [
            { id: "desk" as const, label: "Desk" },
            { id: "insight" as const, label: "Insight" },
          ] as const
        ).map((tab) => {
          const active = pageView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPageView(tab.id)}
              className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                active ? "text-pine" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              {tab.label}
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

      {pageView === "insight" ? (
        <InsightGuide national={national} />
      ) : (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-4 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        {/* Parish rail */}
        <aside className={`${directoryClass} border border-stone bg-mist/50`}>
          <div className="border-b border-stone px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.55rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                Directory
              </p>
              <p className="text-[0.65rem] tabular-nums text-ink/40">
                {filteredParishes.length === 0
                  ? `0/${parishes.length}`
                  : `${rangeFrom}–${rangeTo}/${parishes.length}`}
              </p>
            </div>
            <label className="mt-1.5 block">
              <span className="sr-only">Search parishes</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search parish or region…"
                className="w-full border border-stone bg-white/70 px-2 py-1 text-sm outline-none placeholder:text-ink/35 focus:border-pine focus:bg-mist"
              />
            </label>
            {national ? (
              <button
                type="button"
                onClick={openNewParish}
                className={`mt-1.5 w-full border px-2 py-1 text-sm font-medium transition ${
                  panel === "add-parish"
                    ? "border-pine bg-pine text-mist"
                    : "border-pine/30 text-pine hover:border-pine"
                }`}
              >
                + New parish
              </button>
            ) : null}
          </div>

          <ul className="max-h-[min(55vh,24rem)] overflow-y-auto overscroll-contain lg:max-h-[min(70vh,36rem)]">
            {filteredParishes.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink/50">
                {parishes.length === 0
                  ? "No parishes yet."
                  : "No match for that search."}
              </li>
            ) : (
              pageParishes.map((parish) => {
                const active =
                  parish.id === selectedParishId && panel !== "add-parish";
                const counts = batchesByParish.get(parish.id) ?? {
                  total: 0,
                  open: 0,
                };
                return (
                  <li key={parish.id} className="border-b border-stone/70">
                    <button
                      type="button"
                      onClick={() => selectParish(parish.id)}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
                        active
                          ? "bg-pine text-mist"
                          : "hover:bg-mist"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center text-[0.55rem] font-medium uppercase tracking-wide ${
                          active
                            ? "bg-mist/15 text-mist"
                            : parish.is_active
                              ? "bg-pine text-mist"
                              : "bg-stone text-ink/45"
                        }`}
                      >
                        {parish.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-1.5">
                          <span className="truncate text-[0.8125rem] font-medium leading-tight">
                            {parish.name}
                          </span>
                          <span
                            className={`shrink-0 text-[0.55rem] uppercase tracking-[0.08em] tabular-nums ${
                              active ? "text-mist/65" : "text-ink/40"
                            }`}
                          >
                            {counts.open}/{counts.total}
                          </span>
                        </span>
                        <span
                          className={`mt-px block truncate text-[0.65rem] leading-tight ${
                            active ? "text-mist/60" : "text-ink/45"
                          }`}
                        >
                          {parish.region || "No region"}
                          {!parish.is_active ? " · retired" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-stone px-2 py-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => goToPage(currentPage - 1)}
                className="border border-pine/25 px-2 py-1 text-[0.7rem] font-medium text-pine transition-colors hover:border-pine disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <p className="text-[0.65rem] tabular-nums text-ink/55">
                {currentPage}/{totalPages}
              </p>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => goToPage(currentPage + 1)}
                className="border border-pine/25 px-2 py-1 text-[0.7rem] font-medium text-pine transition-colors hover:border-pine disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </aside>

        {/* Workspace */}
        <section
          className={`${workspaceClass} min-h-[16rem] border border-stone bg-mist sm:min-h-[22rem]`}
        >
          {panel === "add-parish" && national ? (
            <div key="add-parish" className="animate-panel-in px-3 py-4 sm:px-5 sm:py-5">
              <button
                type="button"
                onClick={backToDirectory}
                className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
              >
                <span aria-hidden>←</span> Directory
              </button>
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
                New on the map
              </p>
              <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
                Add a parish
              </h2>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Name it clearly for the enrol dropdown. You can open batches
                once it’s saved.
              </p>
              <form
                className="mt-4 grid max-w-lg gap-2.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const fd = new FormData(form);
                  run(async () => {
                    const result = await createParish(fd);
                    if (result.ok) form.reset();
                    return result;
                  });
                }}
              >
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-ink/45">
                    Parish name
                  </label>
                  <input
                    name="name"
                    required
                    placeholder="e.g. London Central"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-ink/45">
                    Region
                  </label>
                  <input
                    name="region"
                    placeholder="Optional — London, North West…"
                    className={fieldClass}
                  />
                </div>
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
                  <button
                    type="submit"
                    disabled={pending}
                    className="bg-pine px-5 py-3 text-sm font-medium text-mist transition hover:bg-celadon disabled:opacity-60"
                  >
                    Create parish
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedParish) {
                        setPanel("batches");
                        setMobileSurface("workspace");
                      } else {
                        backToDirectory();
                      }
                    }}
                    className="border border-stone px-4 py-3 text-sm text-ink/65 transition hover:border-pine"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : !selectedParish ? (
            <div className="flex min-h-[16rem] flex-col items-center justify-center px-4 py-10 text-center sm:min-h-[18rem] sm:px-5 sm:py-12">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-celadon">
                UK network
              </p>
              <p className="mt-2 font-display text-xl text-pine">
                Choose a parish
              </p>
              <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink/60">
                {national
                  ? "Pick one from the directory, or create the first parish to open enrolment."
                  : "Your parish will appear here once assigned."}
              </p>
              {national ? (
                <button
                  type="button"
                  onClick={openNewParish}
                  className="mt-4 border border-pine px-3.5 py-2 text-sm font-medium text-pine transition hover:bg-pine hover:text-mist"
                >
                  + New parish
                </button>
              ) : null}
            </div>
          ) : (
            <div key={selectedParish.id} className="animate-panel-in">
              <header className="relative border-b border-stone px-3 pb-0 pt-2.5 sm:px-5 sm:pt-3">
                <p className="absolute left-3 top-2.5 z-10 text-[0.7rem] font-medium tracking-wide text-celadon sm:left-5 sm:top-3">
                  Region: {selectedParish.region || "—"}
                </p>
                <button
                  type="button"
                  onClick={backToDirectory}
                  className="mb-1.5 mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-pine lg:hidden"
                >
                  <span aria-hidden>←</span> All parishes
                </button>
                <div className="mt-2 flex items-start justify-between gap-3 lg:mt-5">
                  <div className="min-w-0">
                    <h2 className="font-display text-[clamp(1.15rem,3.5vw,1.55rem)] tracking-[-0.02em] text-pine break-words leading-tight">
                      {selectedParish.name}
                    </h2>
                    <p className="mt-0.5 text-[0.7rem] text-ink/55 sm:text-xs">
                      {selectedParish.is_active
                        ? "Listed on enrol — applicants can pick this parish"
                        : "Retired from enrol — enrolled students keep access"}
                    </p>
                  </div>
                  <p className="shrink-0 pt-0.5 text-right text-[0.7rem] text-ink/50 sm:text-xs">
                    <span className="font-medium text-pine tabular-nums">
                      {batchesByParish.get(selectedParish.id)?.open ?? 0}
                    </span>{" "}
                    open ·{" "}
                    <span className="tabular-nums">
                      {batchesByParish.get(selectedParish.id)?.total ?? 0}
                    </span>{" "}
                    total
                  </p>
                </div>

                <nav
                  className="-mx-3 mt-2.5 flex gap-1 overflow-x-auto border-b border-stone px-3 pb-px sm:-mx-5 sm:px-5"
                  aria-label="Parish workspace"
                >
                  {tabs
                    .filter((tab) => tab.show && tab.id !== "add-parish")
                    .map((tab) => {
                      const active = panel === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setPanel(tab.id)}
                          className={`relative shrink-0 px-2.5 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                            active
                              ? "text-pine"
                              : "text-ink/45 hover:text-ink/75"
                          }`}
                        >
                          <span className="sm:hidden">{tab.shortLabel}</span>
                          <span className="hidden sm:inline">{tab.label}</span>
                          <span
                            className={`absolute inset-x-1.5 bottom-0 h-0.5 bg-celadon transition-opacity ${
                              active ? "opacity-100" : "opacity-0"
                            }`}
                            aria-hidden
                          />
                        </button>
                      );
                    })}
                </nav>
              </header>

              {panel === "batches" ? (
                <div className="px-3 py-2.5 sm:px-5 sm:py-3">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFilterOpenOnly(false)}
                        className={`px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.1em] transition ${
                          !filterOpenOnly
                            ? "bg-pine text-mist"
                            : "border border-stone text-ink/55 hover:border-pine"
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterOpenOnly(true)}
                        className={`px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.1em] transition ${
                          filterOpenOnly
                            ? "bg-pine text-mist"
                            : "border border-stone text-ink/55 hover:border-pine"
                        }`}
                      >
                        Open only
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingBatch((value) => !value);
                        setExpandedBatchId(null);
                      }}
                      className={`w-full border px-2.5 py-1 text-sm font-medium transition sm:w-auto ${
                        addingBatch
                          ? "border-pine bg-pine text-mist"
                          : "border-pine/35 text-pine hover:border-pine"
                      }`}
                    >
                      {addingBatch ? "Close composer" : "+ Add batch"}
                    </button>
                  </div>

                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                      addingBatch ? "mt-4 grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <form
                        className="border border-stone bg-white/60 p-4"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = event.currentTarget;
                          const fd = new FormData(form);
                          run(async () => {
                            const result = await createBatch(fd);
                            if (result.ok) {
                              form.reset();
                              setAddingBatch(false);
                            }
                            return result;
                          });
                        }}
                      >
                        <input
                          type="hidden"
                          name="parishId"
                          value={selectedParish.id}
                        />
                        <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
                          New batch for {selectedParish.name}
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <input
                            name="name"
                            required
                            placeholder="Batch name (e.g. Spring)"
                            className={`${fieldClass} sm:col-span-2`}
                          />
                          <input
                            name="year"
                            type="number"
                            required
                            min={2000}
                            max={2100}
                            defaultValue={new Date().getFullYear()}
                            className={fieldClass}
                          />
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-sm text-ink/70">
                          <input
                            type="checkbox"
                            name="enrolmentOpen"
                            value="1"
                            defaultChecked
                          />
                          Open enrolment now (show on enrol form)
                        </label>
                        <button
                          type="submit"
                          disabled={pending}
                          className="mt-4 bg-pine px-4 py-2.5 text-sm font-medium text-mist disabled:opacity-60"
                        >
                          Create batch
                        </button>
                      </form>
                    </div>
                  </div>

                  <ul className="mt-4 divide-y divide-stone border-y border-stone">
                    {parishBatches.length === 0 ? (
                      <li className="py-10 text-center text-sm text-ink/50">
                        {filterOpenOnly
                          ? "No open batches — turn one on, or show all."
                          : "No batches yet. Add the first course run."}
                      </li>
                    ) : (
                      parishBatches.map((batch) => {
                        const open = expandedBatchId === batch.id;
                        return (
                          <li key={batch.id}>
                            <div className="flex items-center gap-2 py-2.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedBatchId(open ? null : batch.id)
                                }
                                className="min-w-0 flex-1 text-left"
                              >
                                <p className="text-sm font-medium text-ink">
                                  {formatBatchLabel(batch)}
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.1em]">
                                  <span
                                    className={
                                      batch.enrolment_open
                                        ? "text-celadon"
                                        : "text-ink/40"
                                    }
                                  >
                                    {batch.enrolment_open
                                      ? "Enrolment open"
                                      : "Enrolment closed"}
                                  </span>
                                  <span className="text-ink/30">·</span>
                                  <span
                                    className={
                                      batch.is_active
                                        ? "text-ink/45"
                                        : "text-ink/35"
                                    }
                                  >
                                    {batch.is_active
                                      ? "Listed"
                                      : "Retired"}
                                  </span>
                                  <span className="text-ink/30">
                                    · {open ? "Hide edit" : "Edit"}
                                  </span>
                                </p>
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                title={
                                  batch.enrolment_open
                                    ? "Close enrolment"
                                    : "Open enrolment"
                                }
                                aria-label={
                                  batch.enrolment_open
                                    ? "Close enrolment"
                                    : "Open enrolment"
                                }
                                onClick={() =>
                                  run(() =>
                                    setBatchEnrolmentOpen(
                                      batch.id,
                                      !batch.enrolment_open,
                                    ),
                                  )
                                }
                                className={`flex h-8 w-8 shrink-0 items-center justify-center border transition disabled:opacity-60 ${
                                  batch.enrolment_open
                                    ? "border-pine bg-pine text-mist"
                                    : "border-stone text-ink/45 hover:border-pine hover:text-pine"
                                }`}
                              >
                                {batch.enrolment_open ? (
                                  <UnlockIcon className="h-3.5 w-3.5" />
                                ) : (
                                  <LockIcon className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>

                            <div
                              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                              }`}
                            >
                              <div className="overflow-hidden">
                                <form
                                  className="mb-4 border border-stone/80 bg-white/50 p-4"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const fd = new FormData(
                                      event.currentTarget,
                                    );
                                    run(async () => {
                                      const result = await updateBatch(fd);
                                      if (result.ok) setExpandedBatchId(null);
                                      return result;
                                    });
                                  }}
                                >
                                  <input
                                    type="hidden"
                                    name="id"
                                    value={batch.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="enrolmentOpen"
                                    value={batch.enrolment_open ? "1" : "0"}
                                  />
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-ink/45">
                                        Name
                                      </label>
                                      <input
                                        name="name"
                                        defaultValue={batch.name}
                                        required
                                        className={fieldClass}
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-ink/45">
                                        Year
                                      </label>
                                      <input
                                        name="year"
                                        type="number"
                                        defaultValue={batch.year}
                                        required
                                        min={2000}
                                        max={2100}
                                        className={fieldClass}
                                      />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-ink/45">
                                        Enrol listing
                                      </label>
                                      <select
                                        name="isActive"
                                        defaultValue={
                                          batch.is_active ? "1" : "0"
                                        }
                                        className={fieldClass}
                                      >
                                        <option value="1">
                                          Listed — can appear on enrol when open
                                        </option>
                                        <option value="0">
                                          Retired — hidden from enrol; students keep access
                                        </option>
                                      </select>
                                      <p className="mt-1.5 text-xs leading-relaxed text-ink/50">
                                        Enrolment open/closed is the lock button.
                                        Retire hides the batch from the form even if
                                        you reopen later until you list it again.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      type="submit"
                                      disabled={pending}
                                      className="border border-pine px-4 py-2 text-sm font-medium text-pine transition hover:bg-pine hover:text-mist disabled:opacity-60"
                                    >
                                      Save batch
                                    </button>
                                    {batch.enrolment_open || batch.is_active ? (
                                      <button
                                        type="button"
                                        disabled={pending}
                                        onClick={() => {
                                          if (
                                            !confirm(
                                              `Retire ${formatBatchLabel(batch)}? Closes enrolment and hides it from the form. Enrolled students keep portal access.`,
                                            )
                                          ) {
                                            return;
                                          }
                                          run(() => retireBatch(batch.id));
                                        }}
                                        className="border border-pine/30 px-4 py-2 text-sm font-medium text-pine disabled:opacity-60"
                                      >
                                        Retire cohort
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      disabled={pending}
                                      onClick={() => {
                                        if (
                                          !confirm(
                                            `Delete ${formatBatchLabel(batch)}? Only empty batches (no enrolments). Prefer Retire for finished cohorts.`,
                                          )
                                        ) {
                                          return;
                                        }
                                        run(() => deleteBatch(batch.id));
                                      }}
                                      className="border border-red-800/25 px-4 py-2 text-sm text-red-900 disabled:opacity-60"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              ) : null}

              {panel === "details" ? (
                <div className="px-3 py-3 sm:px-5 sm:py-4">
                  <div className="mb-4 max-w-xl">
                    <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
                      Parish settings
                    </p>
                    <h3 className="mt-1.5 font-display text-lg text-pine">
                      {national
                        ? "How this parish appears on enrol"
                        : "Your parish on the network"}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink/60">
                      {national
                        ? "Update the name, region, and whether applicants can pick this parish. Retiring hides it from enrol; enrolled students keep access. Course runs stay under Batches."
                        : "Name and region are managed nationally. Use the Batches tab to open, close, or retire enrolment for your course runs."}
                    </p>
                  </div>

                  {national ? (
                    <form
                      key={selectedParish.id}
                      className="grid max-w-xl gap-3 sm:grid-cols-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(() =>
                          updateParish(new FormData(event.currentTarget)),
                        );
                      }}
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={selectedParish.id}
                      />
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-ink/45">
                          Display name
                        </label>
                        <input
                          name="name"
                          defaultValue={selectedParish.name}
                          required
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-ink/45">
                          Region
                        </label>
                        <input
                          name="region"
                          defaultValue={selectedParish.region ?? ""}
                          placeholder="e.g. London"
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-ink/45">
                          Show on enrol form
                        </label>
                        <select
                          name="isActive"
                          defaultValue={selectedParish.is_active ? "1" : "0"}
                          className={fieldClass}
                        >
                          <option value="1">
                            Listed — applicants can select it
                          </option>
                          <option value="0">
                            Retired — hidden from enrol; students keep access
                          </option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-2 pt-1 sm:col-span-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="submit"
                          disabled={pending}
                          className="border border-pine px-4 py-2.5 text-sm font-medium text-pine transition hover:bg-pine hover:text-mist disabled:opacity-60"
                        >
                          Save parish settings
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (
                              !confirm(
                                `Delete ${selectedParish.name}? Only empty parishes — no enrolments, no batches, and no desk admins assigned.`,
                              )
                            ) {
                              return;
                            }
                            run(async () => {
                              const result = await deleteParish(
                                selectedParish.id,
                              );
                              if (result.ok) {
                                setSelectedParishId(
                                  parishes.find(
                                    (p) => p.id !== selectedParish.id,
                                  )?.id ?? "",
                                );
                                setMobileSurface("directory");
                              }
                              return result;
                            });
                          }}
                          className="border border-red-800/30 px-4 py-2.5 text-sm text-red-900 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          Delete parish
                        </button>
                      </div>
                    </form>
                  ) : (
                    <dl className="max-w-md divide-y divide-stone border-y border-stone">
                      <div className="grid gap-1 py-3.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
                        <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
                          Display name
                        </dt>
                        <dd className="text-sm text-ink">
                          {selectedParish.name}
                        </dd>
                      </div>
                      <div className="grid gap-1 py-3.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
                        <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
                          Region
                        </dt>
                        <dd className="text-sm text-ink">
                          {selectedParish.region || "—"}
                        </dd>
                      </div>
                      <div className="grid gap-1 py-3.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
                        <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
                          On enrol form
                        </dt>
                        <dd className="text-sm text-ink">
                          {selectedParish.is_active
                            ? "Listed for applicants"
                            : "Retired from enrol"}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}

function InsightGuide({ national }: { national: boolean }) {
  const points = national
    ? [
        {
          title: "Your desk",
          body: "You manage every UK parish. Add churches, then add batches so people can enrol.",
        },
        {
          title: "Enrolment open vs retired",
          body: "Open/closed (lock) controls whether applicants can pick a batch. Listed/retired controls whether it can appear on the form at all. Neither removes enrolled students — they keep portal access.",
        },
        {
          title: "Retire, then delete",
          body: "Retire finished cohorts. Delete only empty shells (no enrolments). Parishes also need no batches and no desk admins before delete.",
        },
      ]
    : [
        {
          title: "Your desk",
          body: "You only manage your own parish. National staff add churches to the UK directory.",
        },
        {
          title: "Enrolment open vs retired",
          body: "Lock closes intake for a course run. Retire hides it from enrol entirely. Students already on that batch keep classes, payments, and the rest of the portal.",
        },
        {
          title: "Delete is rare",
          body: "Prefer Retire for finished cohorts. Delete only if the batch has no enrolments.",
        },
      ];

  return (
    <div className="border border-stone bg-mist">
      <div className="border-b border-stone px-4 py-4 sm:px-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Insight
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          How Parishes & batches work
        </h2>
        <p className="mt-1.5 text-sm text-ink/60">
          Desk:{" "}
          <span className="font-medium text-pine">
            {national ? "National / Master" : "Parish"}
          </span>
        </p>
      </div>
      <ul className="divide-y divide-stone">
        {points.map((point) => (
          <li key={point.title} className="px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-medium text-ink">{point.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              {point.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
