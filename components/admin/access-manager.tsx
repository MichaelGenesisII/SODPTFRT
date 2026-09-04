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
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { StaffAvatar } from "@/components/ui/staff-avatar";
import { useToast } from "@/components/ui/toast";
import {
  isNationalAdmin,
  isParishAdmin,
  type AdminProfile,
} from "@/lib/admin/profile";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import { parishAdminEnabled } from "@/lib/admin/features";
import type { Parish } from "@/lib/parishes";
import { DeskPagination } from "@/lib/ui/desk-pagination";
import { TeachersFinanceManager } from "@/components/admin/teachers-finance-manager";
import type { TeacherProfile } from "@/lib/teacher/types";

const fieldClass =
  "w-full border border-stone bg-white/70 px-4 py-3 text-sm outline-none transition-[border-color,background-color] duration-300 focus:border-pine focus:bg-mist";

const DIRECTORY_PAGE_SIZE = 8;

type PageView = "admins" | "teachers" | "insight";
type DeskTab = "directory" | "password";

type PendingConfirm =
  | { kind: "delete"; admin: AdminProfile }
  | { kind: "toggleActive"; admin: AdminProfile; activate: boolean }
  | {
      kind: "resetPassword";
      admin: AdminProfile;
      password: string;
    }
  | {
      kind: "deskScope";
      admin: AdminProfile;
      parishId: string | null;
    };

