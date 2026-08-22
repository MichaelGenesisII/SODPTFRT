"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  approvePaymentProof,
  getPaymentProofSignedUrl,
  rejectPaymentProof,
  type AdminPaymentQueueItem,
  type PaymentActionResult,
} from "@/app/admin/payments/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  FEE_STATUS_META,
  feeDefinition,
  formatGbp,
  isFeeType,
  type FeeType,
} from "@/lib/payments/fees";
import { DeskPagination } from "@/lib/ui/desk-pagination";

type Lane = "pending" | "paid";
type MobileSurface = "directory" | "workspace";

const PAYMENTS_PAGE_SIZE = 8;

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

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function feeLabel(type: string) {
  return isFeeType(type) ? feeDefinition(type).label : type;
}

function isFee(value: string): value is FeeType {
  return isFeeType(value);
}

export function PaymentsManager({
  pending,
  recentPaid,
  national,
}: {
  pending: AdminPaymentQueueItem[];
  recentPaid: AdminPaymentQueueItem[];
  national: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pendingAction, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pendingAction || Boolean(busyLabel);
  const [lane, setLane] = useState<Lane>("pending");
  const [feeFilter, setFeeFilter] = useState<"all" | FeeType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    pending[0]?.id ?? null,
  );
  const [mobileSurface, setMobileSurface] =
    useState<MobileSurface>("directory");
  const [page, setPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const source = lane === "pending" ? pending : recentPaid;
    if (feeFilter === "all") return source;
    return source.filter((row) => row.fee_type === feeFilter);
  }, [lane, pending, recentPaid, feeFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAYMENTS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAYMENTS_PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAYMENTS_PAGE_SIZE);
  const rangeFrom = rows.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + PAYMENTS_PAGE_SIZE, rows.length);

  useEffect(() => {
    setPage(1);
    setMobileSurface("directory");
  }, [lane, feeFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selected = useMemo(() => {
    const fromRows = rows.find((r) => r.id === selectedId);
    if (fromRows) return fromRows;
    return rows[0] ?? null;
  }, [rows, selectedId]);

  useEffect(() => {
    if (selected && !rows.some((r) => r.id === selected.id)) {
      setSelectedId(rows[0]?.id ?? null);
      setMobileSurface("directory");
    }
  }, [rows, selected]);

  const directoryClass =
    mobileSurface === "directory" ? "block" : "hidden lg:block";
  const workspaceClass =
    mobileSurface === "workspace" ? "block" : "hidden lg:block";

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewError(null);

    if (!selected?.proof_path) {
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);
    void getPaymentProofSignedUrl(selected.id).then((result) => {
      if (cancelled) return;
      setPreviewLoading(false);
      if (result.ok && result.url) {
        setPreviewUrl(result.url);
      } else {
        setPreviewError(result.message || "Could not load preview.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.proof_path]);

  function goToPage(next: number) {
    setPage(Math.min(totalPages, Math.max(1, next)));
  }

  function run(action: () => Promise<PaymentActionResult>, label: string) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          success(next.message, "Payments");
          router.refresh();
        } else {
          error(next.message, "Payments");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <section className="grid grid-cols-2 gap-2 sm:gap-3.5">
        <StatTile
          label="Unresolved"
          shortLabel="Pending"
          value={pending.length}
          hint="Bank proofs waiting"
        />
        <StatTile
          label="Approved (bank)"
          shortLabel="Paid"
          value={recentPaid.length}
          hint="Recent bank approvals"
        />
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <nav
          className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Payment lanes"
        >
          {(
            [
              { id: "pending" as const, label: "Unresolved", count: pending.length },
              { id: "paid" as const, label: "Approved", count: recentPaid.length },
            ] as const
          ).map((tab) => {
            const active = lane === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setLane(tab.id);
                  setSelectedId(null);
                  setMobileSurface("directory");
                }}
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

        <label className="block w-full sm:max-w-[12rem]">
          <span className="sr-only">Fee type</span>
          <select
            value={feeFilter}
            onChange={(event) =>
              setFeeFilter(event.target.value as "all" | FeeType)
            }
            className="w-full border border-stone bg-white/70 px-2.5 py-1.5 text-sm outline-none focus:border-pine"
          >
            <option value="all">All fees</option>
            <option value="tuition">Tuition</option>
            <option value="graduation">Graduation</option>
          </select>
        </label>
      </div>

      <p className="text-xs text-ink/50">
        {rows.length === 0
          ? lane === "pending"
            ? "No unresolved bank proofs"
            : "No approved bank transfers in this list"
          : `Showing ${rangeFrom}–${rangeTo} of ${rows.length}`}
        {!national ? " · your parish only" : null}
      </p>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div
          className={`${directoryClass} flex flex-col border border-stone bg-mist/40`}
        >
          <ul className="max-h-[min(62vh,36rem)] divide-y divide-stone overflow-y-auto lg:max-h-[min(70vh,40rem)]">
            {rows.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-ink/50">
                {lane === "pending"
                  ? "No unresolved bank proofs."
                  : "No approved bank transfers in this list."}
              </li>
            ) : (
              pageRows.map((row) => {
                const active = selected?.id === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(row.id);
                        setMobileSurface("workspace");
                      }}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-pine text-mist" : "hover:bg-white/60"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {row.student_name}
                        </span>
                        <span
                          className={`shrink-0 text-[0.65rem] tabular-nums ${
                            active ? "text-mist/60" : "text-ink/45"
                          }`}
                        >
                          {formatGbp(Number(row.amount_gbp))}
                        </span>
                      </span>
                      <span
                        className={`truncate text-[0.7rem] ${
                          active ? "text-mist/70" : "text-ink/55"
                        }`}
                      >
                        {feeLabel(row.fee_type)}
                        {row.reference ? ` · ${row.reference}` : ""}
                      </span>
                      <span
                        className={`truncate text-[0.58rem] uppercase tracking-[0.1em] ${
                          active ? "text-mist/55" : "text-ink/40"
                        }`}
                      >
                        {[row.parish_name, row.batch_label]
                          .filter(Boolean)
                          .join(" · ") || "No parish link"}
                        {" · "}
                        {formatWhen(row.updated_at)}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <DeskPagination
            page={currentPage}
            totalItems={rows.length}
            pageSize={PAYMENTS_PAGE_SIZE}
            onPageChange={goToPage}
            className="px-3 pb-2.5"
            itemLabel="payments"
          />
        </div>

        <section
          className={`${workspaceClass} relative min-h-[16rem] border border-stone bg-mist sm:min-h-[20rem]`}
          aria-busy={busy}
        >
          <DeskLoaderOverlay
            active={busy}
            label={busyLabel ?? "Working…"}
          />
          {!selected ? (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center px-5 py-12 text-center sm:min-h-[20rem]">
              <p className="font-display text-xl text-pine">Open a proof</p>
              <p className="mt-1.5 max-w-sm text-sm text-ink/55">
                Select a bank transfer from the list to preview the upload and
                approve or return it.
              </p>
            </div>
          ) : (
            <div className="animate-panel-in flex h-full flex-col">
              <header className="border-b border-stone px-3 py-3 sm:px-5 sm:py-3.5">
                <button
                  type="button"
                  onClick={() => setMobileSurface("directory")}
                  className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
                >
                  <span aria-hidden>←</span> Queue
                </button>
                <p className="text-[0.65rem] font-medium tracking-wide text-celadon">
                  {selected.parish_name
                    ? `Parish: ${selected.parish_name}`
                    : "Parish: —"}
                  {selected.batch_label
                    ? ` · Batch: ${selected.batch_label}`
                    : ""}
                </p>
                <h2 className="mt-0.5 font-display text-xl tracking-[-0.02em] text-pine sm:text-2xl">
                  {selected.student_name}
                </h2>
                <p className="mt-0.5 truncate text-xs text-ink/60 sm:text-sm">
                  {selected.student_email}
                  {selected.reference ? ` · ${selected.reference}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem] uppercase tracking-[0.12em] text-ink/50">
                  <span className="text-celadon">
                    {feeLabel(selected.fee_type)}
                  </span>
                  <span>{formatGbp(Number(selected.amount_gbp))}</span>
                  <span>
                    {FEE_STATUS_META[selected.status]?.label ?? selected.status}
                  </span>
                </div>
              </header>

              <div className="grid flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
                <div className="border-b border-stone bg-ink/[0.03] p-3 sm:p-4 lg:border-b-0 lg:border-r">
                  <p className="mb-2 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/40">
                    Proof preview
                  </p>
                  {previewLoading ? (
                    <div className="flex min-h-[12rem] items-center justify-center border border-dashed border-stone text-sm text-ink/50 sm:min-h-[14rem]">
                      Loading image…
                    </div>
                  ) : previewError ? (
                    <div className="flex min-h-[12rem] items-center justify-center border border-dashed border-stone px-4 text-center text-sm text-ink/55 sm:min-h-[14rem]">
                      {previewError}
                    </div>
                  ) : previewUrl ? (
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden border border-stone bg-white"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt={`Bank proof for ${selected.student_name}`}
                        className="mx-auto max-h-[min(50vh,26rem)] w-full object-contain sm:max-h-[min(55vh,28rem)]"
                      />
                    </a>
                  ) : (
                    <div className="flex min-h-[12rem] items-center justify-center border border-dashed border-stone text-sm text-ink/50 sm:min-h-[14rem]">
                      No file attached
                    </div>
                  )}
                  {selected.proof_mime ? (
                    <p className="mt-2 text-[0.7rem] text-ink/45">
                      {selected.proof_mime}
                      {previewUrl ? " · tap image to open full size" : ""}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
                  <div>
                    <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/40">
                      Student note
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink/70">
                      {selected.proof_note?.trim() || "No note left with the upload."}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/40">
                      Uploaded
                    </p>
                    <p className="mt-1 text-sm text-ink/70">
                      {formatWhen(selected.updated_at)}
                    </p>
                  </div>

                  {selected.status === "pending_review" ? (
                    <div className="mt-auto flex flex-col gap-2 pt-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => approvePaymentProof(selected.id),
                            "Approving payment…",
                          )
                        }
                        className="inline-flex min-h-[2.5rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist transition hover:bg-celadon disabled:opacity-60"
                      >
                        {busy && busyLabel?.startsWith("Approving") ? (
                          <DeskLoader label={busyLabel} tone="mist" />
                        ) : (
                          "Approve payment"
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Return this proof? The student can upload again.",
                            )
                          ) {
                            return;
                          }
                          run(
                            () => rejectPaymentProof(selected.id),
                            "Returning proof…",
                          );
                        }}
                        className="inline-flex min-h-[2.5rem] items-center justify-center border border-stone px-4 py-2.5 text-sm text-ink/70 transition hover:border-pine hover:text-pine disabled:opacity-60"
                      >
                        {busy && busyLabel?.startsWith("Returning") ? (
                          <DeskLoader label={busyLabel} />
                        ) : (
                          "Return to student"
                        )}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-auto pt-2 text-sm text-ink/55">
                      Approved
                      {selected.paid_at
                        ? ` · ${formatWhen(selected.paid_at)}`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
