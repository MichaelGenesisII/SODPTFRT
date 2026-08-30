"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  approvePaymentProof,
  getPaymentProofSignedUrl,
  rejectPaymentProof,
  type AdminPaymentQueueItem,
  type PaymentActionResult,
} from "@/app/admin/payments/actions";
import { PaymentsInsight } from "@/components/admin/payments-insight";
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

type PageView = "desk" | "insight";
type Lane = "pending" | "paid";
type MobileSurface = "directory" | "workspace";
type PendingConfirm = { kind: "approve" } | { kind: "reject" };

const PAYMENTS_PAGE_SIZE = 10;

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50";

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

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

function PaymentStatTile({
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
    <div className="border border-stone bg-mist/90 px-3 py-3.5 sm:px-4 sm:py-4">
      <p className="truncate text-[0.58rem] font-medium uppercase tracking-[0.12em] text-ink/40 sm:text-[0.65rem] sm:tracking-[0.16em]">
        <span className="sm:hidden">{shortLabel ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </p>
      <p className="mt-1 font-display text-2xl tabular-nums text-pine sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 truncate text-[0.65rem] text-ink/45">{hint}</p>
    </div>
  );
}

function FeeChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-pine bg-pine text-mist"
          : "border-stone text-ink/55 hover:border-pine/40"
      }`}
    >
      {label}
      {count != null ? (
        <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
      ) : null}
    </button>
  );
}

export function PaymentsManager({
  pending,
  recentPaid,
  national,
  initialUserId,
  studentBackHref,
}: {
  pending: AdminPaymentQueueItem[];
  recentPaid: AdminPaymentQueueItem[];
  national: boolean;
  initialUserId?: string;
  studentBackHref?: string;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pageView, setPageView] = useState<PageView>("desk");
  const [pendingAction, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pendingAction || Boolean(busyLabel);
  const [lane, setLane] = useState<Lane>("pending");
  const [feeFilter, setFeeFilter] = useState<"all" | FeeType>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    pending[0]?.id ?? null,
  );
  const [mobileSurface, setMobileSurface] =
    useState<MobileSurface>("directory");
  const [page, setPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

  const tuitionPending = useMemo(
    () => pending.filter((row) => row.fee_type === "tuition").length,
    [pending],
  );
  const graduationPending = useMemo(
    () => pending.filter((row) => row.fee_type === "graduation").length,
    [pending],
  );

  const rows = useMemo(() => {
    const source = lane === "pending" ? pending : recentPaid;
    const q = query.trim().toLowerCase();
    return source.filter((row) => {
      if (feeFilter !== "all" && row.fee_type !== feeFilter) return false;
      if (!q) return true;
      const haystack = [
        row.student_name,
        row.student_email,
        row.reference,
        row.reference_compact,
        row.parish_name,
        row.batch_label,
        row.cohort_label,
        feeLabel(row.fee_type),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [lane, pending, recentPaid, feeFilter, query]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAYMENTS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAYMENTS_PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAYMENTS_PAGE_SIZE);
  const rangeFrom = rows.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + PAYMENTS_PAGE_SIZE, rows.length);

  useEffect(() => {
    if (!initialUserId) return;
    const forStudent = [...pending, ...recentPaid].filter(
      (row) => row.user_id === initialUserId,
    );
    if (forStudent.length === 0) return;
    const pick =
      forStudent.find((row) => row.status === "pending_review") ??
      forStudent[0]!;
    setLane(pick.status === "paid" ? "paid" : "pending");
    setSelectedId(pick.id);
    setMobileSurface("workspace");
  }, [initialUserId, pending, recentPaid]);

  useEffect(() => {
    setPage(1);
    if (!initialUserId) {
      setMobileSurface("directory");
    }
  }, [lane, feeFilter, query, initialUserId]);

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

  useEffect(() => {
    if (!pendingConfirm) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setPendingConfirm(null);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingConfirm, busy]);

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
          setPendingConfirm(null);
          router.refresh();
        } else {
          error(next.message, "Payments");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy || !selected) return;
    if (pendingConfirm.kind === "approve") {
      run(() => approvePaymentProof(selected.id), "Approving payment…");
      return;
    }
    run(() => rejectPaymentProof(selected.id), "Returning proof…");
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        data-tour="payments-tabs"
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
        aria-label="Payments page"
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
        <PaymentsInsight national={national} />
      ) : (
        <>
          {studentBackHref ? (
            <Link
              href={studentBackHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-pine hover:underline"
            >
              <span aria-hidden>←</span> Back to student file
            </Link>
          ) : null}

          <section
            data-tour="payments-stats"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3.5"
          >
            <PaymentStatTile
              label="Unresolved"
              shortLabel="Queue"
              value={pending.length}
              hint="Proofs to review"
            />
            <PaymentStatTile
              label="Tuition"
              shortLabel="Tuition"
              value={tuitionPending}
              hint="Application fee queue"
            />
            <PaymentStatTile
              label="Graduation"
              shortLabel="Grad"
              value={graduationPending}
              hint="Graduation fee queue"
            />
            <PaymentStatTile
              label="Approved"
              shortLabel="Paid"
              value={recentPaid.length}
              hint="Recent bank approvals"
            />
          </section>

          <div className="flex flex-col gap-2">
            <nav
              data-tour="payments-lanes"
              className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Payment lanes"
            >
              {(
                [
                  {
                    id: "pending" as const,
                    label: "Unresolved",
                    count: pending.length,
                  },
                  {
                    id: "paid" as const,
                    label: "Approved",
                    count: recentPaid.length,
                  },
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

            <div className="border border-stone bg-mist/40 px-3 py-3 sm:px-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                    Queue
                  </p>
                  <p className="mt-1 text-sm text-ink/60">
                    {lane === "pending"
                      ? "Bank proofs waiting for review"
                      : "Recently approved bank transfers"}
                    {!national ? " · your parish only" : ""}
                  </p>
                </div>
                <label className="block w-full text-sm lg:max-w-md">
                  <span className="sr-only">Search queue</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, reference, parish…"
                    className={fieldClass}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <FeeChip
                  label="All fees"
                  active={feeFilter === "all"}
                  onClick={() => setFeeFilter("all")}
                />
                <FeeChip
                  label="Tuition"
                  active={feeFilter === "tuition"}
                  onClick={() => setFeeFilter("tuition")}
                  count={tuitionPending}
                />
                <FeeChip
                  label="Graduation"
                  active={feeFilter === "graduation"}
                  onClick={() => setFeeFilter("graduation")}
                  count={graduationPending}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-ink/50">
            {rows.length === 0
              ? lane === "pending"
                ? "No unresolved bank proofs"
                : "No approved bank transfers in this list"
              : `Showing ${rangeFrom}–${rangeTo} of ${rows.length}`}
          </p>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div
              className={`${directoryClass} flex flex-col border border-stone bg-mist/30`}
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
                          className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors sm:px-4 ${
                            active
                              ? "bg-pine/5 ring-1 ring-inset ring-pine/20"
                              : "hover:bg-white/70"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex size-9 shrink-0 items-center justify-center text-xs font-medium ${
                              active
                                ? "bg-pine text-mist"
                                : "bg-stone/70 text-pine"
                            }`}
                          >
                            {initials(row.student_name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium text-ink">
                                {row.student_name}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-ink/55">
                                {formatGbp(Number(row.amount_gbp))}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink/55">
                              {feeLabel(row.fee_type)}
                              {row.reference_compact
                                ? ` · ${row.reference_compact}`
                                : row.reference
                                  ? ` · ${row.reference}`
                                  : ""}
                            </span>
                            <span className="mt-0.5 block truncate text-[0.65rem] text-ink/45">
                              {[row.parish_name, row.batch_label]
                                .filter(Boolean)
                                .join(" · ") || "No parish link"}
                              {national && row.cohort_label
                                ? ` · ${row.cohort_label}`
                                : ""}
                            </span>
                            <span className="mt-0.5 block text-[0.58rem] uppercase tracking-[0.08em] text-ink/35">
                              {formatWhen(row.updated_at)}
                            </span>
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
              className={`${workspaceClass} relative min-h-[16rem] border border-stone bg-mist/30 sm:min-h-[20rem]`}
              aria-busy={busy}
            >
              <DeskLoaderOverlay
                active={busy && !pendingConfirm}
                label={busyLabel ?? "Working…"}
              />
              {!selected ? (
                <div className="flex h-full min-h-[16rem] flex-col items-center justify-center px-5 py-12 text-center sm:min-h-[20rem]">
                  <p className="font-display text-xl text-pine">
                    Open a proof
                  </p>
                  <p className="mt-1.5 max-w-sm text-sm text-ink/55">
                    Select a bank transfer from the queue to preview the upload
                    and approve or return it.
                  </p>
                </div>
              ) : (
                <div className="animate-panel-in flex h-full flex-col">
                  <header className="border-b border-stone bg-white/50 px-3 py-3 sm:px-5 sm:py-4">
                    <button
                      type="button"
                      onClick={() => setMobileSurface("directory")}
                      className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
                    >
                      <span aria-hidden>←</span> Queue
                    </button>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                          {[selected.parish_name, selected.batch_label]
                            .filter(Boolean)
                            .join(" · ") || "Placement pending"}
                          {selected.cohort_label
                            ? ` · ${selected.cohort_label}`
                            : ""}
                        </p>
                        <h2 className="mt-0.5 font-display text-xl tracking-[-0.02em] text-pine sm:text-2xl">
                          {selected.student_name}
                        </h2>
                        <p className="mt-0.5 truncate text-xs text-ink/60 sm:text-sm">
                          {selected.student_email}
                          {selected.reference
                            ? ` · ${selected.reference}`
                            : ""}
                        </p>
                        {selected.reference_compact ? (
                          <p className="mt-1 font-mono text-xs text-pine">
                            Bank lookup: {selected.reference_compact}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem] uppercase tracking-[0.12em] text-ink/50">
                          <span className="text-celadon">
                            {feeLabel(selected.fee_type)}
                          </span>
                          <span>{formatGbp(Number(selected.amount_gbp))}</span>
                          <span>
                            {FEE_STATUS_META[selected.status]?.label ??
                              selected.status}
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/admin/students/${selected.user_id}`}
                        className="shrink-0 border border-stone px-3 py-2 text-xs font-medium text-pine transition hover:border-pine hover:bg-pine/5"
                      >
                        Student file →
                      </Link>
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
                          {selected.proof_note?.trim() ||
                            "No note left with the upload."}
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
                              setPendingConfirm({ kind: "approve" })
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
                            onClick={() =>
                              setPendingConfirm({ kind: "reject" })
                            }
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
        </>
      )}

      {pendingConfirm && selected ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Working…"}
            />
            {(() => {
              const copy =
                pendingConfirm.kind === "approve"
                  ? {
                      eyebrow: "Approve payment",
                      title: "Approve this bank transfer?",
                      body: (
                        <>
                          Marks{" "}
                          <span className="font-medium text-ink">
                            {feeLabel(selected.fee_type)}
                          </span>{" "}
                          as paid for{" "}
                          <span className="font-medium text-ink">
                            {selected.student_name}
                          </span>{" "}
                          ({formatGbp(selected.amount_gbp)}). The student is
                          notified.
                        </>
                      ),
                      confirmLabel: "Approve payment",
                      destructive: false,
                    }
                  : {
                      eyebrow: "Return proof",
                      title: "Return this proof to the student?",
                      body: (
                        <>
                          <span className="font-medium text-ink">
                            {selected.student_name}
                          </span>{" "}
                          can upload again for{" "}
                          <span className="font-medium text-ink">
                            {feeLabel(selected.fee_type)}
                          </span>
                          . The current file leaves the review queue.
                        </>
                      ),
                      confirmLabel: "Return to student",
                      destructive: true,
                    };
              return (
                <>
                  <p
                    className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
                      copy.destructive ? "text-red-800/80" : "text-celadon"
                    }`}
                  >
                    {copy.eyebrow}
                  </p>
                  <h3
                    id="payment-confirm-title"
                    className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
                  >
                    {copy.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink/70">
                    {copy.body}
                  </p>
                  <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingConfirm(null)}
                      className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={confirmPendingAction}
                      className={`inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center px-4 py-2.5 text-sm font-medium text-mist transition-colors disabled:opacity-60 ${
                        copy.destructive
                          ? "bg-[#5c2a2a] hover:bg-red-900"
                          : "bg-pine hover:bg-celadon"
                      }`}
                    >
                      {busy ? (
                        <DeskLoader label="Working…" tone="mist" />
                      ) : (
                        copy.confirmLabel
                      )}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
