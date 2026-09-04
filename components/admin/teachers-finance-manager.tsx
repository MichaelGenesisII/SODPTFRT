"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import {
  deleteTeacher,
  inviteTeacher,
  setTeacherActive,
  updateTeacherProfile,
} from "@/app/admin/finance/teachers/actions";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { StaffAvatar } from "@/components/ui/staff-avatar";
import { useToast } from "@/components/ui/toast";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import {
  teacherDisplayName,
  type TeacherProfile,
} from "@/lib/teacher/types";

const fieldClass =
  "w-full border border-stone bg-white/70 px-4 py-3 text-sm outline-none transition-[border-color,background-color] duration-300 focus:border-pine focus:bg-mist";

const editFieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

type PendingConfirm =
  | { kind: "delete"; teacher: TeacherProfile }
  | { kind: "toggleActive"; teacher: TeacherProfile; activate: boolean };

export function TeachersFinanceManager({
  initialTeachers,
  onInviteSurfaceChange,
}: {
  initialTeachers: TeacherProfile[];
  onInviteSurfaceChange?: (open: boolean) => void;
}) {
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [teachers, setTeachers] = useState(initialTeachers);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [lastTemp, setLastTemp] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const [editTarget, setEditTarget] = useState<TeacherProfile | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const busy = pending || Boolean(busyLabel);

  useEffect(() => {
    setTeachers(initialTeachers);
  }, [initialTeachers]);

  useEffect(() => {
    if (!pendingConfirm && !editTarget) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        setPendingConfirm(null);
        setEditTarget(null);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingConfirm, editTarget, busy]);

  function openInvite() {
    setInviting(true);
    setLastTemp(null);
    onInviteSurfaceChange?.(true);
  }

  function closeInvite() {
    if (busy) return;
    setInviting(false);
    setEmail("");
    setFullName("");
    setPassword("");
    setLastTemp(null);
    onInviteSurfaceChange?.(false);
  }

  function run(
    action: () => Promise<{
      ok: boolean;
      message: string;
      temporaryPassword?: string;
    }>,
    onOk?: (message: string, temporaryPassword?: string) => void,
    label = "Working…",
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          const emailFailed = /welcome email could not/i.test(result.message);
          if (emailFailed) {
            error(result.message, "Teacher created");
          } else {
            success(result.message, "Teachers");
          }
          onOk?.(result.message, result.temporaryPassword);
        } else {
          error(result.message, "Teachers");
        }
      } catch {
        error("Something went wrong. Please try again.", "Teachers");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function onInvite(event: FormEvent) {
    event.preventDefault();
    const form = new FormData();
    form.set("email", email);
    form.set("fullName", fullName);
    form.set("password", password);
    run(
      () => inviteTeacher(form),
      (message, temp) => {
        const emailFailed = /welcome email could not/i.test(message);
        if (emailFailed && temp) {
          setLastTemp(temp);
          setPassword(temp);
          return;
        }
        setEmail("");
        setFullName("");
        setPassword("");
        setLastTemp(null);
        setInviting(false);
        onInviteSurfaceChange?.(false);
      },
      "Inviting teacher…",
    );
  }

  function openEdit(teacher: TeacherProfile) {
    setEditTarget(teacher);
    setEditName(teacher.full_name ?? "");
    setEditEmail(teacher.email);
  }

  function saveEdit() {
    if (!editTarget) return;
    const nextName = editName.trim();
    const nextEmail = editEmail.trim().toLowerCase();
    if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      error("Enter a valid email address.", "Teachers");
      return;
    }
    const id = editTarget.id;
    run(
      () =>
        updateTeacherProfile({
          teacherId: id,
          fullName: nextName,
          email: nextEmail,
        }),
      () => {
        setTeachers((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  full_name: nextName || null,
                  email: nextEmail,
                }
              : t,
          ),
        );
        setEditTarget(null);
      },
      "Saving teacher…",
    );
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    if (pendingConfirm.kind === "delete") {
      const id = pendingConfirm.teacher.id;
      run(
        () => deleteTeacher({ teacherId: id }),
        () => {
          setTeachers((prev) => prev.filter((t) => t.id !== id));
          setPendingConfirm(null);
        },
        "Deleting teacher…",
      );
      return;
    }
    const { teacher, activate } = pendingConfirm;
    run(
      () =>
        setTeacherActive({
          teacherId: teacher.id,
          isActive: activate,
        }),
      () => {
        setTeachers((prev) =>
          prev.map((t) =>
            t.id === teacher.id ? { ...t, is_active: activate } : t,
          ),
        );
        setPendingConfirm(null);
      },
      activate ? "Reactivating…" : "Deactivating…",
    );
  }

  const confirmCopy =
    pendingConfirm?.kind === "delete"
      ? {
          eyebrow: "Teachers",
          title: `Delete ${teacherDisplayName(pendingConfirm.teacher)}?`,
          body: "This removes their teacher portal access. No email is sent. If they have confirmed teaching history, deletion is blocked — deactivate instead.",
          confirmLabel: "Delete teacher",
          destructive: true,
          busyLabel: "Deleting teacher…",
        }
      : pendingConfirm?.kind === "toggleActive"
        ? pendingConfirm.activate
          ? {
              eyebrow: "Reactivate",
              title: "Reactivate this teacher?",
              body: (
                <>
                  <span className="font-medium text-ink">
                    {teacherDisplayName(pendingConfirm.teacher)}
                  </span>{" "}
                  will be able to sign in to the teacher portal again.
                </>
              ),
              confirmLabel: "Reactivate",
              destructive: false,
              busyLabel: "Reactivating…",
            }
          : {
              eyebrow: "Deactivate",
              title: "Deactivate this teacher?",
              body: (
                <>
                  <span className="font-medium text-ink">
                    {teacherDisplayName(pendingConfirm.teacher)}
                  </span>{" "}
                  will not be able to sign in until reactivated. Their teaching
                  history stays on file.
                </>
              ),
              confirmLabel: "Deactivate",
              destructive: true,
              busyLabel: "Deactivating…",
            }
        : null;

  if (inviting) {
    return (
      <div className="animate-panel-in relative space-y-4">
        <button
          type="button"
          disabled={busy}
          onClick={closeInvite}
          className="inline-flex min-h-[2.75rem] items-center gap-2 border border-pine/35 bg-white px-4 py-2.5 text-sm font-medium text-pine shadow-[0_1px_0_rgba(20,53,44,0.06)] transition-colors hover:border-pine hover:bg-mist disabled:opacity-50"
        >
          <span aria-hidden className="text-base leading-none">
            ←
          </span>
          All teachers
        </button>

        <div className="border border-stone bg-mist/40 p-4 sm:p-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Invite
          </p>
          <h2 className="mt-1 font-display text-[clamp(1.35rem,3vw,1.85rem)] tracking-[-0.02em] text-pine">
            Invite a teacher
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
            Create teacher portal access only — not an admin desk. We email them
            a temporary password.
          </p>

          <form
            className="relative mt-6 grid max-w-xl gap-4 sm:grid-cols-2"
            onSubmit={onInvite}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Inviting teacher…"}
            />
            <div className="sm:col-span-2">
              <label
                className="mb-2 block text-sm font-medium text-ink"
                htmlFor="teacherFullName"
              >
                Full name
              </label>
              <input
                id="teacherFullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={fieldClass}
                placeholder="Ada Teacher"
                disabled={busy}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="mb-2 block text-sm font-medium text-ink"
                htmlFor="teacherEmail"
              >
                Email
              </label>
              <input
                id="teacherEmail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
                placeholder="teacher@example.com"
                disabled={busy}
              />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  className="block text-sm font-medium text-ink"
                  htmlFor="teacherTempPassword"
                >
                  Temporary password
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const next = createTemporaryPassword(12);
                    setPassword(next);
                    info("Temporary password ready.", "Generated");
                  }}
                  className="text-xs font-medium text-pine underline decoration-pine/30 underline-offset-4 disabled:opacity-50"
                >
                  Generate
                </button>
              </div>
              <input
                id="teacherTempPassword"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${fieldClass} font-mono`}
                placeholder="Generate, type one, or leave blank"
                minLength={8}
                autoComplete="new-password"
                disabled={busy}
              />
              <p className="mt-1.5 text-xs text-ink/50">
                Optional — a password is generated automatically if you leave
                this blank.
              </p>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[2.75rem] min-w-[9.5rem] items-center justify-center bg-pine px-5 py-3 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60 sm:w-auto"
              >
                {busy ? (
                  <DeskLoader label="Creating…" tone="mist" />
                ) : (
                  "Create teacher"
                )}
              </button>
            </div>
          </form>

          {lastTemp ? (
            <p className="mt-4 text-sm text-ink/70">
              Temporary password (share securely if email failed):{" "}
              <span className="font-mono text-pine">{lastTemp}</span>
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={closeInvite}
              className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <DeskLoaderOverlay
        active={busy && !pendingConfirm && !editTarget}
        label={busyLabel ?? "Working…"}
      />

      <div
        data-tour="access-invite-teacher"
        className="flex flex-col gap-3 border border-stone bg-mist/40 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Teachers
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Teacher portal accounts only. Assign them to classes on Classes.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={openInvite}
          className="inline-flex min-h-[2.5rem] shrink-0 items-center justify-center bg-pine px-4 py-2 text-sm font-medium text-mist disabled:opacity-50"
        >
          Invite teacher
        </button>
      </div>

      <section className="border border-stone bg-mist/30">
        <div className="border-b border-stone px-4 py-3 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Directory
          </p>
          <h2 className="mt-1 font-display text-xl text-pine">Teachers</h2>
        </div>
        {teachers.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink/55 sm:px-5">
            No teachers yet. Use Invite teacher to add the first one.
          </p>
        ) : (
          <ul className="divide-y divide-stone">
            {teachers.map((teacher) => (
              <li
                key={teacher.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <StaffAvatar
                    name={teacherDisplayName(teacher)}
                    imageUrl={teacher.avatarUrl}
                    active={teacher.is_active}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {teacherDisplayName(teacher)}
                    </p>
                    <p className="truncate text-sm text-ink/55">
                      {teacher.email}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-ink/45">
                      {teacher.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEdit(teacher)}
                    className="border border-pine/25 px-3 py-2 text-sm text-pine hover:border-pine disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPendingConfirm({
                        kind: "toggleActive",
                        teacher,
                        activate: !teacher.is_active,
                      })
                    }
                    className="border border-pine/25 px-3 py-2 text-sm text-pine hover:border-pine disabled:opacity-50"
                  >
                    {teacher.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPendingConfirm({ kind: "delete", teacher })
                    }
                    className="border border-red-800/25 px-3 py-2 text-sm text-red-900 hover:border-red-800/50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmCopy ? (
        <DeskConfirmModal
          open={Boolean(pendingConfirm)}
          onClose={() => !busy && setPendingConfirm(null)}
          onConfirm={confirmPendingAction}
          eyebrow={confirmCopy.eyebrow}
          title={confirmCopy.title}
          body={confirmCopy.body}
          confirmLabel={confirmCopy.confirmLabel}
          destructive={confirmCopy.destructive}
          busy={busy}
          busyLabel={busyLabel ?? confirmCopy.busyLabel}
        />
      ) : null}

      {editTarget ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setEditTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-edit-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Saving teacher…"}
            />
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Edit teacher
            </p>
            <h3
              id="teacher-edit-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              Update profile
            </h3>
            <p className="mt-2 text-sm text-ink/60">
              Changes apply to their teacher portal sign-in details.
            </p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-ink">
                Full name
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={busy}
                  className={editFieldClass}
                  placeholder="Full name"
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                Email
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  disabled={busy}
                  className={editFieldClass}
                  placeholder="teacher@example.com"
                />
              </label>
            </div>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditTarget(null)}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={saveEdit}
                className="inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
              >
                {busy ? (
                  <DeskLoader label="Saving…" tone="mist" />
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
