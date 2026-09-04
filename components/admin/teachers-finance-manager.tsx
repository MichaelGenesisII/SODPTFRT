"use client";

import { useState, useTransition, type FormEvent } from "react";
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
import {
  teacherDisplayName,
  type TeacherProfile,
} from "@/lib/teacher/types";

export function TeachersFinanceManager({
  initialTeachers,
}: {
  initialTeachers: TeacherProfile[];
}) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [teachers, setTeachers] = useState(initialTeachers);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [lastTemp, setLastTemp] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeacherProfile | null>(null);

  const busy = pending || Boolean(busyLabel);

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
          success(result.message, "Teachers");
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
      (_msg, temp) => {
        setLastTemp(temp ?? null);
        setEmail("");
        setFullName("");
        setPassword("");
        window.location.reload();
      },
      "Inviting teacher…",
    );
  }

  return (
    <div className="relative space-y-6">
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />

      <section className="border border-stone bg-mist/30 p-4 sm:p-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Invite
        </p>
        <h2 className="mt-1 font-display text-xl text-pine">Add a teacher</h2>
        <p className="mt-1 text-sm text-ink/60">
          Creates teacher portal access only — not an admin desk.
        </p>
        <form onSubmit={onInvite} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1.5 w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine"
              placeholder="Ada Teacher"
            />
          </label>
          <label className="block text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine"
              placeholder="teacher@example.com"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            Temporary password (optional — generated if blank)
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full border border-stone bg-white/70 px-3 py-2 font-mono text-sm outline-none focus:border-pine"
              placeholder="Leave blank to auto-generate"
              minLength={8}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
            >
              {busy && busyLabel?.startsWith("Inviting") ? (
                <DeskLoader label={busyLabel} tone="mist" />
              ) : (
                "Invite teacher"
              )}
            </button>
          </div>
        </form>
        {lastTemp ? (
          <p className="mt-3 text-sm text-ink/70">
            Temporary password (share securely if email failed):{" "}
            <span className="font-mono text-pine">{lastTemp}</span>
          </p>
        ) : null}
      </section>

      <section className="border border-stone bg-mist/30">
        <div className="border-b border-stone px-4 py-3 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Directory
          </p>
          <h2 className="mt-1 font-display text-xl text-pine">Teachers</h2>
        </div>
        {teachers.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink/55 sm:px-5">
            No teachers yet. Invite the first teacher above.
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
                    onClick={() => {
                      const nextName = window.prompt(
                        "Full name",
                        teacher.full_name ?? "",
                      );
                      if (nextName == null) return;
                      const nextEmail = window.prompt("Email", teacher.email);
                      if (nextEmail == null) return;
                      run(
                        () =>
                          updateTeacherProfile({
                            teacherId: teacher.id,
                            fullName: nextName,
                            email: nextEmail,
                          }),
                        () => {
                          setTeachers((prev) =>
                            prev.map((t) =>
                              t.id === teacher.id
                                ? {
                                    ...t,
                                    full_name: nextName.trim() || null,
                                    email: nextEmail.trim().toLowerCase(),
                                  }
                                : t,
                            ),
                          );
                        },
                        "Saving…",
                      );
                    }}
                    className="border border-pine/25 px-3 py-2 text-sm text-pine hover:border-pine disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          setTeacherActive({
                            teacherId: teacher.id,
                            isActive: !teacher.is_active,
                          }),
                        () => {
                          setTeachers((prev) =>
                            prev.map((t) =>
                              t.id === teacher.id
                                ? { ...t, is_active: !t.is_active }
                                : t,
                            ),
                          );
                        },
                        teacher.is_active ? "Deactivating…" : "Reactivating…",
                      )
                    }
                    className="border border-pine/25 px-3 py-2 text-sm text-pine hover:border-pine disabled:opacity-50"
                  >
                    {teacher.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleteTarget(teacher)}
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

      <DeskConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => !busy && setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          run(
            () => deleteTeacher({ teacherId: id }),
            () => {
              setTeachers((prev) => prev.filter((t) => t.id !== id));
              setDeleteTarget(null);
            },
            "Deleting teacher…",
          );
        }}
        eyebrow="Teachers"
        title={`Delete ${deleteTarget ? teacherDisplayName(deleteTarget) : "teacher"}?`}
        body="This removes their teacher portal access. No email is sent. If they have confirmed teaching history, deletion is blocked — deactivate instead."
        confirmLabel="Delete teacher"
        destructive
        busy={busy}
        busyLabel={busyLabel ?? "Working…"}
      />
    </div>
  );
}
