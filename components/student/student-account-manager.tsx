"use client";

import { useRef, useState, useTransition } from "react";
import {
  changeStudentPassword,
  type StudentAccountActionResult,
} from "@/app/student/account/actions";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoader } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  studentDisplayName,
  type StudentEnrolment,
  type StudentProfile,
} from "@/lib/student/types";

const fieldClass =
  "w-full border border-stone bg-white/70 px-4 py-3 text-sm outline-none transition-[border-color,background-color] duration-300 focus:border-pine focus:bg-mist";

type Panel = "profile" | "password";

type StudentAccountManagerProps = {
  profile: StudentProfile;
  enrolment: StudentEnrolment | null;
};

export function StudentAccountManager({
  profile,
  enrolment,
}: StudentAccountManagerProps) {
  const { success, error } = useToast();
  const [panel, setPanel] = useState<Panel>("profile");
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPasswordOpen, setConfirmPasswordOpen] = useState(false);
  const passwordFormRef = useRef<HTMLFormElement>(null);

  const tabs: { id: Panel; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "password", label: "Password" },
  ];

  function run(
    action: () => Promise<StudentAccountActionResult>,
    form?: HTMLFormElement | null,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        success(result.message, "Account");
        form?.reset();
        setConfirmPasswordOpen(false);
      } else {
        error(result.message, "Account");
      }
    });
  }

  const name = studentDisplayName(profile);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="space-y-4 sm:space-y-5">
      <section
        className="grid grid-cols-2 gap-px overflow-hidden border border-stone bg-stone sm:grid-cols-4"
        data-tour="student-account-stats"
      >
        <AccountStat label="Status" value={profile.is_active ? "Active" : "Inactive"} />
        <AccountStat
          label="Parish"
          value={enrolment?.parish_name ?? "Pending"}
          text
        />
        <AccountStat
          label="Batch"
          value={enrolment?.batch_label ?? "Pending"}
          text
        />
        <AccountStat
          label="Reference"
          value={enrolment?.reference ?? "—"}
          mono
        />
      </section>

      <nav
        className="flex gap-1 border-b border-stone/80"
        aria-label="Account sections"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPanel(tab.id)}
            className={`relative px-4 py-3 text-sm font-medium tracking-wide transition-colors ${
              panel === tab.id
                ? "text-pine"
                : "text-ink/50 hover:text-ink/80"
            }`}
          >
            {tab.label}
            <span
              className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                panel === tab.id ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden
            />
          </button>
        ))}
      </nav>

      <div className="relative border border-stone bg-mist px-4 py-5 sm:px-7 sm:py-8">
        {panel === "profile" ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <span
                  className="inline-flex h-16 w-16 shrink-0 items-center justify-center bg-pine text-lg font-semibold tracking-wide text-mist"
                  aria-hidden
                >
                  {initials || "?"}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                    Signed in as
                  </p>
                  <p className="mt-1.5 font-display text-2xl text-pine sm:text-3xl">
                    {name}
                  </p>
                  <p className="mt-1 truncate text-sm text-ink/60">
                    {profile.email}
                  </p>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-ink/55">
                To update your name, address, or parish placement, open{" "}
                <a
                  href="/student/support"
                  className="font-medium text-pine underline decoration-pine/30 underline-offset-4"
                >
                  Support
                </a>
                . The desk can amend your enrolment record.
              </p>
            </div>

            <dl className="grid gap-4 border-t border-stone/80 pt-5 sm:grid-cols-2 lg:border-t-0 lg:border-l lg:pl-10 lg:pt-0">
              <ProfileRow
                label="Parish"
                value={enrolment?.parish_name ?? "Not assigned yet"}
              />
              <ProfileRow
                label="Batch / year"
                value={enrolment?.batch_label ?? "Not assigned yet"}
              />
              <ProfileRow
                label="Application ref"
                value={enrolment?.reference ?? "—"}
              />
              <ProfileRow
                label="Account status"
                value={profile.is_active ? "Active" : "Inactive"}
              />
            </dl>
          </div>
        ) : (
          <form
            ref={passwordFormRef}
            className="relative grid gap-5 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              setConfirmPasswordOpen(true);
            }}
          >
            <div className="lg:col-span-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Security
              </p>
              <h2 className="mt-1 font-display text-xl text-pine sm:text-2xl">
                Change your password
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/60">
                Choose a strong password you have not used elsewhere. You will
                stay signed in on this device after updating.
              </p>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  className="block text-sm font-medium text-ink"
                  htmlFor="currentPassword"
                >
                  Current password
                </label>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-xs font-medium text-pine underline decoration-pine/30 underline-offset-4 disabled:opacity-50"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id="currentPassword"
                name="currentPassword"
                type={showPassword ? "text" : "password"}
                required
                disabled={pending}
                autoComplete="current-password"
                className={fieldClass}
              />
            </div>

            <div>
              <label
                className="mb-2 block text-sm font-medium text-ink"
                htmlFor="newPassword"
              >
                New password
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                disabled={pending}
                autoComplete="new-password"
                className={fieldClass}
              />
            </div>

            <div>
              <label
                className="mb-2 block text-sm font-medium text-ink"
                htmlFor="confirmPassword"
              >
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                disabled={pending}
                autoComplete="new-password"
                className={fieldClass}
              />
            </div>

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-11 w-full items-center justify-center bg-pine px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-pine/90 disabled:opacity-60 sm:w-auto"
              >
                {pending ? (
                  <DeskLoader label="Updating…" tone="mist" />
                ) : (
                  "Update password"
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <DeskConfirmModal
        open={confirmPasswordOpen}
        onClose={() => !pending && setConfirmPasswordOpen(false)}
        onConfirm={() => {
          const form = passwordFormRef.current;
          if (!form) return;
          run(() => changeStudentPassword(new FormData(form)), form);
        }}
        eyebrow="Security"
        title="Update your password?"
        body={
          <>
            You will need this new password the next time you sign in on another
            device. Make sure you have saved it somewhere safe.
          </>
        }
        confirmLabel="Update password"
        busy={pending}
        busyLabel="Securing your key…"
      />
    </div>
  );
}

function AccountStat({
  label,
  value,
  text,
  mono,
}: {
  label: string;
  value: string;
  text?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="bg-mist px-3 py-3.5 sm:px-5 sm:py-5">
      <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45 sm:text-[0.65rem]">
        {label}
      </p>
      <p
        className={`mt-2 font-display leading-tight text-pine sm:mt-3 ${
          text
            ? "truncate text-base sm:text-xl"
            : mono
              ? "truncate font-mono text-sm sm:text-base"
              : "text-xl tabular-nums sm:text-2xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-pine">{value}</dd>
    </div>
  );
}
