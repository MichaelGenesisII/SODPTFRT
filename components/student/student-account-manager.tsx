"use client";

import { useState, useTransition } from "react";
import {
  changeStudentPassword,
  type StudentAccountActionResult,
} from "@/app/student/account/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
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
      } else {
        error(result.message, "Account");
      }
    });
  }

  const name = studentDisplayName(profile);

  return (
    <div className="space-y-4 sm:space-y-6">
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

      <div className="relative border border-stone bg-mist px-4 py-5 sm:px-6 sm:py-7">
        {panel === "profile" ? (
          <div className="space-y-5">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Signed in as
              </p>
              <p className="mt-2 font-display text-2xl text-pine">{name}</p>
              <p className="mt-1 text-sm text-ink/60">{profile.email}</p>
            </div>

            <dl className="grid gap-4 border-t border-stone/80 pt-5 sm:grid-cols-2">
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
        ) : (
          <form
            className="relative grid max-w-md gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              run(() => changeStudentPassword(new FormData(form)), form);
            }}
          >
            <DeskLoaderOverlay active={pending} label="Securing your key…" />
            <p className="text-sm leading-relaxed text-ink/60">
              Choose a strong password you have not used elsewhere.
            </p>
            <div>
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
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center bg-pine px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-pine/90 disabled:opacity-60"
            >
              {pending ? (
                <DeskLoader label="Updating…" tone="mist" />
              ) : (
                "Update password"
              )}
            </button>
          </form>
        )}
      </div>
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