type AccessManagerProps = {
  profile: AdminProfile;
  admins: AdminProfile[];
  parishes: Pick<Parish, "id" | "name" | "region">[];
  teachers?: TeacherProfile[];
  initialStaffTab?: "admins" | "teachers";
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

function deskScopeLabel(
  parishId: string | null,
  parishes: Pick<Parish, "id" | "name">[],
): string {
  if (!parishId) return "National desk";
  return parishes.find((p) => p.id === parishId)?.name ?? "Parish desk";
}

function adminDisplayName(admin: AdminProfile): string {
  return admin.full_name || admin.email;
}

export function AccessManager({
  profile,
  admins,
  parishes,
  teachers = [],
  initialStaffTab = "admins",
}: AccessManagerProps) {
  const { success, error, info } = useToast();
  const national = isNationalAdmin(profile);
  const parishDesk = isParishAdmin(profile);
  const parishInvitesEnabled = parishAdminEnabled();
  const [pageView, setPageView] = useState<PageView>(
    national && initialStaffTab === "teachers" ? "teachers" : "admins",
  );
  const [deskTab, setDeskTab] = useState<DeskTab>("directory");
  const [inviting, setInviting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [showPassword, setShowPassword] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const [resetPasswordDrafts, setResetPasswordDrafts] = useState<
    Record<string, string>
  >({});
  const [query, setQuery] = useState("");
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

  const filteredAdmins = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleAdmins;
    return visibleAdmins.filter((admin) => {
      const hay = [
        admin.full_name,
        admin.email,
        deskBadge(admin, parishes),
        admin.is_active ? "active" : "inactive",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [visibleAdmins, query, parishes]);

  const activeCount = visibleAdmins.filter((admin) => admin.is_active).length;
  const inactiveCount = visibleAdmins.length - activeCount;
  const parishDeskCount = visibleAdmins.filter((admin) => admin.parish_id).length;

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAdmins.length / DIRECTORY_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * DIRECTORY_PAGE_SIZE;
  const pageAdmins = filteredAdmins.slice(
    pageStart,
    pageStart + DIRECTORY_PAGE_SIZE,
  );

  const ownParishName =
    parishes.find((p) => p.id === profile.parish_id)?.name ?? "Your parish";

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (!pendingConfirm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setPendingConfirm(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingConfirm, busy]);

  function openInvite() {
    setInviting(true);
    setExpandedId(null);
    setPageView("admins");
  }

  function closeInvite() {
    setInviting(false);
    setInvitePassword("");
  }

  function goToPage(next: number) {
    setExpandedId(null);
    setPage(Math.min(totalPages, Math.max(1, next)));
  }

  function run(
    action: () => Promise<AdminActionResult>,
    options?: {
      form?: HTMLFormElement | null;
      toastTitle?: string;
      label?: string;
      closeInvite?: boolean;
    },
  ) {
    const label = options?.label ?? "Working…";
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          const emailFailed = /welcome email failed/i.test(next.message);
          if (emailFailed) {
            error(next.message, "Account created");
          } else {
            success(next.message, options?.toastTitle ?? "Access");
          }
          options?.form?.reset();
          setInvitePassword("");
          const resetAdminId =
            pendingConfirm?.kind === "resetPassword"
              ? pendingConfirm.admin.id
              : null;
          setPendingConfirm(null);
          if (resetAdminId) {
            setResetPasswordDrafts((current) => {
              const nextDrafts = { ...current };
              delete nextDrafts[resetAdminId];
              return nextDrafts;
            });
          }
          if (options?.closeInvite !== false) {
            setInviting(false);
          }
        } else {
          error(next.message, options?.toastTitle ?? "Access");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;

    switch (pendingConfirm.kind) {
      case "delete":
        run(() => deleteAdminAccount(pendingConfirm.admin.id), {
          label: "Removing account…",
        });
        return;
      case "toggleActive":
        run(
          () =>
            setAdminActive(
              pendingConfirm.admin.id,
              pendingConfirm.activate,
            ),
          {
            label: pendingConfirm.activate
              ? "Reactivating…"
              : "Deactivating…",
          },
        );
        return;
      case "resetPassword": {
        const formData = new FormData();
        formData.set("adminId", pendingConfirm.admin.id);
        formData.set("password", pendingConfirm.password);
        run(() => resetAdminPassword(formData), {
          label: "Resetting password…",
        });
        return;
      }
      case "deskScope":
        run(
          () =>
            setAdminParishScope(
              pendingConfirm.admin.id,
              pendingConfirm.parishId,
            ),
          { label: "Updating desk…" },
        );
    }
  }

  return (
    <div className="relative space-y-4" aria-busy={busy}>
      {!inviting ? (
        <>
          <nav
            data-tour="access-tabs"
            className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
            aria-label="Access page"
          >
            {(
              [
                { id: "admins" as const, label: "Admins" },
                ...(national
                  ? [{ id: "teachers" as const, label: "Teachers" }]
                  : []),
                { id: "insight" as const, label: "Insight" },
              ] as const
            ).map((tab) => {
              const active = pageView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPageView(tab.id)}
                  className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                    active ? "text-pine" : "text-ink/50 hover:text-ink/80"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden
                  />
                </button>
              );
            })}
          </nav>

          {pageView === "insight" ? (
            <AccessInsightGuide profile={profile} />
          ) : pageView === "teachers" && national ? (
            <TeachersFinanceManager initialTeachers={teachers} />
          ) : (
            <>
              <div className="grid gap-px border border-stone bg-stone sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Staff",
                    value: visibleAdmins.length,
                    hint: parishDesk ? "Your parish desk" : "Visible accounts",
                  },
                  {
                    label: "Active",
                    value: activeCount,
                    hint: "Can sign in",
                  },
                  {
                    label: "Inactive",
                    value: inactiveCount,
                    hint: "Deactivated",
                  },
                  {
                    label: national ? "Parish desks" : "Your desk",
                    value: national ? parishDeskCount : ownParishName,
                    hint: national
                      ? "Scoped to one church"
                      : "Parish-scoped access",
                  },
                ].map((tile) => (
                  <div
                    key={tile.label}
                    className="bg-mist/90 px-4 py-3 sm:px-5 sm:py-4"
                  >
                    <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                      {tile.label}
                    </p>
                    <p className="mt-1 font-display text-2xl tabular-nums text-pine">
                      {tile.value}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">{tile.hint}</p>
                  </div>
                ))}
              </div>

              <div
                data-tour="access-invite"
                className="flex flex-col gap-3 border border-stone bg-mist/40 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"
              >
                <div className="min-w-0 flex-1">
                  <label className="block">
                    <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                      Search staff
                    </span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Name, email, or desk…"
                      disabled={busy}
                      className="mt-2 w-full max-w-md border border-stone bg-white/80 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={busy || (parishDesk && !profile.parish_id)}
                  onClick={openInvite}
                  className="inline-flex min-h-[2.5rem] shrink-0 items-center justify-center bg-pine px-4 py-2 text-sm font-medium text-mist disabled:opacity-50"
                >
                  Invite admin
                </button>
              </div>

              <div
                data-tour="access-desk"
                className="border border-stone bg-mist/40 p-4 sm:p-5"
              >
                <nav
                  className="mb-4 flex gap-1 overflow-x-auto border-b border-stone pb-px"
                  aria-label="Access desk"
                >
                  {(
                    [
                      { id: "directory" as const, label: "Directory" },
                      { id: "password" as const, label: "My password" },
                    ] as const
                  ).map((tab) => {
                    const active = deskTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setDeskTab(tab.id);
                          setExpandedId(null);
                        }}
                        className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                          active ? "text-pine" : "text-ink/50 hover:text-ink/80"
                        }`}
                      >
                        {tab.label}
                        <span
                          className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                            active ? "opacity-100" : "opacity-0"
                          }`}
                          aria-hidden
                        />
                      </button>
                    );
                  })}
                </nav>

                {deskTab === "directory" ? (
                  <div>
                    <p className="mb-4 text-sm text-ink/60">
                      {national
                        ? "Open a staff member to set their desk, reset a password, or remove access."
                        : "People on your parish desk. You can invite more for this parish only."}
                    </p>

                    <ul className="divide-y divide-stone border border-stone bg-white/50">
                      {pageAdmins.length === 0 ? (
                        <li className="px-4 py-10 text-center text-sm text-ink/50">
                          {visibleAdmins.length === 0
                            ? "No staff accounts yet."
                            : "No staff match your search."}
                        </li>
                      ) : (
                        pageAdmins.map((admin) => {
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
                                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-pine/[0.03] sm:gap-4 sm:px-5"
                                aria-expanded={open}
                              >
                                <StaffAvatar
                                  name={adminDisplayName(admin)}
                                  imageUrl={admin.avatarUrl}
                                  active={admin.is_active}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-pine">
                                      {admin.full_name || "Unnamed admin"}
                                    </span>
                                    {isSelf ? (
                                      <span className="text-xs text-ink/45">
                                        (you)
                                      </span>
                                    ) : null}
                                    <span className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
                                      {deskBadge(admin, parishes)}
                                    </span>
                                    {!admin.is_active ? (
                                      <span className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                                        Inactive
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="mt-1 block truncate font-mono text-xs text-ink/55 sm:text-sm">
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
                                  <div className="border-t border-stone/70 bg-mist/40 px-4 py-4 sm:px-5 sm:pl-16">
                                    {admin.role === "master" ? (
                                      <p className="text-sm text-ink/55">
                                        Protected master account. Change your own
                                        password under{" "}
                                        <button
                                          type="button"
                                          onClick={() => setDeskTab("password")}
                                          className="font-medium text-pine underline decoration-pine/30 underline-offset-4"
                                        >
                                          My password
                                        </button>
                                        .
                                      </p>
                                    ) : !national ? (
                                      <p className="text-sm text-ink/55">
                                        {isSelf
                                          ? "Use My password to update your login."
                                          : "Ask a national desk to change this person’s access, password, or status."}
                                      </p>
                                    ) : canManage ? (
                                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                                        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink/55">
                                          Desk
                                          <select
                                            disabled={busy}
                                            value={admin.parish_id ?? ""}
                                            onChange={(event) => {
                                              const next =
                                                event.target.value || null;
                                              const current =
                                                admin.parish_id ?? null;
                                              if (next === current) return;
                                              setPendingConfirm({
                                                kind: "deskScope",
                                                admin,
                                                parishId: next,
                                              });
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
                                          disabled={busy}
                                          onClick={() =>
                                            setPendingConfirm({
                                              kind: "toggleActive",
                                              admin,
                                              activate: !admin.is_active,
                                            })
                                          }
                                          className="border border-pine/30 px-3 py-2.5 text-sm text-pine transition-colors hover:border-pine disabled:opacity-60 sm:shrink-0"
                                        >
                                          {admin.is_active
                                            ? "Deactivate"
                                            : "Reactivate"}
                                        </button>
                                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                                          <input
                                            type="text"
                                            required
                                            minLength={8}
                                            value={
                                              resetPasswordDrafts[admin.id] ??
                                              ""
                                            }
                                            onChange={(event) =>
                                              setResetPasswordDrafts(
                                                (current) => ({
                                                  ...current,
                                                  [admin.id]:
                                                    event.target.value,
                                                }),
                                              )
                                            }
                                            placeholder="New password"
                                            disabled={busy}
                                            className={`${fieldClass} font-mono`}
                                          />
                                          <button
                                            type="button"
                                            disabled={
                                              busy ||
                                              (resetPasswordDrafts[admin.id]
                                                ?.length ?? 0) < 8
                                            }
                                            onClick={() => {
                                              const password =
                                                resetPasswordDrafts[
                                                  admin.id
                                                ]?.trim() ?? "";
                                              if (password.length < 8) return;
                                              setPendingConfirm({
                                                kind: "resetPassword",
                                                admin,
                                                password,
                                              });
                                            }}
                                            className="shrink-0 bg-pine px-3 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
                                          >
                                            Reset
                                          </button>
                                        </div>
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() =>
                                            setPendingConfirm({
                                              kind: "delete",
                                              admin,
                                            })
                                          }
                                          className="inline-flex h-10 w-10 items-center justify-center border border-red-900/20 text-red-800 transition-colors hover:border-red-800/50 hover:bg-red-50 disabled:opacity-60 sm:ml-auto"
                                          aria-label={`Delete ${adminDisplayName(admin)}`}
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
                        })
                      )}
                    </ul>

                    <DeskPagination
                      page={currentPage}
                      totalItems={filteredAdmins.length}
                      pageSize={DIRECTORY_PAGE_SIZE}
                      onPageChange={goToPage}
                      className="mt-4"
                      itemLabel="staff"
                    />
                  </div>
                ) : null}

                {deskTab === "password" ? (
                  <div>
                    <p className="mb-4 text-sm text-ink/60">
                      Update the password for this signed-in account.
                    </p>
                    <form
                      className="relative grid max-w-md gap-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        run(() => changeOwnPassword(new FormData(form)), {
                          form,
                          label: "Updating password…",
                          closeInvite: false,
                        });
                      }}
                    >
                      <DeskLoaderOverlay
                        active={busy && !pendingConfirm}
                        label="Securing your key…"
                      />
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
                            disabled={busy}
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
                          disabled={busy}
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
                          disabled={busy}
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
                          disabled={busy}
                          autoComplete="new-password"
                          className={fieldClass}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={busy}
                        className="mt-1 inline-flex min-h-[2.75rem] min-w-[10rem] items-center justify-center bg-pine px-5 py-3 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
                      >
                        {busy ? (
                          <DeskLoader label="Updating…" tone="mist" />
                        ) : (
                          "Update password"
                        )}
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="animate-panel-in space-y-4">
          <button
            type="button"
            disabled={busy}
            onClick={closeInvite}
            className="inline-flex min-h-[2.75rem] items-center gap-2 border border-pine/35 bg-white px-4 py-2.5 text-sm font-medium text-pine shadow-[0_1px_0_rgba(20,53,44,0.06)] transition-colors hover:border-pine hover:bg-mist disabled:opacity-50"
          >
            <span aria-hidden className="text-base leading-none">
              ←
            </span>
            All staff
          </button>

          <div className="border border-stone bg-mist/40 p-4 sm:p-5">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Invite
            </p>
            <h2 className="mt-1 font-display text-[clamp(1.35rem,3vw,1.85rem)] tracking-[-0.02em] text-pine">
              Invite an admin
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
              {national
                ? parishInvitesEnabled
                  ? "Create their account and email a temporary password. Pick National or a parish desk."
                  : "Create a national desk account. We email them a temporary password."
                : `Create another admin for ${ownParishName}. We email them a temporary password.`}
            </p>

            <form
              className="relative mt-6 grid max-w-xl gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                run(
                  () => createAdminAccount(new FormData(form)),
                  {
                    form,
                    toastTitle: "Invite",
                    label: "Creating account…",
                  },
                );
              }}
            >
              <DeskLoaderOverlay
                active={busy && !pendingConfirm}
                label="Opening the desk…"
              />
                <div className="sm:col-span-2">
                  <label
                    className="mb-2 block text-sm font-medium text-ink"
                    htmlFor="fullName"
                  >
                    Full name
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    className={fieldClass}
                    disabled={busy}
                  />
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
                    disabled={busy}
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
                      disabled={busy}
                      onClick={() => {
                        const next = createTemporaryPassword(12);
                        setInvitePassword(next);
                        info("Temporary password ready.", "Generated");
                      }}
                      className="text-xs font-medium text-pine underline decoration-pine/30 underline-offset-4 disabled:opacity-50"
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
                    disabled={busy}
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
                  ) : !parishInvitesEnabled ? (
                    <>
                      <input type="hidden" name="parishId" value="" />
                      <p
                        id="parishId"
                        className={`${fieldClass} bg-white/40 text-ink`}
                      >
                        National desk
                      </p>
                      <p className="mt-1.5 text-xs text-ink/50">
                        Parish admin desks are paused. New admins join the
                        national desk only.
                      </p>
                    </>
                  ) : (
                    <>
                      <select
                        id="parishId"
                        name="parishId"
                        className={fieldClass}
                        defaultValue=""
                        disabled={busy}
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
                <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={busy || (parishDesk && !profile.parish_id)}
                    className="inline-flex min-h-[2.75rem] min-w-[9.5rem] items-center justify-center bg-pine px-5 py-3 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60 sm:w-auto"
                  >
                    {busy ? (
                      <DeskLoader label="Creating…" tone="mist" />
                    ) : (
                      "Create admin"
                    )}
                  </button>
                </div>
              </form>
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
      )}

      {pendingConfirm ? (
        <AccessConfirmDialog
          confirm={pendingConfirm}
          parishes={parishes}
          busy={busy}
          busyLabel={busyLabel}
          onCancel={() => !busy && setPendingConfirm(null)}
          onConfirm={confirmPendingAction}
        />
      ) : null}
    </div>
  );
}

