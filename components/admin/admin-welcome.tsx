"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  isNationalAdmin,
  isParishAdmin,
  type AdminProfile,
} from "@/lib/admin/profile";

function welcomeBody(profile: AdminProfile, deskLabel: string) {
  if (profile.role === "master") {
    return `You’re signed in with master access (${deskLabel}). Manage staff accounts and the full portal from here.`;
  }
  if (isParishAdmin(profile)) {
    return `You’re signed in to ${deskLabel}. You only see and manage students, payments, and records for this parish.`;
  }
  if (isNationalAdmin(profile)) {
    return `You’re signed in to ${deskLabel}. You can work across every UK parish from this desk.`;
  }
  return "You’re signed in to the staff portal. Open Access to manage your password and team.";
}

export function AdminWelcome({
  profile,
  deskLabel,
}: {
  profile: AdminProfile;
  deskLabel: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<"hidden" | "in" | "out">("hidden");

  function dismiss() {
    setPhase("out");
    window.setTimeout(() => setPhase("hidden"), 280);
  }

  useEffect(() => {
    if (searchParams.get("welcome") !== "1") return;

    setPhase("in");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("welcome");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  useEffect(() => {
    if (phase !== "in") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase]);

  if (phase === "hidden") return null;

  const firstName =
    profile.full_name?.trim().split(/\s+/)[0] ||
    profile.email.split("@")[0] ||
    "Admin";

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 p-4 sm:items-center ${
        phase === "out" ? "animate-toast-out" : "animate-welcome-veil"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-welcome-title"
      onClick={dismiss}
    >
      <div
        className="animate-fade-rise w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Welcome
        </p>
        <h2
          id="admin-welcome-title"
          className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine sm:text-[1.75rem]"
        >
          Good to see you, {firstName}.
        </h2>
        <p className="mt-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-ink/45">
          {deskLabel}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink/70">
          {welcomeBody(profile, deskLabel)}
        </p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon"
          >
            Enter desk
          </button>
        </div>
      </div>
    </div>
  );
}
