"use client";

import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assignAlumniEmail } from "@/app/admin/alumni/actions";
import { upgradeAlumniToStudent } from "@/app/admin/students/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import type { AlumniLegacyPerson } from "@/lib/alumni/types";
import { formatGbp } from "@/lib/payments/fees";

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50";

type PendingConfirm =
  | { kind: "assignEmail"; email: string; sendMail: boolean }
  | { kind: "upgrade"; userId: string };

function formatAlumniDob(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }
  return value;
}

function examAverage(person: AlumniLegacyPerson): number | null {
  const scored = person.exams.filter((e) => e.percent != null);
  if (!scored.length) return null;
  return (
    Math.round(
      (scored.reduce((sum, e) => sum + Number(e.percent), 0) / scored.length) *
        10,
    ) / 10
  );
}

function sessionsPresent(person: AlumniLegacyPerson): {
  present: number;
  total: number;
} {
  const total = person.sessions.length;
  const present = person.sessions.filter((s) => s.present).length;
  return { present, total };
}

export function AlumniDetailWorkspace({
  person,
  backHref = "/admin/alumni",
}: {
  person: AlumniLegacyPerson;
  backHref?: string;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [emailDraft, setEmailDraft] = useState(person.email ?? "");
  const [sendMail, setSendMail] = useState(true);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

  const avg = examAverage(person);
  const attendance = sessionsPresent(person);
  const displayName = person.display_name?.trim() || "this alumnus";

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

  function run(
    action: () => Promise<{ ok: boolean; message: string }>,
    label: string,
    onOk?: () => void,
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          success(result.message);
          setPendingConfirm(null);
          onOk?.();
        } else {
          error(result.message);
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    if (pendingConfirm.kind === "upgrade") {
      run(
        () => upgradeAlumniToStudent(pendingConfirm.userId),
        "Upgrading to student…",
        () => router.refresh(),
      );
      return;
    }
    run(
      () =>
        assignAlumniEmail({
          legacyId: person.id,
          email: pendingConfirm.email,
          sendAccessEmail: pendingConfirm.sendMail,
        }),
      "Assigning email…",
      () => router.refresh(),
    );
  }

  const confirmCopy =
    pendingConfirm?.kind === "upgrade"
      ? {
          eyebrow: "Upgrade seat",
          title: "Upgrade to the student portal?",
          body: (
            <>
              <span className="font-medium text-ink">{displayName}</span> will
              move from alumni login to a full student seat.
            </>
          ),
          confirmLabel: "Upgrade to student",
        }
      : pendingConfirm?.kind === "assignEmail"
        ? {
            eyebrow: "Portal access",
            title: "Open alumni portal access?",
            body: (
              <>
                Creates portal access for{" "}
                <span className="font-medium text-ink">{displayName}</span> at{" "}
                <span className="font-medium text-ink">
                  {pendingConfirm.email}
                </span>
                {pendingConfirm.sendMail
                  ? ". Temporary access details will be emailed."
                  : ". No access email will be sent."}
              </>
            ),
            confirmLabel: pendingConfirm.sendMail
              ? "Save & email access"
              : "Save & open portal",
          }
        : null;

  return (
    <div className="relative" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy && !pendingConfirm}
        label={busyLabel ?? "Working…"}
      />

      <div className="border border-stone bg-mist">
        <header className="border-b border-stone px-3 py-4 sm:px-5">
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
          >
            <span aria-hidden>←</span> Alumni
          </Link>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Alumni file
            {person.batch_year ? ` · Batch ${person.batch_year}` : ""}
          </p>
          <h2 className="mt-1 font-display text-[clamp(1.35rem,3.5vw,1.85rem)] tracking-[-0.02em] text-pine">
            {displayName}
          </h2>
          <p className="mt-1 text-sm text-ink/55">
            {[person.centre, person.student_id].filter(Boolean).join(" · ") ||
              "Legacy register"}
          </p>
        </header>

        <div className="grid divide-y divide-stone border-b border-stone sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <MiniMetric
            label="Exam avg"
            value={avg != null ? `${avg}%` : "—"}
          />
          <MiniMetric
            label="Attendance"
            value={
              attendance.total
                ? `${attendance.present}/${attendance.total}`
                : "—"
            }
          />
          <MiniMetric
            label="Portal"
            value={person.activated_user_id ? "Ready" : "Needs email"}
          />
        </div>

        <div className="grid gap-0 lg:grid-cols-2">
          <div className="space-y-5 border-b border-stone px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r">
            <DetailSection title="Who they are">
              <InfoRow label="First name" value={person.first_name} />
              <InfoRow label="Middle name" value={person.middle_name} />
              <InfoRow label="Surname" value={person.last_name} />
              <InfoRow
                label="Date of birth"
                value={formatAlumniDob(person.date_of_birth)}
              />
              <InfoRow label="Email" value={person.email} />
              <InfoRow label="Mobile" value={person.mobile} />
              <InfoRow label="Address" value={person.address_text} />
            </DetailSection>

            <DetailSection title="Placement">
              <InfoRow label="Region" value={person.region} />
              <InfoRow label="Parish" value={person.parish} />
              <InfoRow label="Centre" value={person.centre} />
              <InfoRow label="Batch" value={person.batch_label} />
              <InfoRow label="Cohort" value={person.cohort_label} />
              <InfoRow label="Student ID" value={person.student_id} mono />
              <InfoRow label="App com ref" value={person.legacy_ref} mono />
              <InfoRow
                label="Source"
                value={
                  person.source_file
                    ? `${person.source_file}${
                        person.source_sheet
                          ? ` · ${person.source_sheet}`
                          : ""
                      }${
                        person.source_row
                          ? ` · row ${person.source_row}`
                          : ""
                      }`
                    : null
                }
              />
            </DetailSection>

            <DetailSection title="Fees & notes">
              <InfoRow
                label="Tuition"
                value={
                  person.tuition_covered
                    ? person.tuition_note || "Covered"
                    : person.tuition_paid_gbp > 0
                      ? formatGbp(person.tuition_paid_gbp)
                      : person.tuition_note
                }
              />
              <InfoRow
                label="Screenshot"
                value={
                  person.screenshot_gbp > 0
                    ? formatGbp(person.screenshot_gbp)
                    : null
                }
              />
              <InfoRow
                label="Bank statement"
                value={
                  person.bank_statement_gbp > 0
                    ? formatGbp(person.bank_statement_gbp)
                    : null
                }
              />
              <InfoRow
                label="Graduation"
                value={
                  person.graduation_paid_gbp > 0
                    ? formatGbp(person.graduation_paid_gbp)
                    : person.certificate_note
                }
              />
              <InfoRow
                label="Certificate"
                value={
                  person.certificate_note && person.graduation_paid_gbp <= 0
                    ? person.certificate_note
                    : null
                }
              />
              <InfoRow
                label="Manuals"
                value={person.manuals_sent ? "Sent" : "Not marked"}
              />
              <InfoRow label="Comments" value={person.comments} />
            </DetailSection>
          </div>

          <div className="space-y-5 px-4 py-5 sm:px-6">
            {person.exams.length ? (
              <DetailSection title="Exam marks">
                <ul className="divide-y divide-stone/60">
                  {person.exams.map((exam, i) => (
                    <li
                      key={`${exam.label}-${i}`}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-ink/75">
                        {exam.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-pine">
                        {exam.percent != null ? `${exam.percent}%` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            ) : null}

            {person.sessions.length ? (
              <DetailSection title="Attendance">
                <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                  {person.sessions.map((session, i) => (
                    <li
                      key={`${session.label}-${i}`}
                      className="flex items-center justify-between gap-3 border-b border-stone/50 py-1.5 text-sm last:border-b-0"
                    >
                      <span className="min-w-0 truncate text-ink/75">
                        {session.label}
                      </span>
                      <span
                        className={`shrink-0 text-[0.65rem] font-medium uppercase tracking-[0.1em] ${
                          session.present ? "text-celadon" : "text-ink/40"
                        }`}
                      >
                        {session.present ? "Present" : "Absent"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink/45">
                  {attendance.present}/{attendance.total} present from the batch
                  sheet
                </p>
              </DetailSection>
            ) : null}

            <div className="border border-stone bg-white/50 px-4 py-4">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Portal access
              </p>
              {person.activated_user_id ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-relaxed text-ink/65">
                    Ready for{" "}
                    <span className="break-all font-medium text-pine">
                      {person.email}
                    </span>
                    . They sign in via Alumni login.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPendingConfirm({
                        kind: "upgrade",
                        userId: person.activated_user_id!,
                      })
                    }
                    className="inline-flex min-h-[2.5rem] w-full items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
                  >
                    {busy && busyLabel?.startsWith("Upgrading") ? (
                      <DeskLoader label={busyLabel} />
                    ) : (
                      "Upgrade to student portal"
                    )}
                  </button>
                </div>
              ) : (
                <form
                  className="mt-3 space-y-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    const email = emailDraft.trim();
                    if (!email) return;
                    setPendingConfirm({
                      kind: "assignEmail",
                      email,
                      sendMail,
                    });
                  }}
                >
                  <label className="block text-sm">
                    Email for portal access
                    <input
                      type="email"
                      required
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      placeholder="alumni@example.com"
                      disabled={busy}
                      className={`mt-1 ${fieldClass}`}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink/70">
                    <input
                      type="checkbox"
                      checked={sendMail}
                      onChange={(e) => setSendMail(e.target.checked)}
                      disabled={busy}
                    />
                    Email temporary access details
                  </label>
                  <button
                    type="submit"
                    disabled={busy || !emailDraft.trim()}
                    className="inline-flex min-h-[2.5rem] w-full items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-pine/90 disabled:opacity-50"
                  >
                    {busy && busyLabel?.startsWith("Assigning") ? (
                      <DeskLoader label={busyLabel} tone="mist" />
                    ) : (
                      "Save email & open portal"
                    )}
                  </button>
                  <p className="text-xs leading-relaxed text-ink/50">
                    Batch sheets often have no email. Assign one here when the
                    alumnus is ready to sign in.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {pendingConfirm && confirmCopy ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="alumni-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Working…"}
            />
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              {confirmCopy.eyebrow}
            </p>
            <h3
              id="alumni-confirm-title"
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
                className="inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
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
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <p className="text-[0.58rem] uppercase tracking-[0.12em] text-ink/40">
        {label}
      </p>
      <p className="mt-0.5 font-display text-lg tabular-nums text-pine">
        {value}
      </p>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="border-b border-stone pb-2 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
        {title}
      </p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7rem_1fr] sm:gap-3">
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
        {label}
      </dt>
      <dd
        className={`break-words text-sm text-ink/80 ${
          mono ? "font-mono text-[0.8rem]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
