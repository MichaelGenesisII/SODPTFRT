"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteStudentAccount,
  reassignEnrolmentBatch,
  resetStudentPassword,
  sendManualsPart,
  setManualsSent,
  setStudentActive,
  updateEnrolmentContact,
  updateEnrolmentStatus,
  updatePaymentStatus,
  upgradeAlumniToStudent,
  type SaturdayCohortOption,
  type StudentActionResult,
} from "@/app/admin/students/actions";
import {
  StudentDossier,
  type StudentPendingConfirm,
} from "@/components/admin/student-dossier";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  ENROLMENT_STATUS_META,
  formatAdminDate,
  PAYMENT_STATUS_META,
  studentFullName,
  type AdminStudentRecord,
} from "@/lib/admin/students";
import type { AdminProfile } from "@/lib/admin/profile";
import { SATURDAY_SLOT_LABELS } from "@/lib/cohorts/saturday";
import { formatGbp } from "@/lib/payments/fees";
import { formatBatchPlacementLabel, type Batch, type Parish } from "@/lib/parishes";

export type { StudentPendingConfirm };

export function StudentDetailWorkspace({
  student,
  profile,
  parishes,
  batches,
  saturdayOptions = [],
  backHref = "/admin/students",
}: {
  student: AdminStudentRecord;
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Pick<
    Batch,
    "id" | "parish_id" | "name" | "year" | "enrolment_open" | "is_active"
  >[];
  saturdayOptions?: SaturdayCohortOption[];
  backHref?: string;
}) {
  const router = useRouter();
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] =
    useState<StudentPendingConfirm | null>(null);
  const [paymentEmptyOpen, setPaymentEmptyOpen] = useState(false);

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

  useEffect(() => {
    if (!paymentEmptyOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPaymentEmptyOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [paymentEmptyOpen]);

  function run(
    action: () => Promise<StudentActionResult>,
    options?: { clearPassword?: boolean; label?: string; leaveAfter?: boolean },
  ) {
    setBusyLabel(options?.label ?? "Working…");
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          success(next.message, "Students");
          if (next.temporaryPassword) {
            setRevealedPassword(next.temporaryPassword);
            info(
              `Temporary password: ${next.temporaryPassword}`,
              "Share securely",
            );
          } else if (options?.clearPassword) {
            setRevealedPassword(null);
          }
          setPendingConfirm(null);
          if (options?.leaveAfter) {
            router.push(backHref);
          }
          router.refresh();
        } else {
          error(next.message, "Students");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function copyPassword(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      success("Temporary password copied.", "Students");
    } catch {
      error("Could not copy to clipboard.", "Students");
    }
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    switch (pendingConfirm.kind) {
      case "delete":
        run(() => deleteStudentAccount(student.id), {
          clearPassword: true,
          label: "Removing student…",
          leaveAfter: true,
        });
        return;
      case "pause":
        run(() => setStudentActive(student.id, false), {
          label: "Pausing seat…",
        });
        return;
      case "reactivate":
        run(() => setStudentActive(student.id, true), {
          label: "Reactivating…",
        });
        return;
      case "password":
        run(() => resetStudentPassword(student.id), {
          label: "Resetting password…",
        });
        return;
      case "clearManuals":
        run(() => setManualsSent(student.id, false), {
          label: "Clearing manuals…",
        });
        return;
      case "upgrade":
        run(() => upgradeAlumniToStudent(student.id), {
          label: "Upgrading seat…",
        });
        return;
      case "sendManuals":
        run(() => sendManualsPart(student.id, pendingConfirm.part), {
          label: `Sending manuals ${pendingConfirm.part}…`,
        });
        return;
      case "savePlacement":
        run(
          () =>
            reassignEnrolmentBatch(
              pendingConfirm.enrolmentId,
              pendingConfirm.parishId,
              pendingConfirm.batchId,
              {
                reason: pendingConfirm.reason,
                saturdayCohortId: pendingConfirm.saturdayCohortId,
              },
            ),
          { label: "Saving placement…" },
        );
        return;
      case "saveStatus":
        run(async () => {
          let last: StudentActionResult = {
            ok: true,
            message: "Status updated.",
          };
          if (pendingConfirm.enrolmentStatusChanged) {
            last = await updateEnrolmentStatus(
              pendingConfirm.enrolmentId,
              pendingConfirm.enrolmentStatus,
            );
            if (!last.ok) return last;
          }
          if (pendingConfirm.paymentStatusChanged) {
            last = await updatePaymentStatus(
              pendingConfirm.enrolmentId,
              pendingConfirm.paymentStatus,
            );
          }
          return last;
        }, {
          label:
            pendingConfirm.enrolmentStatusChanged &&
            pendingConfirm.enrolmentStatus === "accepted"
              ? "Accepting and sending email…"
              : "Updating status…",
        });
        return;
      case "saveContact":
        run(
          () =>
            updateEnrolmentContact(
              pendingConfirm.enrolmentId,
              pendingConfirm.values,
            ),
          { label: "Saving contact…" },
        );
        return;
    }
  }

  const name = studentFullName(student);
  const relatedFrom = `student:${student.id}`;
  const programmeFee =
    student.fees.find((fee) => fee.fee_type === "tuition") ?? null;
  const paidGbp = programmeFee?.amount_paid_gbp ?? 0;
  const dueGbp = programmeFee?.amount_due_gbp ?? 0;
  const remainingGbp = Math.max(0, dueGbp - paidGbp);
  const hasPaymentReview =
    student.fees.some((fee) => fee.status === "pending_review") ||
    student.enrolment?.payment_status === "pending_review";
  const hasPaymentActivity =
    hasPaymentReview ||
    paidGbp > 0 ||
    programmeFee?.status === "paid" ||
    student.enrolment?.payment_status === "paid";
  const paymentsHref = `/admin/payments?user=${student.id}&from=${encodeURIComponent(relatedFrom)}`;

  const confirmCopy = (() => {
    if (!pendingConfirm) return null;
    switch (pendingConfirm.kind) {
      case "delete":
        return {
          eyebrow: "Remove student",
          title: `Remove ${name}?`,
          body: (
            <>
              This permanently deletes their sign-in account, student seat, and
              enrolment record. Joined {formatAdminDate(student.created_at)}.
              This cannot be undone.
            </>
          ),
          confirmLabel: "Remove permanently",
          destructive: true,
        };
      case "pause":
        return {
          eyebrow: "Pause seat",
          title: "Pause this student seat?",
          body: (
            <>
              <span className="font-medium text-ink">{name}</span> will not be
              able to sign in until you reactivate the seat. They are notified by
              email.
            </>
          ),
          confirmLabel: "Pause seat",
          destructive: true,
        };
      case "reactivate":
        return {
          eyebrow: "Reactivate",
          title: "Reactivate this student seat?",
          body: (
            <>
              <span className="font-medium text-ink">{name}</span> will be able
              to sign in again.
            </>
          ),
          confirmLabel: "Reactivate",
          destructive: false,
        };
      case "password":
        return {
          eyebrow: "Temporary password",
          title: "Issue a new temporary password?",
          body: (
            <>
              A new password will be generated for{" "}
              <span className="font-medium text-ink">{name}</span>. Their current
              password will stop working. Share the new one securely.
            </>
          ),
          confirmLabel: "Issue password",
          destructive: false,
        };
      case "clearManuals":
        return {
          eyebrow: "Clear manuals",
          title: "Clear all manuals send marks?",
          body: (
            <>
              This resets the sent status for parts 1–3 on{" "}
              <span className="font-medium text-ink">{name}</span>’s file so you
              can send again. It does not recall emails already delivered.
            </>
          ),
          confirmLabel: "Clear sends",
          destructive: false,
        };
      case "upgrade":
        return {
          eyebrow: "Upgrade seat",
          title: "Upgrade to active student?",
          body: (
            <>
              <span className="font-medium text-ink">{name}</span> will move from
              the alumni portal to a full student seat.
            </>
          ),
          confirmLabel: "Upgrade seat",
          destructive: false,
        };
      case "sendManuals":
        return {
          eyebrow: "Send manuals",
          title: `Send manuals part ${pendingConfirm.part} of 3?`,
          body: (
            <>
              <span className="font-medium text-ink">{name}</span> will receive an
              email for this manuals part. Only send when the files are ready.
            </>
          ),
          confirmLabel: `Send part ${pendingConfirm.part}`,
          destructive: false,
        };
      case "savePlacement": {
        const parishName =
          parishes.find((p) => p.id === pendingConfirm.parishId)?.name ??
          "selected parish";
        const batch =
          batches.find((b) => b.id === pendingConfirm.batchId) ?? null;
        const batchName = batch
          ? formatBatchPlacementLabel(batch)
          : "selected batch";
        const saturdayOption = pendingConfirm.saturdayCohortId
          ? saturdayOptions.find((o) => o.id === pendingConfirm.saturdayCohortId)
          : null;
        const saturdayLabel = saturdayOption
          ? saturdayOption.label ||
            SATURDAY_SLOT_LABELS[saturdayOption.saturday_slot]
          : null;
        return {
          eyebrow: "Change placement",
          title: "Save this placement change?",
          body: (
            <>
              <span className="font-medium text-ink">{name}</span> will move to{" "}
              <span className="font-medium text-ink">{parishName}</span> ·{" "}
              <span className="font-medium text-ink">{batchName}</span>
              {saturdayLabel ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-medium text-ink">{saturdayLabel}</span>
                </>
              ) : null}
              {pendingConfirm.reason.trim()
                ? `. Reason: ${pendingConfirm.reason.trim()}`
                : "."}{" "}
              Previous scorecards are kept.
            </>
          ),
          confirmLabel: "Save placement",
          destructive: false,
        };
      }
      case "saveStatus": {
        const bits: string[] = [];
        if (pendingConfirm.enrolmentStatusChanged) {
          bits.push(
            `enrolment to ${ENROLMENT_STATUS_META[pendingConfirm.enrolmentStatus].label}`,
          );
        }
        if (pendingConfirm.paymentStatusChanged) {
          bits.push(
            `payment to ${PAYMENT_STATUS_META[pendingConfirm.paymentStatus].label}`,
          );
        }
        const accepting =
          pendingConfirm.enrolmentStatusChanged &&
          pendingConfirm.enrolmentStatus === "accepted";
        return {
          eyebrow: "Update status",
          title: accepting
            ? "Accept this student and send email?"
            : "Save status changes?",
          body: (
            <>
              This will update{" "}
              <span className="font-medium text-ink">{name}</span>
              {bits.length > 0 ? (
                <>
                  {" "}
                  ({bits.join(" and ")})
                </>
              ) : (
                "."
              )}
              {accepting
                ? " An acceptance email will be sent — please wait until it finishes."
                : ""}
              {pendingConfirm.paymentStatus === "paid" &&
              pendingConfirm.paymentStatusChanged
                ? " Marking payment paid syncs the programme fee."
                : ""}
            </>
          ),
          confirmLabel: accepting ? "Accept and email" : "Save changes",
          destructive: false,
        };
      }
      case "saveContact":
        return {
          eyebrow: "Edit contact",
          title: "Save contact details?",
          body: (
            <>
              This updates the contact details on{" "}
              <span className="font-medium text-ink">{name}</span>
              &apos;s enrolment file.
            </>
          ),
          confirmLabel: "Save contact",
          destructive: false,
        };
    }
  })();

  return (
    <div className="relative space-y-4" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy && !pendingConfirm}
        label={busyLabel ?? "Working…"}
      />

      <nav
        className="flex flex-wrap items-center gap-2 text-xs text-ink/50"
        aria-label="Breadcrumb"
      >
        <Link
          href="/admin/students"
          className="font-medium text-pine hover:underline"
        >
          Students
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-ink/70">{name}</span>
      </nav>

      <nav className="flex flex-wrap gap-2" aria-label="Related desks">
        <Link
          href={`/admin/records/${student.id}?from=${encodeURIComponent(relatedFrom)}`}
          className="inline-flex min-h-[2.25rem] items-center justify-center border border-pine/30 bg-white/70 px-3 py-1.5 text-sm font-medium text-pine hover:border-pine"
        >
          Scorecard
        </Link>
        {hasPaymentActivity ? (
          <Link
            href={paymentsHref}
            className="inline-flex min-h-[2.25rem] items-center justify-center border border-pine/30 bg-white/70 px-3 py-1.5 text-sm font-medium text-pine hover:border-pine"
          >
            {hasPaymentReview ? "Payments · review proof" : "Payments"}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setPaymentEmptyOpen(true)}
            className="inline-flex min-h-[2.25rem] items-center justify-center border border-pine/30 bg-white/70 px-3 py-1.5 text-sm font-medium text-pine hover:border-pine"
          >
            Payments
          </button>
        )}
      </nav>

      <section className="border border-stone bg-mist/40">
        <StudentDossier
          student={student}
          profile={profile}
          parishes={parishes}
          batches={batches}
          saturdayOptions={saturdayOptions}
          pending={busy}
          busyLabel={busyLabel}
          revealedPassword={revealedPassword}
          backHref={backHref}
          onRun={run}
          onRequestConfirm={setPendingConfirm}
          onCopyPassword={copyPassword}
        />
      </section>

      {pendingConfirm && confirmCopy ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Working…"}
            />
            <p
              className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
                confirmCopy.destructive ? "text-red-800/80" : "text-celadon"
              }`}
            >
              {confirmCopy.eyebrow}
            </p>
            <h3
              id="student-confirm-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              {confirmCopy.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              {confirmCopy.body}
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
                  confirmCopy.destructive
                    ? "bg-[#5c2a2a] hover:bg-red-900"
                    : "bg-pine hover:bg-celadon"
                }`}
              >
                {busy ? (
                  <DeskLoader label="Working…" tone="mist" />
                ) : (
                  confirmCopy.confirmLabel
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {paymentEmptyOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => setPaymentEmptyOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-empty-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Programme fee
            </p>
            <h3
              id="payment-empty-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              No payment yet
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              <span className="font-medium text-ink">{name}</span> has not
              started the £350 programme fee. There is nothing waiting on the
              Payments desk for this student.
            </p>
            <dl className="mt-5 space-y-2 border border-stone bg-white/60 px-4 py-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink/55">Due</dt>
                <dd className="font-medium tabular-nums text-pine">
                  {formatGbp(dueGbp > 0 ? dueGbp : 350)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink/55">Paid</dt>
                <dd className="tabular-nums text-ink/70">
                  {formatGbp(paidGbp)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink/55">Left</dt>
                <dd className="tabular-nums text-ink/70">
                  {formatGbp(remainingGbp > 0 ? remainingGbp : dueGbp || 350)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-ink/50">
              Fee progress also appears under Manage → Fees on this file. When
              they pay by card or upload bank proof, use Payments to review.
            </p>
            <div className="mt-7 flex justify-end">
              <button
                type="button"
                onClick={() => setPaymentEmptyOpen(false)}
                className="bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
