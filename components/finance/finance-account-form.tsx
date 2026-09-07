"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  deleteFinanceAvatar,
  uploadFinanceAvatar,
} from "@/app/finance/account/actions";
import { changeFinancePassword } from "@/app/finance/actions";
import { StaffAvatarCard } from "@/components/staff/staff-avatar-card";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  financeDisplayName,
  type FinanceProfile,
} from "@/lib/finance/types";

const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

export function FinanceAccountForm({ profile }: { profile: FinanceProfile }) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

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
    const form = new FormData();
    form.set("currentPassword", currentPassword);
    form.set("newPassword", newPassword);
    form.set("confirmPassword", confirmPassword);
    startTransition(async () => {
      const result = await changeFinancePassword(form);
      if (result.ok) {
        success(result.message, "Account");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        error(result.message, "Account");
      }
    });
  }

  return (
    <div className="relative space-y-8">
      <DeskLoaderOverlay active={pending} label="Updating password…" />

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
            {financeDisplayName(profile)}
          </h1>
          <p className="mt-2 text-sm text-ink/65">{profile.email}</p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink/55">
            Manage your profile picture and the password you use on the Finance
            portal. Keep your password private — the desk will never ask for it
            by email.
          </p>
        </div>
      </section>

      <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Appearance
        </p>
        <h2 className="mt-1 font-display text-xl text-pine">Profile picture</h2>
        <p className="mt-2 mb-4 text-sm text-ink/55">
          Shown in the Finance portal header when you are signed in.
        </p>
        <StaffAvatarCard
          previewUrl={profile.avatarUrl}
          hasAvatar={Boolean(profile.avatar_path)}
          onUpload={uploadFinanceAvatar}
          onDelete={deleteFinanceAvatar}
        />
      </section>

      <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Security
        </p>
        <h2 className="mt-1 font-display text-xl text-pine">Change password</h2>
        <form onSubmit={onSubmit} className="mt-5 max-w-md space-y-4">
          <label className="block text-sm">
            <span className="text-ink/70">Current password</span>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                className={fieldClass}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink/45"
                onClick={() => setShowCurrent((v) => !v)}
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-ink/70">New password</span>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                className={fieldClass}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink/45"
                onClick={() => setShowNew((v) => !v)}
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-ink/70">Confirm new password</span>
            <input
              type="password"
              className={fieldClass}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center bg-pine px-4 text-sm font-medium text-mist hover:bg-celadon"
          >
            Update password
          </button>
        </form>
      </section>
    </div>
  );
}
