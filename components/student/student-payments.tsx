"use client";

import { useRouter } from "next/navigation";
import {
  useState,
  useTransition,
  useEffect,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRefreshOnVisible } from "@/components/student/use-refresh-on-visible";
import {
  SOD_STUDENT_TOUR_TAB_EVENT,
  type StudentTourTabPayload,
} from "@/lib/student/portal-tour-steps";
import {
  startStripeCheckout,
  submitBankProof,
} from "@/app/student/payments/actions";
import { PhotoUploadCard } from "@/components/student/photo-upload-card";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { ImageFileField } from "@/components/student/image-file-field";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { BANK_TRANSFER, formatGbp } from "@/lib/enrol/payment";
import {
  STUDENT_PAYMENT_CATALOGUE,
  FEE_STATUS_META,
  MIN_INSTALLMENT_GBP,
  PROGRAMME_FEE_GRADUATION_PART_GBP,
  PROGRAMME_FEE_TOTAL_GBP,
  PROGRAMME_FEE_TUITION_PART_GBP,
  feeDefinition,
  hasTuitionInstallmentPaid,
  feeRemaining,
  isFeeFullyPaid,
  programmeFeeBreakdownLabel,
  programmeFeeInstallmentHint,
  type FeePaymentStatus,
  type FeeTransaction,
  type FeeType,
  type StudentFeePayment,
} from "@/lib/payments/fees";

type PaymentsTab = "due" | "review" | "paid" | "history";

type PendingPayConfirm = "card" | "proof";

export function StudentPaymentsRefresh({ children }: { children: ReactNode }) {
  useRefreshOnVisible();
  return <>{children}</>;
}

type PaymentsBoardProps = {
  payments: StudentFeePayment[];
  transactions: FeeTransaction[];
  reference: string;
  referenceCompact: string;
  flash?: string | null;
  loadError?: string | null;
  cardReady?: boolean;
  passportUploaded?: boolean;
  passportUrl?: string | null;
  graduationSelfieUploaded?: boolean;
  graduationSelfieUrl?: string | null;
  graduationSelfieTakenDown?: boolean;
  graduationSelfieNote?: string | null;
};

function bucketFor(
  payment: StudentFeePayment | undefined,
): PaymentsTab {
  if (!payment) return "due";
  if (isFeeFullyPaid(payment)) return "paid";
  if (payment.status === "pending_review") return "review";
  return "due";
}

function feeRowsFor(
  payments: Partial<Record<FeeType, StudentFeePayment>>,
  tab: PaymentsTab,
): FeeType[] {
  return STUDENT_PAYMENT_CATALOGUE.map((fee) => fee.type).filter((type) => {
    return bucketFor(payments[type]) === tab;
  });
}

function tabLabel(tab: PaymentsTab): string {
  if (tab === "review") return "In review";
  if (tab === "paid") return "Paid";
  if (tab === "history") return "History";
  return "Due";
}

