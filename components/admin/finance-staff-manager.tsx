"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import {
  deleteFinanceUser,
  inviteFinanceUser,
  setFinanceUserActive,
  updateFinanceProfile,
} from "@/app/admin/finance/staff/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { StaffAvatar } from "@/components/ui/staff-avatar";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import {
  financeDisplayName,
  type FinanceProfile,
} from "@/lib/finance/types";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";

const fieldClass =
  "w-full border border-stone bg-white/70 px-4 py-3 text-sm outline-none transition-[border-color,background-color] duration-300 focus:border-pine focus:bg-mist";

const editFieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

export function FinanceStaffManager({
  initialStaff,
  onInviteSurfaceChange,
}: {
  initialStaff: FinanceProfile[];
  onInviteSurfaceChange?: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [staff, setStaff] = useState(initialStaff);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [lastTemp, setLastTemp] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<FinanceProfile | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const busy = pending || Boolean(busyLabel);

  useEffect(() => {
    setStaff(initialStaff);
  }, [initialStaff]);

  useEffect(() => {
    if (!editTarget) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        setEditTarget(null);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [editTarget, busy]);

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
            await deskError({
              title: "Finance Admin created",
              text: result.message,
            });
          } else {
            await deskSuccess({ text: result.message });
          }
          onOk?.(result.message, result.temporaryPassword);
        } else {
          await deskError({ text: result.message });
        }
      } catch {
        await deskError({
          text: "Something went wrong. Please try again.",
        });
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
      () => inviteFinanceUser(form),
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
      "Inviting Finance Admin…",
    );
  }

  function openEdit(user: FinanceProfile) {
    setEditTarget(user);
    setEditName(user.full_name ?? "");
    setEditEmail(user.email);
  }

  async function saveEdit() {
    if (!editTarget) return;
    const nextName = editName.trim();
    const nextEmail = editEmail.trim().toLowerCase();
    if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      await deskError({ text: "Enter a valid email address." });
      return;
    }
    const id = editTarget.id;
    run(
      () =>
        updateFinanceProfile({
          financeId: id,
          fullName: nextName,
          email: nextEmail,
        }),
      () => {
        setStaff((prev) =>
          prev.map((u) =>
            u.id === id
              ? {
                  ...u,
                  full_name: nextName || null,
                  email: nextEmail,
                }
              : u,
          ),
        );
        setEditTarget(null);
      },
      "Saving Finance Admin…",
    );
  }

  async function requestDelete(user: FinanceProfile) {
    if (busy) return;
    const ok = await deskConfirm({
      title: `Delete ${financeDisplayName(user)}?`,
      text: "This removes their Finance portal access. No email is sent.",
      confirmLabel: "Delete Finance Admin",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;
    const id = user.id;
    run(
      () => deleteFinanceUser({ financeId: id }),
      () => {
        setStaff((prev) => prev.filter((u) => u.id !== id));
      },
      "Deleting Finance Admin…",
    );
  }

  async function requestToggleActive(user: FinanceProfile, activate: boolean) {
    if (busy) return;
    const name = financeDisplayName(user);
    const ok = await deskConfirm({
      title: activate
        ? "Reactivate this Finance Admin?"
        : "Deactivate this Finance Admin?",
      text: activate
        ? `${name} will be able to sign in to the Finance portal again.`
        : `${name} will not be able to sign in until reactivated. Pay history stays on file.`,
      confirmLabel: activate ? "Reactivate" : "Deactivate",
      cancelLabel: "Cancel",
      danger: !activate,
    });
    if (!ok) return;
    run(
      () =>
        setFinanceUserActive({
          financeId: user.id,
          isActive: activate,
        }),
      () => {
        setStaff((prev) =>
          prev.map((u) =>
            u.id === user.id ? { ...u, is_active: activate } : u,
          ),
        );
      },
      activate ? "Reactivating…" : "Deactivating…",
    );
  }

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
          All Finance Admins
        </button>

        <div className="border border-stone bg-mist/40 p-4 sm:p-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Invite
          </p>
          <h2 className="mt-1 font-display text-[clamp(1.35rem,3vw,1.85rem)] tracking-[-0.02em] text-pine">
            Invite a Finance Admin
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
            Create Finance portal access only — not an admin desk. We email them
            a temporary password.
          </p>

          <form
            className="relative mt-6 grid max-w-xl gap-4 sm:grid-cols-2"
            onSubmit={onInvite}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Inviting Finance Admin…"}
            />
            <div className="sm:col-span-2">
              <label
                className="mb-2 block text-sm font-medium text-ink"
                htmlFor="financeFullName"
              >
                Full name
              </label>
              <input
                id="financeFullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={fieldClass}
                placeholder="Ada Finance"
                disabled={busy}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="mb-2 block text-sm font-medium text-ink"
                htmlFor="financeEmail"
              >
                Email
              </label>
              <input
                id="financeEmail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
                placeholder="finance@example.com"
                disabled={busy}
              />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  className="block text-sm font-medium text-ink"
                  htmlFor="financeTempPassword"
                >
                  Temporary password
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPassword(createTemporaryPassword(12));
                  }}
                  className="text-xs font-medium text-pine underline decoration-pine/30 underline-offset-4 disabled:opacity-50"
                >
                  Generate
                </button>
              </div>
              <input
                id="financeTempPassword"
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
                  "Create Finance Admin"
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
        active={busy && !editTarget}
        label={busyLabel ?? "Working…"}
      />

      <div
        data-tour="access-invite-finance"
        className="flex flex-col gap-3 border border-stone bg-mist/40 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Finance
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Finance portal accounts only. They manage rates and pay periods —
            not the admin desk.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={openInvite}
          className="inline-flex min-h-[2.5rem] shrink-0 items-center justify-center bg-pine px-4 py-2 text-sm font-medium text-mist disabled:opacity-50"
        >
          Invite Finance Admin
        </button>
      </div>

      <section className="border border-stone bg-mist/30">
        <div className="border-b border-stone px-4 py-3 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Directory
          </p>
          <h2 className="mt-1 font-display text-xl text-pine">Finance</h2>
        </div>
        {staff.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink/55 sm:px-5">
            No Finance Admins yet. Use Invite Finance Admin to add the first one.
          </p>
        ) : (
          <ul className="divide-y divide-stone">
            {staff.map((user) => (
              <li
                key={user.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <StaffAvatar
                    name={financeDisplayName(user)}
                    imageUrl={user.avatarUrl}
                    active={user.is_active}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {financeDisplayName(user)}
                    </p>
                    <p className="truncate text-sm text-ink/55">{user.email}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-ink/45">
                      {user.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEdit(user)}
                    className="border border-pine/25 px-3 py-2 text-sm text-pine hover:border-pine disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void requestToggleActive(user, !user.is_active)
                    }
                    className="border border-pine/25 px-3 py-2 text-sm text-pine hover:border-pine disabled:opacity-50"
                  >
                    {user.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void requestDelete(user)}
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

      {editTarget ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setEditTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-edit-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Saving Finance Admin…"}
            />
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Edit Finance Admin
            </p>
            <h3
              id="finance-edit-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              Update profile
            </h3>
            <p className="mt-2 text-sm text-ink/60">
              Changes apply to their Finance portal sign-in details.
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
                  placeholder="finance@example.com"
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
                onClick={() => void saveEdit()}
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
