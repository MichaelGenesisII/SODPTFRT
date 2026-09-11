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
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
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
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";

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
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [paymentEmptyOpen, setPaymentEmptyOpen] = useState(false);

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
    options?: {
      clearPassword?: boolean;
      label?: string;
      leaveAfter?: boolean;
      quiet?: boolean;
    },
  ) {
    setBusyLabel(options?.label ?? "Working…");
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          if (next.temporaryPassword) {
            setRevealedPassword(next.temporaryPassword);
          } else if (options?.clearPassword) {
            setRevealedPassword(null);
          }
          if (!options?.quiet && !next.temporaryPassword) {
            await deskSuccess({ text: next.message });
          }
          if (options?.leaveAfter) {
            router.push(backHref);
          }
          router.refresh();
        } else {
          await deskError({ text: next.message });
        }
      } catch (err) {
        console.error("[students/detail]", err);
        await deskError({
          text: "Something went wrong. Please try again.",
        });
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function copyPassword(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      await deskError({ text: "Could not copy to clipboard." });
    }
  }

  async function requestConfirm(confirm: StudentPendingConfirm) {
    if (busy) return;
    const name = studentFullName(student);

    switch (confirm.kind) {
      case "delete": {
        const ok = await deskConfirm({
          title: `Remove ${name}?`,
          text: `This permanently deletes their sign-in account, student seat, and enrolment record. Joined ${formatAdminDate(student.created_at)}. This cannot be undone.`,
          confirmLabel: "Remove permanently",
          danger: true,
        });
        if (!ok) return;
        run(() => deleteStudentAccount(student.id), {
          clearPassword: true,
          label: "Removing student…",
          leaveAfter: true,
          quiet: true,
        });
        return;
      }
      case "pause": {
        const ok = await deskConfirm({
          title: "Pause this student seat?",
          text: `${name} will not be able to sign in until you reactivate the seat. They are notified by email.`,
          confirmLabel: "Pause seat",
          danger: true,
        });
        if (!ok) return;
        run(() => setStudentActive(student.id, false), {
          label: "Pausing seat…",
        });
        return;
      }
      case "reactivate": {
        const ok = await deskConfirm({
          title: "Reactivate this student seat?",
          text: `${name} will be able to sign in again.`,
          confirmLabel: "Reactivate",
        });
        if (!ok) return;
        run(() => setStudentActive(student.id, true), {
          label: "Reactivating…",
        });
        return;
      }
      case "password": {
        const ok = await deskConfirm({
          title: "Issue a new temporary password?",
          text: `A new password will be generated for ${name}. Their current password will stop working. Share the new one securely.`,
          confirmLabel: "Issue password",
        });
        if (!ok) return;
        run(() => resetStudentPassword(student.id), {
          label: "Resetting password…",
          quiet: true,
        });
        return;
      }
      case "clearManuals": {
        const ok = await deskConfirm({
          title: "Clear all manuals send marks?",
          text: `This resets the sent status for parts 1–3 on ${name}’s file so you can send again. It does not recall emails already delivered.`,
          confirmLabel: "Clear sends",
        });
        if (!ok) return;
        run(() => setManualsSent(student.id, false), {
          label: "Clearing manuals…",
        });
        return;
      }
      case "upgrade": {
        const ok = await deskConfirm({
          title: "Upgrade to active student?",
          text: `${name} will move from the alumni portal to a full student seat.`,
          confirmLabel: "Upgrade seat",
        });
        if (!ok) return;
        run(() => upgradeAlumniToStudent(student.id), {
          label: "Upgrading seat…",
        });
        return;
      }
      case "sendManuals": {
        const ok = await deskConfirm({
          title: `Send manuals part ${confirm.part} of 3?`,
          text: `${name} will receive an email for this manuals part. Only send when the files are ready.`,
          confirmLabel: `Send part ${confirm.part}`,
        });
        if (!ok) return;
        run(() => sendManualsPart(student.id, confirm.part), {
          label: `Sending manuals ${confirm.part}…`,
        });
        return;
      }
      case "savePlacement": {
        const parishName =
          parishes.find((p) => p.id === confirm.parishId)?.name ??
          "selected parish";
        const batch =
          batches.find((b) => b.id === confirm.batchId) ?? null;
        const batchName = batch
          ? formatBatchPlacementLabel(batch)
          : "selected batch";
        const saturdayOption = confirm.saturdayCohortId
          ? saturdayOptions.find((o) => o.id === confirm.saturdayCohortId)
          : null;
        const saturdayLabel = saturdayOption
          ? saturdayOption.label ||
            SATURDAY_SLOT_LABELS[saturdayOption.saturday_slot]
          : null;
        const reasonBit = confirm.reason.trim()
          ? ` Reason: ${confirm.reason.trim()}.`
          : "";
        const ok = await deskConfirm({
          title: "Save this placement change?",
          text: `${name} will move to ${parishName} · ${batchName}${
            saturdayLabel ? ` · ${saturdayLabel}` : ""
          }.${reasonBit} Previous scorecards are kept.`,
          confirmLabel: "Save placement",
        });
        if (!ok) return;
        run(
          () =>
            reassignEnrolmentBatch(
              confirm.enrolmentId,
              confirm.parishId,
              confirm.batchId,
              {
                reason: confirm.reason,
                saturdayCohortId: confirm.saturdayCohortId,
              },
            ),
          { label: "Saving placement…" },
        );
        return;
      }
      case "saveStatus": {
        const bits: string[] = [];
        if (confirm.enrolmentStatusChanged) {
          bits.push(
            `enrolment to ${ENROLMENT_STATUS_META[confirm.enrolmentStatus].label}`,
          );
        }
        if (confirm.paymentStatusChanged) {
          bits.push(
            `payment to ${PAYMENT_STATUS_META[confirm.paymentStatus].label}`,
          );
        }
        const accepting =
          confirm.enrolmentStatusChanged &&
          confirm.enrolmentStatus === "accepted";
        const paidNote =
          confirm.paymentStatus === "paid" && confirm.paymentStatusChanged
            ? " Marking payment paid syncs the programme fee."
            : "";
        const ok = await deskConfirm({
          title: accepting
            ? "Accept this student and send email?"
            : "Save status changes?",
          text: `This will update ${name}${
            bits.length > 0 ? ` (${bits.join(" and ")})` : "."
          }${
            accepting
              ? " An acceptance email will be sent — please wait until it finishes."
              : ""
          }${paidNote}`,
          confirmLabel: accepting ? "Accept and email" : "Save changes",
        });
        if (!ok) return;
        run(
          async () => {
            let last: StudentActionResult = {
              ok: true,
              message: "Status updated.",
            };
            if (confirm.enrolmentStatusChanged) {
              last = await updateEnrolmentStatus(
                confirm.enrolmentId,
                confirm.enrolmentStatus,
              );
              if (!last.ok) return last;
            }
            if (confirm.paymentStatusChanged) {
              last = await updatePaymentStatus(
                confirm.enrolmentId,
                confirm.paymentStatus,
              );
            }
            return last;
          },
          {
            label: accepting
              ? "Accepting and sending email…"
              : "Updating status…",
          },
        );
        return;
      }
      case "saveContact": {
        run(
          () =>
            updateEnrolmentContact(confirm.enrolmentId, confirm.values),
          { label: "Saving contact…", quiet: true },
        );
        return;
      }
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

  return (
    <div className="relative space-y-4" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy}
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
          onRequestConfirm={(confirm) => void requestConfirm(confirm)}
          onCopyPassword={(value) => void copyPassword(value)}
        />
      </section>

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
