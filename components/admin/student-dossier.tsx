"use client";

import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  getAdminStudentPathDetail,
  reassignEnrolmentBatch,
  resetStudentPassword,
  setManualsSent,
  sendManualsPart,
  setStudentActive,
  unlockStudentExamMonth,
  upgradeAlumniToStudent,
  updateEnrolmentContact,
  updateEnrolmentStatus,
  updatePaymentStatus,
  type StudentActionResult,
  type StudentPathDetail,
} from "@/app/admin/students/actions";
import { DeskLoader } from "@/components/ui/desk-loader";
import {
  ENROLMENT_STATUS_META,
  ENROLMENT_STATUSES,
  formatAdminDate,
  PAYMENT_STATUS_META,
  PAYMENT_STATUSES,
  studentFullName,
  type AdminStudentRecord,
} from "@/lib/admin/students";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { ATTENDANCE_MODES } from "@/lib/enrol/schema";
import { FEE_STATUS_META, formatGbp } from "@/lib/payments/fees";
import {
  ACCOUNT_KIND_LABELS,
} from "@/lib/student/account";
import { formatBatchLabel, formatBatchPlacementLabel, type Batch, type Parish } from "@/lib/parishes";

const fieldClass =
  "w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

type DossierTab = "profile" | "application" | "path" | "manage";

type Props = {
  student: AdminStudentRecord;
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Pick<
    Batch,
    "id" | "parish_id" | "name" | "year" | "enrolment_open" | "is_active"
  >[];
  pending: boolean;
  busyLabel: string | null;
  revealedPassword: string | null;
  onBack?: () => void;
  onRun: (
    action: () => Promise<StudentActionResult>,
    options?: { clearPassword?: boolean; label?: string },
  ) => void;
  onDeleteRequest: () => void;
  onCopyPassword: (value: string) => void;
};

function programmeLabel(mode: string) {
  return ATTENDANCE_MODES.find((item) => item.value === mode)?.label ?? mode;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid gap-1 border-t border-stone/70 py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed text-ink">{value}</dd>
    </div>
  );
}