export function StudentPaymentsBoard({
  payments,
  transactions,
  reference,
  referenceCompact,
  flash,
  loadError,
  cardReady = false,
  passportUploaded = false,
  passportUrl = null,
  graduationSelfieUploaded = false,
  graduationSelfieUrl = null,
  graduationSelfieTakenDown = false,
  graduationSelfieNote = null,
}: PaymentsBoardProps) {
  const byType = Object.fromEntries(
    payments.map((row) => [row.fee_type, row]),
  ) as Partial<Record<FeeType, StudentFeePayment>>;

  const due = feeRowsFor(byType, "due");
  const review = feeRowsFor(byType, "review");
  const paid = feeRowsFor(byType, "paid");
  const historyCount = transactions.filter((tx) => tx.status !== "unpaid").length;

  const totalOutstanding = payments.reduce(
    (sum, row) => sum + (isFeeFullyPaid(row) ? 0 : feeRemaining(row)),
    0,
  );

  const tuitionAccount = byType.tuition;
  const tuitionFullyPaid = Boolean(
    tuitionAccount && isFeeFullyPaid(tuitionAccount),
  );
  const passportUnlocked = hasTuitionInstallmentPaid(tuitionAccount);
  const needsPassport = passportUnlocked && !passportUploaded;
  const needsSelfie =
    tuitionFullyPaid &&
    (!graduationSelfieUploaded || graduationSelfieTakenDown);

  // Passport lives on the tuition fee row (often still Due after a partial payment).
  const photoTab: PaymentsTab | null = needsPassport
    ? bucketFor(tuitionAccount)
    : needsSelfie
      ? "paid"
      : null;

  const defaultTab: PaymentsTab =
    due.length > 0
      ? "due"
      : review.length > 0
        ? "review"
        : photoTab ?? "paid";
  const [tab, setTab] = useState<PaymentsTab>(defaultTab);
  const [openType, setOpenType] = useState<FeeType | null>(() => {
    if (needsPassport) return "tuition";
    if (needsSelfie) return "graduation";
    return (review[0] ?? due[0] ?? paid[0] ?? null) as FeeType | null;
  });

  const tabs: {
    id: PaymentsTab;
    label: string;
    hint?: string;
    rows: FeeType[];
  }[] = [
    {
      id: "due",
      label: "Due",
      hint: due.length ? String(due.length) : undefined,
      rows: due,
    },
    {
      id: "review",
      label: "In review",
      hint: review.length ? String(review.length) : undefined,
      rows: review,
    },
    {
      id: "paid",
      label: "Paid",
      hint: paid.length ? String(paid.length) : undefined,
      rows: paid,
    },
    {
      id: "history",
      label: "History",
      hint: historyCount ? String(historyCount) : undefined,
      rows: [],
    },
  ];

  const active = tabs.find((item) => item.id === tab) ?? tabs[0]!;

  const lastUpdated = payments.reduce<string | null>((latest, row) => {
    if (!row.updated_at) return latest;
    if (!latest || row.updated_at > latest) return row.updated_at;
    return latest;
  }, null);

  function selectTab(next: PaymentsTab) {
    setTab(next);
    const rows = feeRowsFor(byType, next);
    setOpenType(rows[0] ?? null);
  }

  useEffect(() => {
    function onTourTab(event: Event) {
      const detail = (event as CustomEvent<StudentTourTabPayload>).detail;
      if (detail?.page !== "payments") return;
      selectTab(detail.tab);
    }
    window.addEventListener(SOD_STUDENT_TOUR_TAB_EVENT, onTourTab);
    return () =>
      window.removeEventListener(SOD_STUDENT_TOUR_TAB_EVENT, onTourTab);
  }, [byType]);

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Header flash={flash} />
        <p
          className="border border-red-800/30 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-5">
      <Header flash={flash} />
      {lastUpdated ? (
        <p className="text-xs text-ink/45">
          Last updated{" "}
          <time dateTime={lastUpdated}>{formatPaymentDateTime(lastUpdated)}</time>
          . Leave this tab and come back to pick up desk updates.
        </p>
      ) : null}

      {photoTab && tab !== photoTab ? (
        <p className="border border-[#c4a574]/40 bg-[#efe8dc]/50 px-4 py-3 text-sm leading-relaxed text-[#6b4f2a]">
          A required photograph is waiting under{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => selectTab(photoTab)}
          >
            {tabLabel(photoTab)}
          </button>
          .
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-px border border-stone bg-stone sm:grid-cols-4 sm:gap-0 sm:bg-mist/50">
        <MiniStat
          label="Outstanding"
          value={formatGbp(totalOutstanding)}
        />
        <MiniStat label="Due" value={String(due.length)} />
        <MiniStat label="In review" value={String(review.length)} />
        <MiniStat label="Reference" value={reference} mono />
      </div>

      <BalanceSummary payments={payments} />

      <nav
        className="grid grid-cols-4 border border-stone bg-mist/40 sm:flex sm:gap-1 sm:overflow-x-auto sm:border-0 sm:border-b sm:bg-transparent sm:pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Payment sections"
        data-tour="student-payments-tabs"
      >
        {tabs.map((item) => {
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={`relative min-h-12 px-1.5 py-3 text-center text-sm font-medium tracking-wide transition-colors sm:min-h-0 sm:shrink-0 sm:px-3 sm:py-2 sm:text-left ${
                isActive
                  ? "bg-mist text-pine sm:bg-transparent"
                  : "text-ink/50 hover:text-ink/80"
              }`}
            >
              <span className="inline-flex flex-wrap items-center justify-center gap-1 sm:justify-start sm:gap-1.5">
                <span className="sm:hidden">
                  {item.id === "review"
                    ? "Review"
                    : item.id === "history"
                      ? "History"
                      : item.label}
                </span>
                <span className="hidden sm:inline">{item.label}</span>
                {item.hint ? (
                  <span className="tabular-nums text-[0.65rem] text-ink/40">
                    {item.hint}
                  </span>
                ) : null}
              </span>
              <span
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                  isActive ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      <Panel
        eyebrow={tab === "history" ? "Ledger" : "Fees"}
        title={
          tab === "due"
            ? "Ready to pay"
            : tab === "review"
              ? "Waiting on the desk"
              : tab === "history"
                ? "Payment history"
                : "Confirmed"
        }
        body={
          tab === "due"
            ? "Open a fee, choose an amount, then pay by card or bank transfer."
            : tab === "review"
              ? "Bank proofs with the admin desk. You will get an email when approved."
              : tab === "history"
                ? "Each instalment or full payment — card or bank transfer."
                : "Fees that are settled — card or approved bank transfer."
        }
      >
        {tab === "history" ? (
          <PaymentHistoryList transactions={transactions} />
        ) : active.rows.length === 0 ? (
          <Empty>
            {tab === "due"
              ? "Nothing due right now."
              : tab === "review"
                ? "No proofs waiting."
                : "No paid fees yet."}
          </Empty>
        ) : (
          <ul className="divide-y divide-stone border-y border-stone">
            {active.rows.map((feeType) => {
              const payment = byType[feeType] ?? null;
              const open = openType === feeType;
              return (
                <FeeRow
                  key={feeType}
                  feeType={feeType}
                  payment={payment}
                  reference={reference}
                  referenceCompact={referenceCompact}
                  cardReady={cardReady}
                  open={open}
                  onToggle={() =>
                    setOpenType((current) =>
                      current === feeType ? null : feeType,
                    )
                  }
                  passportUploaded={passportUploaded}
                  passportUrl={passportUrl}
                  graduationSelfieUploaded={graduationSelfieUploaded}
                  graduationSelfieUrl={graduationSelfieUrl}
                  graduationSelfieTakenDown={graduationSelfieTakenDown}
                  graduationSelfieNote={graduationSelfieNote}
                />
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Header({ flash }: { flash?: string | null }) {
  return (
    <section className="animate-fade-rise" data-tour="student-payments-header">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
        Fees
      </p>
      <h1 className="mt-1.5 font-display text-[clamp(1.75rem,5.5vw,2.5rem)] tracking-[-0.02em] text-pine">
        Your payments
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70 sm:mt-1.5">
        {programmeFeeBreakdownLabel()}. {programmeFeeInstallmentHint()} Card or
        bank transfer — you choose how much to pay each time.
      </p>
      {flash ? (
        <p className="mt-3 border border-pine/20 bg-pine/5 px-4 py-3 text-sm leading-relaxed text-pine">
          {flash}
        </p>
      ) : null}
    </section>
  );
}

function FeeRow({
  feeType,
  payment,
  reference,
  referenceCompact,
  cardReady,
  open,
  onToggle,
  passportUploaded,
  passportUrl,
  graduationSelfieUploaded,
  graduationSelfieUrl,
  graduationSelfieTakenDown,
  graduationSelfieNote,
}: {
  feeType: FeeType;
  payment: StudentFeePayment | null;
  reference: string;
  referenceCompact: string;
  cardReady: boolean;
  open: boolean;
  onToggle: () => void;
  passportUploaded: boolean;
  passportUrl: string | null;
  graduationSelfieUploaded: boolean;
  graduationSelfieUrl: string | null;
  graduationSelfieTakenDown: boolean;
  graduationSelfieNote: string | null;
}) {
  const fee = feeDefinition(feeType);
  const status = payment?.status ?? "unpaid";
  const meta = FEE_STATUS_META[status];
  const remaining = payment ? feeRemaining(payment) : fee.amountGbp;
  const paidSoFar = payment?.amount_paid_gbp ?? 0;
  const fullyPaid = payment ? isFeeFullyPaid(payment) : false;
  const passportAllowed =
    feeType === "tuition" && paidSoFar > 0 && !passportUploaded;
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"idle" | "bank">("idle");
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingPayConfirm | null>(null);
  const [proofForm, setProofForm] = useState<HTMLFormElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const { success, error } = useToast();
  const router = useRouter();

  const needsPhoto =
    passportAllowed ||
    (fullyPaid &&
      feeType === "graduation" &&
      (!graduationSelfieUploaded || graduationSelfieTakenDown));

  function payCard() {
    setBusyLabel("Opening card checkout…");
    startTransition(async () => {
      try {
        const result = await startStripeCheckout(feeType, amount);
        if (!result.ok || !result.url) {
          error(result.message);
          return;
        }
        setPendingConfirm(null);
        window.location.href = result.url;
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function requestCardCheckout() {
    const parsed = Number(String(amount).trim().replace(/[£,]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      error("Enter a valid amount.");
      return;
    }
    setPendingConfirm("card");
  }

  function submitProof() {
    if (!proofForm) return;
    const formData = new FormData(proofForm);
    formData.set("feeType", feeType);
    formData.set("amount", amount);
    setBusyLabel("Uploading bank proof…");
    startTransition(async () => {
      try {
        const result = await submitBankProof(formData);
        if (!result.ok) {
          error(result.message);
          return;
        }
        success(result.message);
        setMode("idle");
        setPendingConfirm(null);
        proofForm.reset();
        setProofForm(null);
        router.refresh();
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function onProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProofForm(event.currentTarget);
    setPendingConfirm("proof");
  }

  return (
    <li className="relative py-3.5 first:pt-0 last:pb-0">
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <button
          type="button"
          onClick={() => {
            onToggle();
            setMode("idle");
          }}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <p className="text-[0.6rem] uppercase tracking-[0.12em] text-celadon">
            {meta.label} · {formatGbp(fee.amountGbp)} total
            {paidSoFar > 0 ? ` · ${formatGbp(paidSoFar)} paid` : ""}
            {!fullyPaid ? ` · ${formatGbp(remaining)} left` : ""}
            {needsPhoto ? " · photo required" : ""}
          </p>
          <h3 className="mt-1 break-words font-display text-base text-pine sm:text-lg">
            {fee.label}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ink/45">{fee.hint}</p>
          <p className="mt-1.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-pine/70">
            {open ? "Hide details" : "Show details"}
          </p>
        </button>
        <span
          className={`w-fit shrink-0 border px-2 py-1 text-[0.6rem] font-medium uppercase tracking-[0.1em] ${
            status === "paid"
              ? "border-pine bg-pine text-mist"
              : status === "pending_review"
                ? "border-[#c4a574] text-[#6b4f2a]"
                : "border-stone text-ink/55"
          }`}
        >
          {meta.label}
        </span>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border border-stone bg-white/50 px-3 py-3 text-sm text-ink/65 sm:px-4 sm:py-4">
          {fullyPaid ? (
            <p className="leading-relaxed">
              Paid in full
              {payment?.method === "stripe"
                ? " (includes card payments)"
                : payment?.method === "bank_transfer"
                  ? " (includes approved bank transfers)"
                  : ""}
              {payment?.paid_at
                ? ` · ${new Date(payment.paid_at).toLocaleDateString("en-GB")}`
                : ""}
              .
            </p>
          ) : paidSoFar > 0 ? (
            <p className="leading-relaxed">
              {formatGbp(paidSoFar)} paid · {formatGbp(remaining)} remaining.
            </p>
          ) : null}
          {passportAllowed ? (
            <PhotoUploadCard
              kind="passport"
              required
              alreadyUploaded={passportUploaded}
              previewUrl={passportUrl}
            />
          ) : null}
          {fullyPaid && feeType === "graduation" ? (
            <PhotoUploadCard
              kind="graduation_selfie"
              required
              alreadyUploaded={
                graduationSelfieUploaded && !graduationSelfieTakenDown
              }
              previewUrl={graduationSelfieUrl}
              takenDown={graduationSelfieTakenDown}
              moderationNote={graduationSelfieNote}
            />
          ) : null}
          {!fullyPaid && status === "pending_review" ? (
            <p className="leading-relaxed">
              Your bank proof is with the admin desk. You will get an email when
              it is approved.
              {payment?.proof_note ? (
                <>
                  {" "}
                  Note: <span className="text-ink">{payment.proof_note}</span>
                </>
              ) : null}
            </p>
          ) : !fullyPaid && mode === "bank" ? (
            <div className="space-y-4">
              <div className="border border-stone bg-stone/30 px-3 py-3 text-sm text-ink/70">
                <p className="leading-relaxed">
                  On the transfer, put this payment reference exactly:{" "}
                  <span className="break-all font-mono text-pine">
                    {referenceCompact}
                  </span>
                  . Admins match bank deposits and Stripe payments to this
                  enrolment id (also shown as {reference} on your application).
                </p>
                <label className="mt-3 block text-sm font-medium text-ink">
                  Amount transferred (£)
                  <input
                    type="number"
                    name="amount"
                    min={1}
                    step={1}
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="mt-2 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine sm:py-2"
                  />
                </label>
                <p className="mt-1 text-xs text-ink/45">
                  Minimum {formatGbp(MIN_INSTALLMENT_GBP)} unless this clears your{" "}
                  {formatGbp(remaining)} balance.
                </p>
                <dl className="mt-3 space-y-2 text-sm sm:space-y-1.5">
                  <BankLine label="Account name" value={BANK_TRANSFER.accountName} />
                  <BankLine
                    label="Sort code"
                    value={BANK_TRANSFER.sortCode}
                    mono
                  />
                  <BankLine
                    label="Account number"
                    value={BANK_TRANSFER.accountNumber}
                    mono
                  />
                  <BankLine
                    label="SWIFT/BIC"
                    value={BANK_TRANSFER.swiftBic}
                    mono
                  />
                  <BankLine label="IBAN" value={BANK_TRANSFER.iban} mono />
                </dl>
              </div>
              <form className="space-y-3" onSubmit={onProof}>
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">
                    Proof of payment image
                  </p>
                  <ImageFileField
                    name="proof"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    required
                    chooseLabel="Choose proof image"
                    hint="JPG, PNG, WEBP, or GIF · max 10MB"
                  />
                </div>
                <label className="block text-sm font-medium text-ink">
                  Short note (optional)
                  <textarea
                    name="note"
                    rows={2}
                    maxLength={280}
                    placeholder="e.g. Sent from Barclays today"
                    className="mt-2 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine sm:py-2"
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex min-h-11 w-full items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60 sm:w-auto"
                  >
                    {busy && busyLabel?.startsWith("Uploading") ? (
                      <DeskLoader label={busyLabel} tone="mist" />
                    ) : (
                      "Submit proof"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("idle")}
                    disabled={busy}
                    className="min-h-11 w-full border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine disabled:opacity-60 sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : !fullyPaid ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-ink">
                Amount to pay now (£)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="mt-2 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine sm:py-2"
                />
              </label>
              <p className="text-xs leading-relaxed text-ink/45">
                {formatGbp(remaining)} remaining · minimum{" "}
                {formatGbp(MIN_INSTALLMENT_GBP)} per instalment unless you pay the
                full balance.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={busy || !cardReady}
                  onClick={requestCardCheckout}
                  className="inline-flex min-h-11 flex-1 items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-50"
                >
                  {busy && busyLabel?.startsWith("Opening") ? (
                    <DeskLoader label={busyLabel} tone="mist" />
                  ) : (
                    "Pay by card"
                  )}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setMode("bank")}
                  className="inline-flex min-h-11 flex-1 items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
                >
                  Bank transfer
                </button>
              </div>
              {!cardReady ? (
                <p className="text-xs leading-relaxed text-ink/45">
                  Card checkout is temporarily unavailable. Bank transfer is
                  available now.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <DeskConfirmModal
        open={Boolean(pendingConfirm)}
        onClose={() => !busy && setPendingConfirm(null)}
        onConfirm={() => {
          if (pendingConfirm === "card") payCard();
          else if (pendingConfirm === "proof") submitProof();
        }}
        eyebrow={pendingConfirm === "proof" ? "Bank transfer" : "Card checkout"}
        title={
          pendingConfirm === "proof"
            ? "Submit this proof?"
            : `Pay ${formatGbp(Number(String(amount).replace(/[£,]/g, "")) || 0)} by card?`
        }
        body={
          pendingConfirm === "proof" ? (
            <>
              Your proof goes to the admin desk for review. Use reference{" "}
              <span className="font-mono font-medium text-ink">
                {referenceCompact}
              </span>{" "}
              on the transfer. You cannot send another proof while one is in
              review.
            </>
          ) : (
            <>
              You will leave the portal for secure Stripe checkout for{" "}
              <span className="font-medium text-ink">{fee.label}</span>. Your
              balance updates when payment is confirmed.
            </>
          )
        }
        confirmLabel={
          pendingConfirm === "proof" ? "Submit proof" : "Continue to checkout"
        }
        busy={busy}
        busyLabel={busyLabel ?? "Working…"}
      />
    </li>
  );
}

function BalanceSummary({ payments }: { payments: StudentFeePayment[] }) {
  const byType = Object.fromEntries(
    payments.map((row) => [row.fee_type, row]),
  ) as Partial<Record<FeeType, StudentFeePayment>>;

  return (
    <section className="border border-stone bg-mist/40 px-4 py-4 sm:px-5" data-tour="student-payments-balances">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
        Balances
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ink/55">
        Total {formatGbp(PROGRAMME_FEE_TOTAL_GBP)} · tuition{" "}
        {formatGbp(PROGRAMME_FEE_TUITION_PART_GBP)} + graduation{" "}
        {formatGbp(PROGRAMME_FEE_GRADUATION_PART_GBP)}. Pay the whole amount or
        in instalments (from {formatGbp(MIN_INSTALLMENT_GBP)}).
      </p>
      <ul className="mt-3 space-y-3">
        {STUDENT_PAYMENT_CATALOGUE.map((fee) => {
          const account = byType[fee.type];
          const due = account?.amount_due_gbp ?? fee.amountGbp;
          const paid = account?.amount_paid_gbp ?? 0;
          const remaining = account ? feeRemaining(account) : fee.amountGbp;
          const fullyPaid = account ? isFeeFullyPaid(account) : false;
          const progress = due > 0 ? Math.min(100, (paid / due) * 100) : 0;

          return (
            <li key={fee.type}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-ink">{fee.label}</span>
                <span className="tabular-nums text-ink/65">
                  {formatGbp(paid)} of {formatGbp(due)}
                  {!fullyPaid ? (
                    <span className="text-ink/45">
                      {" "}
                      · {formatGbp(remaining)} left
                    </span>
                  ) : (
                    <span className="text-pine"> · paid in full</span>
                  )}
                </span>
              </div>
              <p className="mt-1 text-[0.7rem] text-ink/45">
                Includes {formatGbp(PROGRAMME_FEE_TUITION_PART_GBP)} tuition and{" "}
                {formatGbp(PROGRAMME_FEE_GRADUATION_PART_GBP)} graduation
              </p>
              <div
                className="mt-2 h-1.5 overflow-hidden bg-stone/80"
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${fee.label} paid`}
              >
                <div
                  className="h-full bg-pine transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function paymentMethodLabel(
  method: FeeTransaction["method"],
): string {
  if (method === "stripe") return "Card";
  if (method === "bank_transfer") return "Bank transfer";
  return "Payment";
}

function PaymentHistoryList({
  transactions,
}: {
  transactions: FeeTransaction[];
}) {
  const visible = transactions.filter((tx) => tx.status !== "unpaid");

  if (visible.length === 0) {
    return (
      <Empty>
        No payments recorded yet. Instalments and full payments appear here once
        submitted or confirmed.
      </Empty>
    );
  }

  return (
    <ul className="divide-y divide-stone border-y border-stone">
      {visible.map((tx) => {
        const fee = feeDefinition(tx.fee_type);
        const meta = FEE_STATUS_META[tx.status];
        const when = tx.paid_at ?? tx.created_at;

        return (
          <li key={tx.id} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="text-[0.6rem] uppercase tracking-[0.12em] text-celadon">
                  {fee.label} · {paymentMethodLabel(tx.method)}
                </p>
                <p className="mt-1 font-display text-base text-pine sm:text-lg">
                  {formatGbp(Number(tx.amount_gbp))}
                </p>
                <p className="mt-1 text-xs text-ink/45">
                  {when ? (
                    <time dateTime={when}>
                      {formatPaymentDateTime(when)}
                    </time>
                  ) : (
                    "—"
                  )}
                </p>
                {tx.status === "pending_review" && tx.proof_note ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink/60">
                    {tx.proof_note}
                  </p>
                ) : null}
              </div>
              <span
                className={`w-fit shrink-0 border px-2 py-1 text-[0.6rem] font-medium uppercase tracking-[0.1em] ${
                  tx.status === "paid"
                    ? "border-pine bg-pine text-mist"
                    : "border-[#c4a574] text-[#6b4f2a]"
                }`}
              >
                {meta.label}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BankLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-ink/45">{label}</dt>
      <dd
        className={`min-w-0 break-words text-ink ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function MiniStat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-mist/80 px-2.5 py-3 sm:bg-transparent sm:px-4 sm:py-3">
      <p className="text-[0.58rem] uppercase tracking-[0.1em] text-ink/40 sm:text-[0.6rem] sm:tracking-[0.12em]">
        {label}
      </p>
      <p
        className={`mt-0.5 font-display text-pine ${
          mono
            ? "truncate font-mono text-xs leading-snug sm:break-all sm:text-sm sm:leading-snug"
            : "text-lg tabular-nums sm:text-xl"
        }`}
        title={mono ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 font-display text-xl text-pine sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
          {body}
        </p>
      </div>
      <div className="px-3 py-3 sm:px-5 sm:py-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border border-dashed border-stone px-4 py-8 text-center text-sm text-ink/50">
      {children}
    </p>
  );
}

function formatPaymentDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
