"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  changeOwnPassword,
  createAdminAccount,
  deleteAdminAccount,
  resetAdminPassword,
  setAdminActive,
  setAdminParishScope,
  type AdminActionResult,
} from "@/app/admin/actions";
import { useToast } from "@/components/ui/toast";
import {
  isNationalAdmin,
  isParishAdmin,
  type AdminProfile,
} from "@/lib/admin/profile";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import type { Parish } from "@/lib/parishes";

const fieldClass =
  "w-full border border-stone bg-white/70 px-4 py-3 text-sm outline-none transition-[border-color,background-color] duration-300 focus:border-pine focus:bg-mist";

const DIRECTORY_PAGE_SIZE = 8;

type Panel = "directory" | "invite" | "password" | "insight";

type AccessManagerProps = {
  profile: AdminProfile;
  admins: AdminProfile[];
  parishes: Pick<Parish, "id" | "name" | "region">[];
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M8 7v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v5M14 11v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function deskBadge(admin: AdminProfile, parishes: AccessManagerProps["parishes"]) {
  if (admin.role === "master") return "master";
  if (admin.parish_id) {
    const name =
      parishes.find((p) => p.id === admin.parish_id)?.name ?? "parish";
    return name;
  }
  return "national";
}

export function AccessManager({
  profile,
  admins,
  parishes,
}: AccessManagerProps) {
  const { success, error, info } = useToast();
  const national = isNationalAdmin(profile);
  const parishDesk = isParishAdmin(profile);
  const [panel, setPanel] = useState<Panel>("directory");
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminProfile | null>(null);
  const [page, setPage] = useState(1);
  const [invitePassword, setInvitePassword] = useState("");

  const visibleAdmins = useMemo(() => {
    if (national) return admins;
    return admins.filter(
      (admin) =>
        admin.id === profile.id ||
        (profile.parish_id && admin.parish_id === profile.parish_id),
    );
  }, [admins, national, profile.id, profile.parish_id]);

  const tabs: { id: Panel; label: string }[] = [
    { id: "directory", label: "Directory" },
    { id: "invite", label: "Invite" },
    { id: "password", label: "Password" },
    { id: "insight", label: "Insight" },
  ];

  const totalPages = Math.max(
    1,
    Math.ceil(visibleAdmins.length / DIRECTORY_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * DIRECTORY_PAGE_SIZE;
  const pageAdmins = visibleAdmins.slice(
    pageStart,
    pageStart + DIRECTORY_PAGE_SIZE,
  );
  const rangeFrom = visibleAdmins.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(
    pageStart + DIRECTORY_PAGE_SIZE,
    visibleAdmins.length,
  );

  const ownParishName =
    parishes.find((p) => p.id === profile.parish_id)?.name ?? "Your parish";

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingDelete(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingDelete]);

  function openPanel(next: Panel) {
    setPanel(next);
    setExpandedId(null);
  }

  function goToPage(next: number) {
    setExpandedId(null);
    setPage(Math.min(totalPages, Math.max(1, next)));
  }

  function run(
    action: () => Promise<AdminActionResult>,
    form?: HTMLFormElement | null,
    toastTitle = "Access",
  ) {
    startTransition(async () => {
      const next = await action();
      if (next.ok) {
        const emailFailed = /welcome email failed/i.test(next.message);
        if (emailFailed) {
          error(next.message, "Account created");
        } else {
          success(next.message, toastTitle);
        }
        form?.reset();
        setInvitePassword("");
        setPendingDelete(null);
      } else {
        error(next.message, toastTitle);
      }
    });
  }

  const meta: Record<
    Exclude<Panel, "insight">,
    { eyebrow: string; title: string; lead: string }
  > = {
    directory: {
      eyebrow: "Team",
      title: "Staff directory",
      lead: national
        ? "Open someone to set their desk, reset a password, or remove access."
        : "People on your parish desk. You can invite more for this parish only.",
    },
    invite: {
      eyebrow: "Staff",
      title: "Invite an admin",
      lead: national
        ? "Create their account and email a temporary password. Pick National or a parish desk."
        : `Create another admin for ${ownParishName}. We email them a temporary password.`,
    },
    password: {
      eyebrow: "You",
      title: "Change password",
      lead: "Update the password for this signed-in account.",
    },
  };

  return (
    <div className="mx-auto max-w-3xl">
      <nav
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
        aria-label="Access sections"
      >
        {tabs.map((tab) => {
          const active = panel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => openPanel(tab.id)}
              className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                active ? "text-pine" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              {tab.label}
              <span
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity duration-300 ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      {panel === "insight" ? (
        <div className="animate-panel-in pt-5 sm:pt-6">
          <AccessInsightGuide profile={profile} />
        </div>
      ) : (
        <div key={panel} className="animate-panel-in pt-5 sm:pt-6">
          <header>
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
              {meta[panel].eyebrow}
            </p>
            <h2 className="mt-1.5 font-display text-[clamp(1.5rem,4vw,2.1rem)] tracking-[-0.02em] text-pine">
              {meta[panel].title}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/65">
              {meta[panel].lead}
            </p>
          </header>

          <div className="mt-6">
            {panel === "directory" ? (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink/55">
                  <p>
                    {visibleAdmins.length === 0
                      ? "No staff accounts yet."
                      : `Showing ${rangeFrom}–${rangeTo} of ${visibleAdmins.length}`}
                    {parishDesk ? " · your parish" : ""}
                  </p>
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                    {DIRECTORY_PAGE_SIZE} per page
                  </p>
                </div>

                <ul className="divide-y divide-stone border-y border-stone">
                  {pageAdmins.map((admin) => {
                    const isSelf = admin.id === profile.id;
                    const open = expandedId === admin.id;
                    const canManage = national && admin.role !== "master";

                    return (
                      <li key={admin.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(open ? null : admin.id)
                          }
                          className="flex w-full items-center gap-3 px-1 py-4 text-left transition-colors hover:bg-mist/80 sm:gap-4 sm:px-2"
                          aria-expanded={open}
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center text-[0.65rem] font-medium uppercase tracking-wide ${
                              admin.is_active
                                ? "bg-pine text-mist"
                                : "bg-stone text-ink/50"
                            }`}
                          >
                            {(admin.full_name || admin.email)
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-ink">
                                {admin.full_name || "Unnamed admin"}
                              </span>
                              {isSelf ? (
                                <span className="text-xs text-ink/45">
                                  (you)
                                </span>
                              ) : null}
                              <span className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
                                {deskBadge(admin, parishes)}
                                {admin.is_active ? "" : " · inactive"}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-xs text-ink/55 sm:text-sm">
                              {admin.email}
                            </span>
                          </span>
                          <span className="text-ink/40">
                            <ChevronIcon open={open} />
                          </span>
                        </button>

                        <div
                          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div className="border-t border-stone/70 bg-mist/40 px-1 py-4 sm:px-2 sm:pl-14">
                              {admin.role === "master" ? (
                                <p className="text-sm text-ink/55">
                                  Protected master account. Change your own
                                  password on the{" "}
                                  <button
                                    type="button"
                                    onClick={() => openPanel("password")}
                                    className="font-medium text-pine underline decoration-pine/30 underline-offset-4"
                                  >
                                    Password
                                  </button>{" "}
                                  tab.
                                </p>
                              ) : !national ? (
                                <p className="text-sm text-ink/55">
                                  {isSelf
                                    ? "Use the Password tab to update your login."
                                    : "Ask a national desk to change this person’s access, password, or status."}
                                </p>
                              ) : canManage ? (
                                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink/55">
                                    Desk
                                    <select
                                      disabled={pending}
                                      value={admin.parish_id ?? ""}
                                      onChange={(event) => {
                                        const next =
                                          event.target.value || null;
                                        run(() =>
                                          setAdminParishScope(admin.id, next),
                                        );
                                      }}
                                      className={fieldClass}
                                    >
                                      <option value="">National desk</option>
                                      {parishes.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() =>
                                      run(() =>
                                        setAdminActive(
                                          admin.id,
                                          !admin.is_active,
                                        ),
                                      )
                                    }
                                    className="border border-pine/30 px-3 py-2.5 text-sm text-pine transition-colors hover:border-pine disabled:opacity-60 sm:shrink-0"
                                  >
                                    {admin.is_active
                                      ? "Deactivate"
                                      : "Reactivate"}
                                  </button>
                                  <form
                                    className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      const form = event.currentTarget;
                                      const formData = new FormData(form);
                                      formData.set("adminId", admin.id);
                                      run(
                                        () => resetAdminPassword(formData),
                                        form,
                                      );
                                    }}
                                  >
                                    <input
                                      type="hidden"
                                      name="adminId"
                                      value={admin.id}
                                    />
                                    <input
                                      name="password"
                                      type="text"
                                      required
                                      minLength={8}
                                      placeholder="New password"
                                      className={`${fieldClass} font-mono`}
                                    />
                                    <button
                                      type="submit"
                                      disabled={pending}
                                      className="shrink-0 bg-pine px-3 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
                                    >
                                      Reset
                                    </button>
                                  </form>
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => setPendingDelete(admin)}
                                    className="inline-flex h-10 w-10 items-center justify-center border border-red-900/20 text-red-800 transition-colors hover:border-red-800/50 hover:bg-red-50 disabled:opacity-60 sm:ml-auto"
                                    aria-label={`Delete ${admin.full_name || admin.email}`}
                                    title="Delete admin"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {totalPages > 1 ? (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => goToPage(currentPage - 1)}
                      className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine transition-colors hover:border-pine disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <p className="text-sm text-ink/60">
                      Page{" "}
                      <span className="font-medium text-ink">
                        {currentPage}
                      </span>{" "}
                      of {totalPages}
                    </p>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => goToPage(currentPage + 1)}
                      className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine transition-colors hover:border-pine disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {panel === "invite" ? (
              <form
                className="grid max-w-xl gap-4 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  run(
                    () => createAdminAccount(new FormData(form)),
                    form,
                    "Invite",
                  );
                }}
              >
                <div className="sm:col-span-2">
                  <label
                    className="mb-2 block text-sm font-medium text-ink"
                    htmlFor="fullName"
                  >
                    Full name
                  </label>
                  <input id="fullName" name="fullName" className={fieldClass} />
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-ink"
                    htmlFor="email"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className={fieldClass}
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label
                      className="block text-sm font-medium text-ink"
                      htmlFor="tempPassword"
                    >
                      Temporary password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = createTemporaryPassword(12);
                        setInvitePassword(next);
                        info("Temporary password ready.", "Generated");
                      }}
                      className="text-xs font-medium text-pine underline decoration-pine/30 underline-offset-4"
                    >
                      Generate
                    </button>
                  </div>
                  <input
                    id="tempPassword"
                    name="password"
                    type="text"
                    required
                    minLength={8}
                    value={invitePassword}
                    onChange={(event) => setInvitePassword(event.target.value)}
                    placeholder="Generate or type one"
                    className={`${fieldClass} font-mono`}
                    autoComplete="new-password"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    className="mb-2 block text-sm font-medium text-ink"
                    htmlFor="parishId"
                  >
                    Desk
                  </label>
                  {parishDesk && profile.parish_id ? (
                    <>
                      <input
                        type="hidden"
                        name="parishId"
                        value={profile.parish_id}
                      />
                      <p
                        id="parishId"
                        className={`${fieldClass} bg-white/40 text-ink`}
                      >
                        Parish — {ownParishName}
                      </p>
                      <p className="mt-1.5 text-xs text-ink/50">
                        Locked to your parish. You cannot invite to another
                        church or to National.
                      </p>
                    </>
                  ) : (
                    <>
                      <select
                        id="parishId"
                        name="parishId"
                        className={fieldClass}
                        defaultValue=""
                      >
                        <option value="">National — all parishes</option>
                        {parishes.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.region ? ` — ${p.region}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-ink/50">
                        A parish desk only sees that church’s students and work.
                        We email them a welcome with login details.
                      </p>
                    </>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={pending || (parishDesk && !profile.parish_id)}
                    className="w-full bg-pine px-5 py-3 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60 sm:w-auto"
                  >
                    {pending ? "Creating…" : "Create admin"}
                  </button>
                </div>
              </form>
            ) : null}

            {panel === "password" ? (
              <form
                className="grid max-w-md gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  run(() => changeOwnPassword(new FormData(form)), form);
                }}
              >
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
                      onClick={() => setShowPassword((value) => !value)}
                      className="text-xs font-medium text-pine underline decoration-pine/30 underline-offset-4"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <input
                    id="currentPassword"
                    name="currentPassword"
                    type={showPassword ? "text" : "password"}
                    required
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
                    autoComplete="new-password"
                    className={fieldClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={pending}
                  className="mt-1 bg-pine px-5 py-3 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
                >
                  {pending ? "Updating…" : "Update password"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      )}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !pending && setPendingDelete(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-admin-title"
            className="animate-fade-rise w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-red-800/80">
              Delete admin
            </p>
            <h3
              id="delete-admin-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              Remove this account?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              This permanently deletes{" "}
              <span className="font-medium text-ink">
                {pendingDelete.full_name || pendingDelete.email}
              </span>{" "}
              ({pendingDelete.email}). This cannot be undone.
            </p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={() => setPendingDelete(null)}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => deleteAdminAccount(pendingDelete.id))
                }
                className="bg-[#5c2a2a] px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-red-900 disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccessInsightGuide({ profile }: { profile: AdminProfile }) {
  const yourDesk =
    profile.role === "master"
      ? "Master"
      : isParishAdmin(profile)
        ? "Parish"
        : "National";

  const points =
    yourDesk === "Parish"
      ? [
          {
            title: "Your desk",
            body: "You only see your parish’s students and work.",
          },
          {
            title: "Invites",
            body: "You may invite another admin to your own parish only — not to another church, and not to National. We email them a temporary password.",
          },
          {
            title: "Directory & password",
            body: "View people on your parish desk. Change your own password here. National staff handle deactivate, reset, or delete.",
          },
        ]
      : [
          {
            title: "Your desk",
            body:
              yourDesk === "Master"
                ? "Full UK access. Your account is protected and cannot be removed."
                : "Full UK access. Invite staff and set each person to National or a parish.",
          },
          {
            title: "Invites",
            body: "New admins get a welcome email with their temporary password and desk label.",
          },
          {
            title: "The three desks",
            body: "Master — protected, all parishes. National — all parishes. Parish — one church only.",
          },
        ];

  return (
    <div className="border border-stone bg-mist">
      <div className="border-b border-stone px-4 py-4 sm:px-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Insight
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          How Access works
        </h2>
        <p className="mt-1.5 text-sm text-ink/60">
          Your desk: <span className="font-medium text-pine">{yourDesk}</span>
        </p>
      </div>

      <ul className="divide-y divide-stone">
        {points.map((point) => (
          <li key={point.title} className="px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-medium text-ink">{point.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink/65">
              {point.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