function MetaTile({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border border-stone/70 bg-white/50 px-3 py-2.5">
      <p className="text-[0.58rem] font-medium uppercase tracking-[0.12em] text-ink/40">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm text-pine ${mono ? "font-mono text-xs" : "font-medium"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function StudentDossier({
  student,
  profile,
  parishes,
  batches,
  pending,
  busyLabel,
  revealedPassword,
  onBack,
  onRun,
  onDeleteRequest,
  onCopyPassword,
}: Props) {
  const national = isNationalAdmin(profile);
  const [tab, setTab] = useState<DossierTab>("profile");
  const [pathDetail, setPathDetail] = useState<StudentPathDetail | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const enrol = student.enrolment;

  const [assignParishId, setAssignParishId] = useState(
    enrol?.parish_id ?? profile.parish_id ?? "",
  );
  const [assignBatchId, setAssignBatchId] = useState(enrol?.batch_id ?? "");
  const [assignReason, setAssignReason] = useState("");

  useEffect(() => {
    setTab("profile");
    setAssignParishId(enrol?.parish_id ?? profile.parish_id ?? "");
    setAssignBatchId(enrol?.batch_id ?? "");
    setAssignReason("");
    setPathDetail(null);
  }, [student.id, enrol?.parish_id, enrol?.batch_id, profile.parish_id]);

  useEffect(() => {
    if (tab !== "path") return;
    let cancelled = false;
    setPathLoading(true);
    void getAdminStudentPathDetail(student.id).then((next) => {
      if (!cancelled) {
        setPathDetail(next);
        setPathLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tab, student.id]);

  const assignBatches = batches
    .filter((b) => (assignParishId ? b.parish_id === assignParishId : false))
    .slice()
    .sort((a, b) => {
      const rank = (batch: typeof a) => {
        if (batch.is_active && batch.enrolment_open) return 0;
        if (batch.is_active) return 1;
        return 2;
      };
      return rank(a) - rank(b) || b.year - a.year || a.name.localeCompare(b.name);
    });

  const address = enrol
    ? [
        enrol.address_line1,
        enrol.address_line2,
        enrol.town_city,
        enrol.county,
        enrol.postcode,
        enrol.country,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="animate-panel-in">
      <header className="border-b border-stone px-3 py-4 sm:px-6 sm:py-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
          >
            <span aria-hidden>←</span> Directory
          </button>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="relative h-[5.5rem] w-[4.25rem] shrink-0 overflow-hidden border border-pine/25 bg-mist sm:h-[6.5rem] sm:w-20">
              {student.passport_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={student.passport_url}
                  alt={`Passport photo of ${studentFullName(student)}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-lg tracking-wide text-pine/35">
                  {studentFullName(student)
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() ?? "")
                    .join("") || "S"}
                </div>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-pine/80 px-1 py-0.5 text-center text-[0.55rem] uppercase tracking-[0.12em] text-white/90">
                Passport
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                {enrol?.parish_region
                  ? `Region: ${enrol.parish_region}`
                  : "Student file"}
                {enrol?.parish_name ? ` · ${enrol.parish_name}` : ""}
              </p>
              <h2 className="mt-1.5 font-display text-[clamp(1.4rem,4vw,2.2rem)] tracking-[-0.02em] text-pine">
                {studentFullName(student)}
              </h2>
              <p className="mt-1.5 truncate text-sm text-ink/60">
                {student.email}
              </p>
            </div>
          </div>
          <div className="text-left text-sm text-ink/55 sm:text-right">
            <p>Joined {formatAdminDate(student.created_at)}</p>
            <p className="mt-1">
              Seat{" "}
              <span className="font-medium text-pine">
                {student.is_active ? "active" : "paused"}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetaTile
            label="Reference"
            value={enrol?.reference ?? "—"}
            mono
          />
          <MetaTile
            label="Programme"
            value={
              enrol ? programmeLabel(enrol.attendance_mode) : "No form"
            }
          />
          <MetaTile
            label="Batch"
            value={
              enrol?.batch_name
                ? formatBatchLabel({
                    name: enrol.batch_name,
                    year: enrol.batch_year ?? 0,
                  })
                : "Unassigned"
            }
          />
          <MetaTile
            label="Path"
            value={
              student.path.exam_average != null
                ? `Avg ${student.path.exam_average}%`
                : student.path.attendance_percent != null
                  ? `Att ${student.path.attendance_percent}%`
                  : "No scorecard yet"
            }
          />
        </div>
      </header>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-stone px-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4"
        aria-label="Student dossier"
      >
        {(
          [
            { id: "profile" as const, label: "Profile" },
            { id: "application" as const, label: "Application" },
            { id: "path" as const, label: "Path" },
            { id: "manage" as const, label: "Manage" },
          ] as const
        ).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative shrink-0 px-3 py-2 text-sm font-medium ${
                active ? "text-pine" : "text-ink/45 hover:text-ink/70"
              }`}
            >
              {item.label}
              <span
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 sm:px-6 sm:py-5">
        {tab === "profile" ? (
          <ProfilePane student={student} address={address} />
        ) : null}
        {tab === "application" ? (
          <ApplicationPane student={student} />
        ) : null}
        {tab === "path" ? (
          <PathPane
            student={student}
            detail={pathDetail}
            loading={pathLoading}
            pending={pending}
            busyLabel={busyLabel}
            onRun={onRun}
            onUnlocked={() => {
              setPathLoading(true);
              void getAdminStudentPathDetail(student.id).then((next) => {
                setPathDetail(next);
                setPathLoading(false);
              });
            }}
          />
        ) : null}
        {tab === "manage" ? (
          <ManagePane
            student={student}
            national={national}
            pending={pending}
            busyLabel={busyLabel}
            revealedPassword={revealedPassword}
            parishes={parishes}
            assignParishId={assignParishId}
            assignBatchId={assignBatchId}
            assignReason={assignReason}
            assignBatches={assignBatches}
            onAssignParish={(id) => {
              setAssignParishId(id);
              setAssignBatchId("");
            }}
            onAssignBatch={setAssignBatchId}
            onAssignReason={setAssignReason}
            onRun={onRun}
            onDeleteRequest={onDeleteRequest}
            onCopyPassword={onCopyPassword}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProfilePane({
  student,
  address,
}: {
  student: AdminStudentRecord;
  address: string;
}) {
  const enrol = student.enrolment;
  if (!enrol) {
    return (
      <p className="text-sm text-ink/55">
        This account has no enrolment form — only portal login details exist.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Identity
        </p>
        <h3 className="mt-1 font-display text-xl text-pine">Who they are</h3>
        <dl className="mt-4">
          <DetailRow label="First name" value={enrol.first_name} />
          <DetailRow label="Middle" value={enrol.middle_name} />
          <DetailRow label="Surname" value={enrol.last_name} />
          <DetailRow label="Email" value={enrol.email} />
          <DetailRow label="Mobile" value={enrol.mobile_number} />
          <DetailRow label="Home tel" value={enrol.home_telephone} />
          <DetailRow
            label="Date of birth"
            value={formatAdminDate(enrol.date_of_birth)}
          />
          <DetailRow label="Nationality" value={enrol.nationality} />
          <DetailRow label="Marital" value={enrol.marital_status} />
        </dl>
      </div>
      <div>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Placement
        </p>
        <h3 className="mt-1 font-display text-xl text-pine">Where they sit</h3>
        <dl className="mt-4">
          <DetailRow label="Region" value={enrol.parish_region} />
          <DetailRow label="Parish" value={enrol.parish_name} />
          <DetailRow
            label="Batch"
            value={
              enrol.batch_name
                ? formatBatchLabel({
                    name: enrol.batch_name,
                    year: enrol.batch_year ?? 0,
                  })
                : null
            }
          />
          <DetailRow label="Assembly" value={enrol.local_church} />
          <DetailRow label="Address" value={address} />
          <DetailRow label="Reference" value={enrol.reference} />
          <DetailRow
            label="Bank ref"
            value={
              <span className="font-mono text-xs">{enrol.reference_compact}</span>
            }
          />
          <DetailRow
            label="Programme"
            value={programmeLabel(enrol.attendance_mode)}
          />
        </dl>
      </div>
    </div>
  );
}

function ApplicationPane({ student }: { student: AdminStudentRecord }) {
  const enrol = student.enrolment;
  if (!enrol) {
    return (
      <p className="text-sm text-ink/55">No application on file.</p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Faith journey
        </p>
        <dl className="mt-4">
          <DetailRow
            label="Born again"
            value={[
              enrol.born_again,
              enrol.born_again_date
                ? formatAdminDate(enrol.born_again_date)
                : null,
              enrol.born_again_where,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <DetailRow
            label="Holy Spirit"
            value={[
              enrol.baptised_holy_spirit,
              enrol.holy_spirit_date
                ? formatAdminDate(enrol.holy_spirit_date)
                : null,
              enrol.holy_spirit_where,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <DetailRow
            label="Water baptism"
            value={[
              enrol.baptised_water,
              enrol.water_baptism_date
                ? formatAdminDate(enrol.water_baptism_date)
                : null,
              enrol.water_baptism_where,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        </dl>
      </div>
      <div>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Church & work
        </p>
        <dl className="mt-4">
          <DetailRow label="Church leader" value={enrol.church_leader} />
          <DetailRow label="Activities" value={enrol.church_activities} />
          <DetailRow
            label="Occupation"
            value={[
              ...(enrol.occupations ?? []).filter((item) => item !== "Other"),
              enrol.occupation_other,
            ]
              .filter(Boolean)
              .join(", ")}
          />
          <DetailRow label="Schools" value={enrol.schools_attended} />
          <DetailRow
            label="Submitted"
            value={formatAdminDate(enrol.created_at)}
          />
          <DetailRow
            label="Status"
            value={ENROLMENT_STATUS_META[enrol.status].label}
          />
        </dl>
      </div>
    </div>
  );
}

function PathPane({
  student,
  detail,
  loading,
  pending,
  busyLabel,
  onRun,
  onUnlocked,
}: {
  student: AdminStudentRecord;
  detail: StudentPathDetail | null;
  loading: boolean;
  pending: boolean;
  busyLabel: string | null;
  onRun: (
    action: () => Promise<StudentActionResult>,
    options?: { clearPassword?: boolean; label?: string },
  ) => void;
  onUnlocked: () => void;
}) {
  const presentMonths = new Set(
    (detail?.sessions ?? [])
      .filter((s) => s.present && s.month_index != null)
      .map((s) => Number(s.month_index)),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Course path
          </p>
          <h3 className="mt-1 font-display text-xl text-pine">
            Attendance & exams
          </h3>
          <p className="mt-1 text-sm text-ink/55">
            Same shape as the old cohort spreadsheet — present marks and %
            scores.
          </p>
        </div>
        <Link
          href="/admin/records"
          className="text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4"
        >
          Open Records desk →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetaTile
          label="Attendance"
          value={
            student.path.attendance_percent != null
              ? `${student.path.attendance_percent}%`
              : "—"
          }
        />
        <MetaTile
          label="Sessions"
          value={`${student.path.sessions_present}/${student.path.sessions_total}`}
        />
        <MetaTile
          label="Exam avg"
          value={
            student.path.exam_average != null
              ? `${student.path.exam_average}%`
              : "—"
          }
        />
        <MetaTile
          label="Exam entries"
          value={String(student.path.exam_entries)}
        />
      </div>

      <div className="border border-stone bg-white/40 px-4 py-4">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
          Unlock exam month
        </p>
        <p className="mt-1 text-sm text-ink/55">
          Marks Month N present (same as Saturday attendance) so Exam Year N can
          open after prior years are passed.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const unlocked = presentMonths.has(n);
            return (
              <button
                key={n}
                type="button"
                disabled={pending || unlocked}
                onClick={() =>
                  onRun(
                    async () => {
                      const result = await unlockStudentExamMonth(
                        student.id,
                        n,
                      );
                      if (result.ok) onUnlocked();
                      return result;
                    },
                    { label: `Unlocking month ${n}…` },
                  )
                }
                className={`min-w-[2.5rem] border px-2 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  unlocked
                    ? "border-celadon/40 bg-celadon/10 text-pine"
                    : "border-pine/25 text-pine hover:border-pine"
                }`}
                title={
                  unlocked
                    ? `Month ${n} already present`
                    : `Mark Month ${n} present`
                }
              >
                {unlocked ? `M${n} ✓` : `M${n}`}
              </button>
            );
          })}
        </div>
        {pending && busyLabel ? (
          <p className="mt-2 text-xs text-ink/45">{busyLabel}</p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-ink/45">Loading scorecard…</p>
      ) : !detail ? (
        <p className="border border-dashed border-stone px-4 py-8 text-center text-sm text-ink/50">
          No scorecard yet. Mark attendance or release an exam from Records /
          Exams Queue.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
              Attendance
            </p>
            <ul className="mt-2 max-h-64 divide-y divide-stone overflow-y-auto border-y border-stone">
              {detail.sessions.length === 0 ? (
                <li className="py-6 text-center text-sm text-ink/45">
                  No sessions
                </li>
              ) : (
                detail.sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="truncate">
                      {s.label || s.session_date}
                      {s.month_index != null ? (
                        <span className="ml-1 text-[0.65rem] text-ink/40">
                          · M{s.month_index}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`font-mono text-xs uppercase ${
                        s.present ? "text-celadon" : "text-ink/35"
                      }`}
                    >
                      {s.present ? "Y" : "N"}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
              Exam scores
            </p>
            <ul className="mt-2 max-h-64 divide-y divide-stone overflow-y-auto border-y border-stone">
              {detail.entries.length === 0 ? (
                <li className="py-6 text-center text-sm text-ink/45">
                  No scores
                </li>
              ) : (
                detail.entries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {e.label}
                      {!e.include_in_total ? (
                        <span className="ml-1 text-[0.65rem] text-ink/35">
                          (excl.)
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-pine">
                      {e.percent}%{e.passed ? " pass" : ""}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ManagePane({
  student,
  national,
  pending,
  busyLabel,
  revealedPassword,
  parishes,
  assignParishId,
  assignBatchId,
  assignReason,
  assignBatches,
  onAssignParish,
  onAssignBatch,
  onAssignReason,
  onRun,
  onDeleteRequest,
  onCopyPassword,
}: {
  student: AdminStudentRecord;
  national: boolean;
  pending: boolean;
  busyLabel: string | null;
  revealedPassword: string | null;
  parishes: Pick<Parish, "id" | "name">[];
  assignParishId: string;
  assignBatchId: string;
  assignReason: string;
  assignBatches: Pick<
    Batch,
    "id" | "parish_id" | "name" | "year" | "enrolment_open" | "is_active"
  >[];
  onAssignParish: (id: string) => void;
  onAssignBatch: (id: string) => void;
  onAssignReason: (value: string) => void;
  onRun: (
    action: () => Promise<StudentActionResult>,
    options?: { clearPassword?: boolean; label?: string },
  ) => void;
  onDeleteRequest: () => void;
  onCopyPassword: (value: string) => void;
}) {
  const enrol = student.enrolment;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Status
          </p>
          <h3 className="mt-1 font-display text-xl text-pine">Enrolment</h3>
          {enrol ? (
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                Enrolment status
                <select
                  value={enrol.status}
                  disabled={pending}
                  onChange={(event) =>
                    onRun(
                      () =>
                        updateEnrolmentStatus(enrol.id, event.target.value),
                      { label: "Updating enrolment…" },
                    )
                  }
                  className={`mt-1 ${fieldClass}`}
                >
                  {ENROLMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ENROLMENT_STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Application payment (enrolment)
                <select
                  value={enrol.payment_status}
                  disabled={pending}
                  onChange={(event) =>
                    onRun(
                      () => updatePaymentStatus(enrol.id, event.target.value),
                      { label: "Updating payment…" },
                    )
                  }
                  className={`mt-1 ${fieldClass}`}
                >
                  {PAYMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {PAYMENT_STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </label>
              {enrol.payment_status === "pending_review" ? (
                <Link
                  href="/admin/payments"
                  className="inline-flex text-sm font-medium text-pine underline"
                >
                  Review bank proof on Payments →
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink/55">No enrolment to update.</p>
          )}
        </div>

        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Fees
          </p>
          <ul className="mt-3 divide-y divide-stone border-y border-stone">
            {student.fees.length === 0 ? (
              <li className="py-4 text-sm text-ink/45">
                No fee rows yet (tuition / graduation).
              </li>
            ) : (
              student.fees.map((fee) => (
                <li
                  key={fee.fee_type}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="capitalize">{fee.fee_type}</span>
                  <span className="text-ink/60">
                    {formatGbp(fee.amount_paid_gbp)} /{" "}
                    {formatGbp(fee.amount_due_gbp)} ·{" "}
                    {FEE_STATUS_META[fee.status]?.label ?? fee.status}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        {enrol ? (
          <ContactEditor
            enrol={enrol}
            pending={pending}
            busyLabel={busyLabel}
            onSave={(values) => {
              onRun(() => updateEnrolmentContact(enrol.id, values), {
                label: "Saving contact…",
              });
            }}
          />
        ) : null}
      </div>

      <div className="space-y-6">
        {enrol ? (
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Placement
            </p>
            <h3 className="mt-1 font-display text-xl text-pine">
              Reassign parish / batch
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">
              Closed or retired batches stay available for late placement.
              Previous scorecards are kept when you move year (batch) or Saturday
              cohort. Students may only switch Saturday temporarily themselves.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {national ? (
                <label className="block text-sm">
                  Parish
                  <select
                    value={assignParishId}
                    onChange={(e) => onAssignParish(e.target.value)}
                    className={`mt-1 ${fieldClass}`}
                  >
                    <option value="">Select parish</option>
                    {parishes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block text-sm">
                Batch
                <select
                  value={assignBatchId}
                  onChange={(e) => onAssignBatch(e.target.value)}
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="">Select batch</option>
                  {assignBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {formatBatchPlacementLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Reason for move
                <input
                  value={assignReason}
                  onChange={(e) => onAssignReason(e.target.value)}
                  placeholder="Optional — e.g. availability, pastoral request"
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
              <button
                type="button"
                disabled={pending || !assignParishId || !assignBatchId}
                onClick={() =>
                  onRun(
                    () =>
                      reassignEnrolmentBatch(
                        enrol.id,
                        assignParishId,
                        assignBatchId,
                        { reason: assignReason },
                      ),
                    { label: "Saving placement…" },
                  )
                }
                className="inline-flex min-h-[2.5rem] min-w-[8.5rem] items-center justify-center border border-pine px-4 py-2.5 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-50"
              >
                {pending && busyLabel?.startsWith("Saving placement") ? (
                  <DeskLoader label={busyLabel} />
                ) : (
                  "Save placement"
                )}
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Manuals
          </p>
          <h3 className="mt-1 font-display text-xl text-pine">Course manuals</h3>
          <p className="mt-2 text-sm text-ink/60">
            Send manuals in three parts. Each send notifies the student by email.
          </p>
          <ul className="mt-4 space-y-2">
            {(
              [
                {
                  part: 1 as const,
                  at: student.manuals_1_sent_at,
                  label: "Send 1 of 3",
                },
                {
                  part: 2 as const,
                  at: student.manuals_2_sent_at,
                  label: "Send 2 of 3",
                },
                {
                  part: 3 as const,
                  at: student.manuals_3_sent_at,
                  label: "Send 3 of 3",
                },
              ] as const
            ).map((item) => (
              <li
                key={item.part}
                className="flex flex-wrap items-center justify-between gap-2 border border-stone bg-white/50 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-pine">{item.label}</p>
                  <p className="text-xs text-ink/50">
                    {item.at
                      ? `Sent ${formatAdminDate(item.at)}`
                      : "Not sent yet"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending || Boolean(item.at)}
                  onClick={() =>
                    onRun(() => sendManualsPart(student.id, item.part), {
                      label: `Sending manuals ${item.part}…`,
                    })
                  }
                  className="inline-flex min-h-[2.25rem] min-w-[7.5rem] items-center justify-center border border-pine/25 px-3 py-1.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-45"
                >
                  {pending &&
                  busyLabel?.startsWith(`Sending manuals ${item.part}`) ? (
                    <DeskLoader label={busyLabel} />
                  ) : item.at ? (
                    "Sent"
                  ) : (
                    "Send now"
                  )}
                </button>
              </li>
            ))}
          </ul>
          {(student.manuals_1_sent_at ||
            student.manuals_2_sent_at ||
            student.manuals_3_sent_at) && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                onRun(() => setManualsSent(student.id, false), {
                  label: "Clearing manuals…",
                })
              }
              className="mt-3 text-xs font-medium text-ink/50 underline hover:text-pine disabled:opacity-50"
            >
              Clear all manuals sends
            </button>
          )}
        </div>

        {student.account_kind === "alumni" ? (
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Alumni
            </p>
            <h3 className="mt-1 font-display text-xl text-pine">Re-entry</h3>
            <p className="mt-2 text-sm text-ink/60">
              {ACCOUNT_KIND_LABELS.alumni} — uses the alumni portal until
              upgraded.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                onRun(() => upgradeAlumniToStudent(student.id), {
                  label: "Upgrading seat…",
                })
              }
              className="mt-4 inline-flex min-h-[2.5rem] min-w-[11rem] items-center justify-center border border-pine px-4 py-2.5 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-50"
            >
              {pending && busyLabel?.startsWith("Upgrading") ? (
                <DeskLoader label={busyLabel} />
              ) : (
                "Upgrade to active student"
              )}
            </button>
          </div>
        ) : null}

        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Account
          </p>
          <h3 className="mt-1 font-display text-xl text-pine">Seat tools</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                onRun(
                  () => setStudentActive(student.id, !student.is_active),
                  {
                    label: student.is_active
                      ? "Pausing seat…"
                      : "Reactivating…",
                  },
                )
              }
              className="inline-flex min-h-[2.5rem] min-w-[6.5rem] items-center justify-center border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
            >
              {pending &&
              (busyLabel?.startsWith("Pausing") ||
                busyLabel?.startsWith("Reactivating")) ? (
                <DeskLoader label={busyLabel} />
              ) : student.is_active ? (
                "Pause seat"
              ) : (
                "Reactivate"
              )}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                onRun(() => resetStudentPassword(student.id), {
                  label: "Resetting password…",
                })
              }
              className="inline-flex min-h-[2.5rem] min-w-[10rem] items-center justify-center border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
            >
              {pending && busyLabel?.startsWith("Resetting") ? (
                <DeskLoader label={busyLabel} />
              ) : (
                "New temporary password"
              )}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onDeleteRequest}
              className="border border-red-800/30 px-4 py-2.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
            >
              Remove student
            </button>
          </div>
          {revealedPassword ? (
            <div className="mt-4 border border-pine/20 bg-stone/40 px-4 py-4">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                Temporary password
              </p>
              <p className="mt-2 font-mono text-lg tracking-wide text-pine">
                {revealedPassword}
              </p>
              <button
                type="button"
                onClick={() => onCopyPassword(revealedPassword)}
                className="mt-3 text-sm font-medium text-pine underline"
              >
                Copy password
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ContactEditor({
  enrol,
  pending,
  busyLabel,
  onSave,
}: {
  enrol: NonNullable<AdminStudentRecord["enrolment"]>;
  pending: boolean;
  busyLabel: string | null;
  onSave: (values: {
    mobile_number: string;
    home_telephone: string;
    address_line1: string;
    address_line2: string;
    town_city: string;
    county: string;
    postcode: string;
    country: string;
    local_church: string;
    church_leader: string;
    church_activities: string;
  }) => void;
}) {
  const [mobile, setMobile] = useState(enrol.mobile_number);
  const [home, setHome] = useState(enrol.home_telephone ?? "");
  const [line1, setLine1] = useState(enrol.address_line1);
  const [line2, setLine2] = useState(enrol.address_line2 ?? "");
  const [town, setTown] = useState(enrol.town_city);
  const [county, setCounty] = useState(enrol.county ?? "");
  const [postcode, setPostcode] = useState(enrol.postcode);
  const [country, setCountry] = useState(enrol.country);
  const [church, setChurch] = useState(enrol.local_church ?? "");
  const [leader, setLeader] = useState(enrol.church_leader);
  const [activities, setActivities] = useState(enrol.church_activities ?? "");

  useEffect(() => {
    setMobile(enrol.mobile_number);
    setHome(enrol.home_telephone ?? "");
    setLine1(enrol.address_line1);
    setLine2(enrol.address_line2 ?? "");
    setTown(enrol.town_city);
    setCounty(enrol.county ?? "");
    setPostcode(enrol.postcode);
    setCountry(enrol.country);
    setChurch(enrol.local_church ?? "");
    setLeader(enrol.church_leader);
    setActivities(enrol.church_activities ?? "");
  }, [enrol]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      mobile_number: mobile,
      home_telephone: home,
      address_line1: line1,
      address_line2: line2,
      town_city: town,
      county,
      postcode,
      country,
      local_church: church,
      church_leader: leader,
      church_activities: activities,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-stone pt-5">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
        Edit contact
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-ink/50">
          Mobile
          <input
            required
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50">
          Home telephone
          <input
            value={home}
            onChange={(e) => setHome(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50 sm:col-span-2">
          Address line 1
          <input
            required
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50 sm:col-span-2">
          Address line 2
          <input
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50">
          Town / city
          <input
            required
            value={town}
            onChange={(e) => setTown(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50">
          County
          <input
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50">
          Postcode
          <input
            required
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50">
          Country
          <input
            required
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50 sm:col-span-2">
          Assembly / local church
          <input
            value={church}
            onChange={(e) => setChurch(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50">
          Church leader
          <input
            required
            value={leader}
            onChange={(e) => setLeader(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-xs text-ink/50">
          Activities
          <input
            value={activities}
            onChange={(e) => setActivities(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[2.5rem] min-w-[7.5rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist disabled:opacity-60"
      >
        {pending && busyLabel?.startsWith("Saving contact") ? (
          <DeskLoader label={busyLabel} tone="mist" />
        ) : (
          "Save contact"
        )}
      </button>
    </form>
  );
}
