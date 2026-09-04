"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import {
  deleteAdminAvatar,
  uploadAdminAvatar,
} from "@/app/admin/account/actions";
import { changeOwnPassword } from "@/app/admin/actions";
import { StaffAvatarCard } from "@/components/staff/staff-avatar-card";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import type { AdminProfile } from "@/lib/admin/profile";

const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine sm:py-2";

export function AdminAccountManager({
  profile,
}: {
  profile: AdminProfile;
}) {
  const displayName = profile.full_name || profile.email;
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = pending || Boolean(busyLabel);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      error("New password must be at least 8 characters.", "Account");
      return;
    }
    if (newPassword !== confirmPassword) {
      error("New password and confirmation do not match.", "Account");
      return;
    }
    setConfirmOpen(true);
  }

  function confirmPasswordChange() {
    const form = new FormData();
    form.set("currentPassword", currentPassword);
    form.set("newPassword", newPassword);
    form.set("confirmPassword", confirmPassword);
    setBusyLabel("Updating password…");
    startTransition(async () => {
      try {
        const result = await changeOwnPassword(form);
        if (result.ok) {
          success(result.message, "Account");
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setConfirmOpen(false);
        } else {
          error(result.message, "Account");
        }
      } catch {
        error("Something went wrong. Please try again.", "Account");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="relative space-y-8">
      <DeskLoaderOverlay
        active={busy && !confirmOpen}
        label={busyLabel ?? "Working…"}
      />

      <section className="relative overflow-hidden border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.14),_transparent_55%)]"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Account
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.6rem,5vw,2.3rem)] tracking-[-0.02em] text-pine">
            {displayName}
          </h1>
          <p className="mt-2 text-sm text-ink/65">{profile.email}</p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink/55">
            Manage your profile picture and password. Staff invites and desk
            access live under{" "}
            <Link
              href="/admin/access"
              className="font-medium text-pine underline decoration-pine/30"
            >
              Access
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Appearance
        </p>
        <h2 className="mt-1 font-display text-xl text-pine">Profile picture</h2>
        <p className="mt-2 mb-4 text-sm text-ink/55">
          Shown in the header menu when you are signed in.
        </p>
        <StaffAvatarCard
          previewUrl={profile.avatarUrl}
          hasAvatar={Boolean(profile.avatar_path)}
          onUpload={uploadAdminAvatar}
          onDelete={deleteAdminAvatar}
        />
      </section>

      <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Security
        </p>
        <h2 className="mt-1 font-display text-xl text-pine">Change password</h2>
        <p className="mt-2 text-sm text-ink/55">
          Use at least 8 characters. You will stay signed in after saving.
        </p>

        <form onSubmit={onSubmit} className="mt-5 max-w-md space-y-4">
          <label className="block text-sm font-medium text-ink">
            Current password
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-pine"
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label className="block text-sm font-medium text-ink">
            New password
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-pine"
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label className="block text-sm font-medium text-ink">
            Confirm new password
            <input
              type={showNew ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={fieldClass}
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 w-full items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60 sm:w-auto"
          >
            {busy && busyLabel?.startsWith("Updating") ? (
              <DeskLoader label="Saving…" tone="mist" />
            ) : (
              "Save new password"
            )}
          </button>
        </form>
      </section>

      <DeskConfirmModal
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={confirmPasswordChange}
        eyebrow="My password"
        title="Update your password?"
        body="Your sign-in password will change. Keep the new password private — the desk will never ask for it by email."
        confirmLabel="Update password"
        busy={busy}
        busyLabel={busyLabel ?? "Updating password…"}
      />
    </div>
  );
}
