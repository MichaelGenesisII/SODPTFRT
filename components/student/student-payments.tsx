"use client";

import { useRouter } from "next/navigation";
import {
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  startStripeCheckout,
  submitBankProof,
} from "@/app/student/payments/actions";
import { PhotoUploadCard } from "@/components/student/photo-upload-card";
import { ImageFileField } from "@/components/student/image-file-field";
import { useToast } from "@/components/ui/toast";
import { BANK_TRANSFER, formatGbp } from "@/lib/enrol/payment";
import {
  FEE_CATALOGUE,
  FEE_STATUS_META,
  MIN_INSTALLMENT_GBP,
  feeDefinition,
  hasTuitionInstallmentPaid,
  feeRemaining,
  isFeeFullyPaid,
  type FeePaymentStatus,
  type FeeType,
  type StudentFeePayment,
} from "@/lib/payments/fees";

type PaymentsTab = "due" | "review" | "paid";

type PaymentsBoardProps = {
  payments: StudentFeePayment[];
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
  return FEE_CATALOGUE.map((fee) => fee.type).filter((type) => {
    return bucketFor(payments[type]) === tab;
  });
}

export function StudentPaymentsBoard({
  payments,
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

  const tuitionAccount = byType.tuition;
  const passportUnlocked = hasTuitionInstallmentPaid(tuitionAccount);
  const graduationPaid = byType.graduation ? isFeeFullyPaid(byType.graduation) : false;
  const needsPassport = passportUnlocked && !passportUploaded;
  const needsSelfie =
    graduationPaid &&
    (!graduationSelfieUploaded || graduationSelfieTakenDown);

  const defaultTab: PaymentsTab = needsPassport || needsSelfie
    ? "paid"
    : review.length > 0
      ? "review"
      : due.length > 0
        ? "due"
        : "paid";
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
  ];

  const active = tabs.find((item) => item.id === tab) ?? tabs[0]!;

  function selectTab(next: PaymentsTab) {
    setTab(next);
    const rows = feeRowsFor(byType, next);
    setOpenType(rows[0] ?? null);
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
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
    <div className="mx-auto w-full max-w-4xl space-y-4 sm:space-y-5">
      <Header flash={flash} />

      {(needsPassport || needsSelfie) && tab !== "paid" ? (
        <p className="border border-[#c4a574]/40 bg-[#efe8dc]/50 px-4 py-3 text-sm leading-relaxed text-[#6b4f2a]">
          A required photograph is waiting under{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => selectTab("paid")}
          >
            Paid
          </button>
          .
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-px border border-stone bg-stone sm:grid-cols-4 sm:gap-0 sm:bg-mist/50">
        <MiniStat label="Due" value={String(due.length)} />
        <MiniStat label="In review" value={String(review.length)} />
        <MiniStat label="Paid" value={String(paid.length)} />
        <MiniStat label="Reference" value={reference} mono />
      </div>

      <nav
        className="grid grid-cols-3 border border-stone bg-mist/40 sm:flex sm:gap-1 sm:overflow-x-auto sm:border-0 sm:border-b sm:bg-transparent sm:pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Payment sections"
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
                  {item.id === "review" ? "Review" : item.label}
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
        eyebrow="Fees"
        title={
          tab === "due"
            ? "Ready to pay"
            : tab === "review"
              ? "Waiting on the desk"
              : "Confirmed"
        }
        body={
          tab === "due"
            ? "Open a fee, choose an amount, then pay by card or bank transfer."
            : tab === "review"
              ? "Bank proofs with the admin desk. You will get an email when approved."
              : "Fees that are settled — card or approved bank transfer."
        }
      >
        {active.rows.length === 0 ? (
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
    <section className="animate-fade-rise">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
        Fees
      </p>
      <h1 className="mt-1.5 font-display text-[clamp(1.75rem,5.5vw,2.5rem)] tracking-[-0.02em] text-pine">
        Your payments
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/70 sm:mt-1.5">
        Choose tuition or graduation, then pay in full or by instalment — minimum{" "}
        {formatGbp(MIN_INSTALLMENT_GBP)} each time unless you clear the balance.
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
  const [amount, setAmount] = useState(String(Math.max(remaining, 0) || ""));
  const [mode, setMode] = useState<"idle" | "bank">("idle");
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();

  const needsPhoto =
    passportAllowed ||
    (fullyPaid &&
      feeType === "graduation" &&
      (!graduationSelfieUploaded || graduationSelfieTakenDown));

  function payCard() {
    startTransition(async () => {
      const result = await startStripeCheckout(feeType, amount);
      if (!result.ok || !result.url) {
        error(result.message);
        return;
      }
      window.location.href = result.url;
    });
  }

  function onProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("feeType", feeType);
    formData.set("amount", amount);
    startTransition(async () => {
      const result = await submitBankProof(formData);
      if (!result.ok) {
        error(result.message);
        return;
      }
      success(result.message);
      setMode("idle");
      form.reset();
      router.refresh();
    });
  }

  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
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
            {paidSoFar > 0 && !fullyPaid
              ? ` · ${formatGbp(paidSoFar)} paid · ${formatGbp(remaining)} left`
              : ""}
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
                  Transfer using reference{" "}
                  <span className="break-all font-mono text-pine">
                    {referenceCompact}
                  </span>
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
                    disabled={pending}
                    className="min-h-11 w-full bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60 sm:w-auto"
                  >
                    {pending ? "Uploading…" : "Submit proof"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("idle")}
                    className="min-h-11 w-full border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-ink">
                Amount to pay now (£)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
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
                  disabled={pending || !cardReady}
                  onClick={payCard}
                  className="inline-flex min-h-11 flex-1 items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-50"
                >
                  {pending ? "Opening…" : "Pay by card"}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("bank")}
                  className="inline-flex min-h-11 flex-1 items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine"
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
          )}
        </div>
      ) : null}
    </li>
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