function AccessConfirmDialog({
  confirm,
  parishes,
  busy,
  busyLabel,
  onCancel,
  onConfirm,
}: {
  confirm: PendingConfirm;
  parishes: Pick<Parish, "id" | "name">[];
  busy: boolean;
  busyLabel: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const admin = confirm.admin;
  const name = adminDisplayName(admin);

  const copy =
    confirm.kind === "delete"
      ? {
          eyebrow: "Delete admin",
          title: "Remove this account?",
          body: (
            <>
              This permanently deletes{" "}
              <span className="font-medium text-ink">{name}</span> (
              {admin.email}). This cannot be undone.
            </>
          ),
          confirmLabel: "Delete permanently",
          destructive: true,
          loaderLabel: "Removing account…",
        }
      : confirm.kind === "toggleActive"
        ? confirm.activate
          ? {
              eyebrow: "Reactivate",
              title: "Reactivate this account?",
              body: (
                <>
                  <span className="font-medium text-ink">{name}</span> will be
                  able to sign in again.
                </>
              ),
              confirmLabel: "Reactivate",
              destructive: false,
              loaderLabel: "Reactivating…",
            }
          : {
              eyebrow: "Deactivate",
              title: "Deactivate this account?",
              body: (
                <>
                  <span className="font-medium text-ink">{name}</span> will not
                  be able to sign in until reactivated.
                </>
              ),
              confirmLabel: "Deactivate",
              destructive: true,
              loaderLabel: "Deactivating…",
            }
        : confirm.kind === "resetPassword"
          ? {
              eyebrow: "Reset password",
              title: "Reset this password?",
              body: (
                <>
                  Set a new password for{" "}
                  <span className="font-medium text-ink">{name}</span>. They
                  will need this password to sign in.
                </>
              ),
              confirmLabel: "Reset password",
              destructive: false,
              loaderLabel: "Resetting password…",
            }
          : {
              eyebrow: "Change desk",
              title: "Move to another desk?",
              body: (
                <>
                  <span className="font-medium text-ink">{name}</span> will move
                  from{" "}
                  <span className="font-medium text-ink">
                    {deskScopeLabel(admin.parish_id ?? null, parishes)}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-ink">
                    {deskScopeLabel(confirm.parishId, parishes)}
                  </span>
                  .
                </>
              ),
              confirmLabel: "Change desk",
              destructive: false,
              loaderLabel: "Updating desk…",
            };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-confirm-title"
        className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <DeskLoaderOverlay active={busy} label={busyLabel ?? copy.loaderLabel} />
        <p
          className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
            copy.destructive ? "text-red-800/80" : "text-celadon"
          }`}
        >
          {copy.eyebrow}
        </p>
        <h3
          id="access-confirm-title"
          className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
        >
          {copy.title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-ink/70">{copy.body}</p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
              copy.destructive
                ? "bg-[#5c2a2a] text-mist hover:bg-red-900"
                : "bg-pine text-mist hover:bg-celadon"
            }`}
          >
            {busy ? (
              <DeskLoader label={copy.loaderLabel} tone="mist" />
            ) : (
              copy.confirmLabel
            )}
          </button>
        </div>
      </div>
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
            title: "Admins & teachers",
            body: "Use the Admins tab for desk staff. Use Teachers for teacher portal accounts (invite, activate, delete). Assign teachers on Classes.",
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
