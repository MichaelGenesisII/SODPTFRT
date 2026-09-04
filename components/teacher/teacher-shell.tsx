"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOutTeacher } from "@/app/teacher/actions";
import { NavProgress } from "@/components/ui/nav-progress";
import { SignOutConfirmModal } from "@/components/ui/sign-out-confirm";
import { StaffAvatar } from "@/components/ui/staff-avatar";
import {
  teacherDisplayName,
  type TeacherProfile,
} from "@/lib/teacher/types";

const SIDEBAR_KEY = "sod-teacher-sidebar-open";

const nav = [
  {
    href: "/teacher",
    label: "Home",
    hint: "Upcoming & to confirm",
    icon: HomeIcon,
  },
  {
    href: "/teacher/classes",
    label: "Classes",
    hint: "Your schedule",
    icon: ClassIcon,
  },
  {
    href: "/teacher/history",
    label: "History",
    hint: "Past deliveries",
    icon: HistoryIcon,
  },
  {
    href: "/teacher/account",
    label: "Account",
    hint: "Password & profile",
    icon: AccountIcon,
  },
] as const;

function pathActive(href: string, pathname: string) {
  if (href === "/teacher") return pathname === "/teacher";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TeacherShell({
  profile,
  children,
}: {
  profile: TeacherProfile;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const name = teacherDisplayName(profile);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const current =
    nav.find((item) => pathActive(item.href, pathname))?.label ?? "Teacher";

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored === "0") setDesktopOpen(false);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, desktopOpen ? "1" : "0");
  }, [desktopOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="relative flex min-h-svh flex-col bg-mist text-ink lg:flex-row">
      <NavProgress />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.14),_transparent_52%),radial-gradient(ellipse_at_bottom_left,_rgba(20,53,44,0.06),_transparent_48%)]"
        aria-hidden
      />

      {/* Mobile top bar */}
      <div className="grain relative isolate sticky top-0 z-40 shrink-0 border-b border-mist/10 bg-pine px-4 py-3 text-mist lg:hidden">
        <div className="relative flex items-center justify-between gap-3">
          <Link href="/teacher" className="flex min-w-0 items-center gap-3">
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-lg leading-none">
                Teaching
              </p>
              <p className="mt-1 truncate text-[0.65rem] uppercase tracking-[0.14em] text-celadon">
                {current}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center border border-mist/20 text-mist"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            <MenuIcon open={mobileOpen} />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px] lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`grain isolate fixed inset-y-0 left-0 z-50 flex h-svh max-h-svh w-[min(18rem,88vw)] flex-col overflow-hidden bg-pine text-mist shadow-[8px_0_40px_-12px_rgba(20,53,44,0.55)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:z-40 lg:border-r lg:border-mist/10 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          desktopOpen
            ? "lg:w-64 lg:translate-x-0"
            : "lg:pointer-events-none lg:w-0 lg:translate-x-0 lg:border-0"
        }`}
        aria-hidden={desktopOpen || mobileOpen ? undefined : true}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(95_143_122/0.28),transparent_52%),linear-gradient(180deg,transparent_40%,rgb(8_22_18/0.45)_100%)]"
          aria-hidden
        />

        <div
          className={`relative border-b border-mist/10 px-5 pb-6 pt-8 ${
            desktopOpen ? "" : "lg:invisible"
          }`}
        >
          <Link href="/teacher" className="flex min-w-0 items-center gap-3">
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-mist/45">
                Teacher portal
              </p>
              <p className="mt-1 font-display text-2xl leading-none tracking-[-0.02em]">
                Teaching
              </p>
            </div>
          </Link>
        </div>

        <nav
          className={`relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4 ${
            desktopOpen ? "" : "lg:invisible"
          }`}
        >
          {nav.map((item) => {
            const active = pathActive(item.href, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`flex items-start gap-3 px-3 py-3 text-sm transition-colors ${
                  active
                    ? "bg-mist/15 text-mist"
                    : "text-mist/70 hover:bg-mist/10 hover:text-mist"
                }`}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 opacity-90" />
                <span className="min-w-0">
                  <span className="block font-medium leading-tight">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.65rem] text-mist/45">
                    {item.hint}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div
          className={`relative mt-auto shrink-0 border-t border-mist/10 px-5 py-5 ${
            desktopOpen ? "" : "lg:invisible"
          }`}
        >
          <p className="truncate text-sm font-medium text-mist">{name}</p>
          <p className="mt-0.5 truncate text-xs text-mist/50">{profile.email}</p>
          <button
            type="button"
            onClick={() => setDesktopOpen(false)}
            className="mt-4 hidden w-full border border-mist/20 px-4 py-2.5 text-sm font-medium text-mist/75 hover:border-mist/45 hover:bg-mist/[0.06] hover:text-mist lg:block"
          >
            Hide menu
          </button>
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="mt-2 w-full border border-mist/20 px-4 py-2.5 text-sm font-medium text-mist/75 hover:border-mist/45 hover:bg-mist/[0.06] hover:text-mist"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div
        className={`relative flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          desktopOpen ? "lg:pl-64" : "lg:pl-0"
        }`}
      >
        <header className="sticky top-0 z-30 hidden h-[4.75rem] items-center justify-between gap-4 border-b border-stone/80 bg-mist/90 px-6 backdrop-blur-xl lg:flex lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            {!desktopOpen ? (
              <button
                type="button"
                onClick={() => setDesktopOpen(true)}
                className="inline-flex h-10 items-center gap-2 border border-pine/25 bg-mist px-3 text-sm font-medium text-pine hover:border-pine"
                aria-label="Show sidebar"
              >
                <PanelIcon collapsed />
                Menu
              </button>
            ) : null}
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-ink/40">
                Teaching <span className="mx-2 text-stone">/</span>
                <span className="text-celadon">{current}</span>
              </p>
              <p className="mt-1 font-display text-xl leading-none text-pine">
                School of Disciples
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-pine">{name}</p>
              <p className="mt-0.5 text-xs text-ink/45">Teacher account</p>
            </div>
            <StaffAvatar
              name={name}
              imageUrl={profile.avatarUrl}
              size="lg"
            />
          </div>
        </header>

        <main className="relative flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-3xl animate-fade-rise">{children}</div>
        </main>
      </div>

      <SignOutConfirmModal
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        signOut={signOutTeacher}
        portalLabel="the teacher portal"
      />
    </div>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11.5 12 5l8 6.5V20H4v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8h16v9H4V8Z" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 12.5h.01M12 12.5h.01M16 12.5h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 8.5V12l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccountIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="9" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 18.5c1.4-2.2 3.3-3.3 5.5-3.3s4.1 1.1 5.5 3.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={open ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h12M4 17h16"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="5"
        width="16"
        height="14"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M9 5v14" stroke="currentColor" strokeWidth="1.5" />
      <path
        d={collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
