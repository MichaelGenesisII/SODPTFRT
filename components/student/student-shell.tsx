"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { signOutStudent } from "@/app/student/actions";
import { useStudentSupportLive } from "@/components/student/support-live";
import { NavProgress } from "@/components/ui/nav-progress";
import { SOD_STUDENT_TOUR_EXPAND_EVENT } from "@/lib/student/portal-tour-steps";
import {
  studentDisplayName,
  type StudentProfile,
} from "@/lib/student/types";

const SIDEBAR_KEY = "sod-student-sidebar-open";

type NavIcon = (props: { className?: string }) => ReactNode;

type NavChild = {
  href: string;
  id: string;
  label: string;
  hint: string;
};

type NavLink = {
  kind: "link";
  href: string;
  id: string;
  label: string;
  hint: string;
  icon: NavIcon;
};

type NavGroup = {
  kind: "group";
  id: string;
  label: string;
  hint: string;
  icon: NavIcon;
  children: NavChild[];
};

type NavEntry = NavLink | NavGroup;

const nav: NavEntry[] = [
  {
    kind: "link",
    href: "/student#overview",
    id: "overview",
    label: "Overview",
    hint: "Your journey at a glance",
    icon: OverviewIcon,
  },
  {
    kind: "group",
    id: "enrolment",
    label: "Enrolment",
    hint: "Application & fees",
    icon: ApplicationIcon,
    children: [
      {
        href: "/student#application",
        id: "application",
        label: "Application",
        hint: "Status and submitted form",
      },
      {
        href: "/student/payments",
        id: "payments",
        label: "Payments",
        hint: "Tuition & graduation fees",
      },
    ],
  },
  {
    kind: "group",
    id: "learning",
    label: "Learning",
    hint: "Classes & results",
    icon: ClassIcon,
    children: [
      {
        href: "/student/classes",
        id: "classes",
        label: "Classes",
        hint: "Zoom live hall",
      },
      {
        href: "/student/exams",
        id: "exams",
        label: "Exams",
        hint: "Timed assessments",
      },
      {
        href: "/student/records",
        id: "records",
        label: "Records",
        hint: "Attendance & scores",
      },
      {
        href: "/student/gallery",
        id: "gallery",
        label: "Gallery",
        hint: "Batch & parish faces",
      },
    ],
  },
  {
    kind: "group",
    id: "reach",
    label: "Reach",
    hint: "Notices & desk",
    icon: NoticeIcon,
    children: [
      {
        href: "/student/notices",
        id: "notices",
        label: "Notices",
        hint: "Updates from the School",
      },
      {
        href: "/student/community",
        id: "community",
        label: "Community",
        hint: "National student chat",
      },
      {
        href: "/student/support",
        id: "support",
        label: "Support",
        hint: "Chat with the Listening Desk",
      },
      {
        href: "/student/report-bug",
        id: "report-bug",
        label: "Report a bug",
        hint: "Something not working",
      },
      {
        href: "/student/account",
        id: "account",
        label: "Account",
        hint: "Password & profile",
      },
    ],
  },
];

function studentNavMatches(
  href: string,
  id: string,
  pathname: string,
  activeSection: string,
) {
  if (id === "overview" || id === "application") {
    return pathname === "/student" && activeSection === id;
  }
  const path = href.split("#")[0];
  return pathname.startsWith(path);
}

function groupContainsStudentPath(
  group: NavGroup,
  pathname: string,
  activeSection: string,
) {
  return group.children.some((child) =>
    studentNavMatches(child.href, child.id, pathname, activeSection),
  );
}

function findStudentNavLabel(pathname: string, activeSection: string) {
  for (const entry of nav) {
    if (entry.kind === "link") {
      if (studentNavMatches(entry.href, entry.id, pathname, activeSection)) {
        return entry.label;
      }
    } else {
      const child = entry.children.find((c) =>
        studentNavMatches(c.href, c.id, pathname, activeSection),
      );
      if (child) return child.label;
    }
  }
  return "Overview";
}

function OverviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ApplicationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 4.5h7l3 3V20H7V4.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 4.5v3h3M9.5 11h5M9.5 14.5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8h16v9H4V8Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 12.5h.01M12 12.5h.01M16 12.5h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NoticeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 5h12v14H6V5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9 9h6M9 12.5h6M9 16h4"
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
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
      <path
        d="M9 5v14"
        stroke="currentColor"
        strokeWidth="1.5"
      />
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

type StudentShellProps = {
  profile: StudentProfile;
  children: ReactNode;
};

export function StudentShell({ profile, children }: StudentShellProps) {
  const pathname = usePathname();
  const { unread } = useStudentSupportLive();
  const name = studentDisplayName(profile);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("overview");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored === "0") setDesktopOpen(false);

    function readHash() {
      setActiveSection(window.location.hash.slice(1) || "overview");
    }

    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, desktopOpen ? "1" : "0");
  }, [desktopOpen]);

  useEffect(() => {
    function onTourExpand(event: Event) {
      const detail = (event as CustomEvent<{ groupId?: string }>).detail;
      setDesktopOpen(true);
      setMobileOpen(true);
      const groupId = detail?.groupId;
      if (groupId) setOpenGroupId(groupId);
    }
    window.addEventListener(SOD_STUDENT_TOUR_EXPAND_EVENT, onTourExpand);
    return () =>
      window.removeEventListener(SOD_STUDENT_TOUR_EXPAND_EVENT, onTourExpand);
  }, []);

  useEffect(() => {
    const match = nav.find(
      (entry) =>
        entry.kind === "group" &&
        groupContainsStudentPath(entry, pathname, activeSection),
    );
    // Only auto-open the active route's group. Never force-close on sync —
    // that prevented opening other sections from Overview.
    if (match?.kind === "group") {
      setOpenGroupId(match.id);
    }
  }, [pathname, activeSection]);

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

  useEffect(() => {
    if (!pathname.startsWith("/student/community")) return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!vv) return;
    const viewport = vv;

    function sync() {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        root.style.removeProperty("--community-vvh");
        return;
      }
      root.style.setProperty("--community-vvh", `${viewport.height}px`);
    }

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
      root.style.removeProperty("--community-vvh");
    };
  }, [pathname]);

  function isChildActive(child: NavChild) {
    return studentNavMatches(child.href, child.id, pathname, activeSection);
  }

  function toggleGroup(id: string) {
    setOpenGroupId((current) => (current === id ? null : id));
  }

  function onNavClick(
    event: MouseEvent<HTMLAnchorElement>,
    item: { id: string; href: string },
  ) {
    setMobileOpen(false);
    if (item.id === "overview" || item.id === "application") {
      setActiveSection(item.id);
      if (pathname === "/student") {
        event.preventDefault();
        if (window.location.hash.slice(1) !== item.id) {
          window.location.hash = item.id;
        } else {
          window.dispatchEvent(new Event("hashchange"));
        }
      }
      return;
    }
    setActiveSection(item.id);
  }

  const currentSection = findStudentNavLabel(pathname, activeSection);
  const communityMobile = pathname.startsWith("/student/community");

  return (
    <div
      className={`relative flex min-h-svh flex-col bg-mist text-ink lg:flex-row ${
        communityMobile
          ? "max-lg:h-[var(--community-vvh,100dvh)] max-lg:overflow-hidden"
          : ""
      }`}
    >
      <NavProgress />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.12),_transparent_45%),radial-gradient(ellipse_at_bottom_left,_rgba(20,53,44,0.06),_transparent_40%)]"
        aria-hidden
      />

      <div
        className={`grain relative isolate sticky top-0 z-40 shrink-0 border-b border-mist/10 bg-pine text-mist lg:hidden ${
          communityMobile ? "px-3 py-2.5" : "px-4 py-3"
        }`}
      >
        <div className="relative flex items-center justify-between gap-3">
          <Link href="/student#overview" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className={`object-contain ${communityMobile ? "h-8 w-8" : "h-9 w-9"}`}
            />
            <div className="min-w-0">
              <p
                className={`truncate font-display leading-none ${
                  communityMobile ? "text-base" : "text-lg"
                }`}
              >
                {communityMobile ? "Community" : "My Journey"}
              </p>
              <p className="mt-0.5 truncate text-[0.65rem] uppercase tracking-[0.14em] text-celadon sm:mt-1">
                {communityMobile ? "National channel" : currentSection}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {profile.passportUrl && !communityMobile ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.passportUrl}
                alt=""
                className="size-9 rounded-full object-cover ring-1 ring-mist/20"
              />
            ) : null}
            <button
              type="button"
              onClick={() => setMobileOpen((value) => !value)}
              className="relative inline-flex h-10 w-10 items-center justify-center border border-mist/20 bg-mist/[0.04] sm:h-11 sm:w-11"
              aria-expanded={mobileOpen}
              aria-controls="student-sidebar"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              <MenuIcon open={mobileOpen} />
              {unread > 0 ? (
                <span
                  className="absolute right-1.5 top-1.5 h-2 w-2 bg-celadon"
                  aria-hidden
                />
              ) : null}
            </button>
          </div>
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
        id="student-sidebar"
        className={`grain isolate fixed inset-y-0 left-0 z-50 flex h-svh max-h-svh w-[min(20rem,88vw)] flex-col overflow-hidden bg-pine text-mist shadow-[8px_0_40px_-12px_rgba(20,53,44,0.55)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:z-40 lg:border-r lg:border-mist/10 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          desktopOpen
            ? "lg:w-72 lg:translate-x-0"
            : "lg:pointer-events-none lg:w-0 lg:translate-x-0 lg:border-0"
        }`}
        aria-hidden={desktopOpen || mobileOpen ? undefined : true}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(95_143_122/0.32),transparent_52%),linear-gradient(180deg,transparent_35%,rgb(8_22_18/0.5)_100%)]"
          aria-hidden
        />

        <div
          className={`relative border-b border-mist/10 px-6 pb-6 pt-8 ${
            desktopOpen ? "" : "lg:invisible"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <Link href="/student#overview" className="flex min-w-0 items-center gap-3">
              <Image
                src="/logo.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-mist/45">
                  Student portal
                </p>
                <p className="mt-1 font-display text-2xl leading-none">
                  My Journey
                </p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setDesktopOpen(false)}
              className="mt-1 hidden h-9 w-9 shrink-0 items-center justify-center border border-mist/20 bg-mist/[0.04] text-mist/80 hover:border-mist/45 lg:inline-flex"
              aria-label="Hide sidebar"
            >
              <PanelIcon collapsed={false} />
            </button>
          </div>
        </div>

        <nav
          className={`relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4 ${
            desktopOpen ? "" : "lg:invisible"
          }`}
        >
          {nav.map((entry, index) => {
            if (entry.kind === "link") {
              const active = studentNavMatches(
                entry.href,
                entry.id,
                pathname,
                activeSection,
              );
              const Icon = entry.icon;
              return (
                <Link
                  key={entry.id}
                  href={entry.href}
                  prefetch={false}
                  data-tour={`student-nav-${entry.id}`}
                  onClick={(event) => onNavClick(event, entry)}
                  tabIndex={desktopOpen ? undefined : -1}
                  className={`group relative flex animate-slide-in-left items-start gap-3 px-3 py-3.5 transition-colors duration-300 ${
                    active
                      ? "bg-mist/[0.09] text-mist"
                      : "text-mist/65 hover:bg-mist/[0.05] hover:text-mist"
                  }`}
                  style={{ animationDelay: `${80 + index * 60}ms` }}
                >
                  <span
                    className={`absolute inset-y-2 left-0 w-0.5 bg-celadon ${
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                    }`}
                    aria-hidden
                  />
                  <Icon
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      active
                        ? "text-celadon"
                        : "text-mist/50 group-hover:text-mist/80"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium tracking-wide">
                      {entry.label}
                    </span>
                    <span
                      className={`mt-0.5 block text-xs ${
                        active ? "text-mist/55" : "text-mist/40"
                      }`}
                    >
                      {entry.hint}
                    </span>
                  </span>
                </Link>
              );
            }

            const Icon = entry.icon;
            const open = openGroupId === entry.id;
            const groupActive = groupContainsStudentPath(
              entry,
              pathname,
              activeSection,
            );
            const groupBadge =
              entry.id === "reach" && unread > 0
                ? unread > 99
                  ? "99+"
                  : String(unread)
                : null;

            return (
              <div
                key={entry.id}
                className="animate-slide-in-left"
                style={{ animationDelay: `${80 + index * 60}ms` }}
              >
                <button
                  type="button"
                  data-tour={`student-nav-${entry.id}`}
                  onClick={() => toggleGroup(entry.id)}
                  tabIndex={desktopOpen ? undefined : -1}
                  aria-expanded={open}
                  className={`group relative flex w-full items-start gap-3 px-3 py-3.5 text-left transition-colors duration-300 ${
                    groupActive
                      ? "bg-mist/[0.07] text-mist"
                      : "text-mist/65 hover:bg-mist/[0.05] hover:text-mist"
                  }`}
                >
                  <span
                    className={`absolute inset-y-2 left-0 w-0.5 bg-celadon transition-opacity duration-300 ${
                      groupActive
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-40"
                    }`}
                    aria-hidden
                  />
                  <Icon
                    className={`mt-0.5 h-5 w-5 shrink-0 transition-colors ${
                      groupActive
                        ? "text-celadon"
                        : "text-mist/50 group-hover:text-mist/80"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block text-sm font-medium tracking-wide">
                        {entry.label}
                      </span>
                      {groupBadge ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center bg-celadon px-1.5 text-[0.65rem] font-semibold tabular-nums text-pine">
                          {groupBadge}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`mt-0.5 block text-xs ${
                        groupActive ? "text-mist/55" : "text-mist/40"
                      }`}
                    >
                      {entry.hint}
                    </span>
                  </span>
                  <span className="mt-1 shrink-0 text-mist/45">
                    <ChevronIcon open={open} />
                  </span>
                </button>

                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="mb-1 ml-3 space-y-0.5 border-l border-mist/15 py-1 pl-3">
                      {entry.children.map((child) => {
                        const active = isChildActive(child);
                        const showSupportBadge =
                          child.id === "support" && unread > 0;
                        return (
                          <Link
                            key={child.id}
                            href={child.href}
                            prefetch={false}
                            onClick={(event) => onNavClick(event, child)}
                            tabIndex={desktopOpen && open ? undefined : -1}
                            className={`group/child relative flex items-start gap-2 px-2.5 py-2.5 transition-colors duration-300 ${
                              active
                                ? "bg-mist/[0.09] text-mist"
                                : "text-mist/60 hover:bg-mist/[0.05] hover:text-mist"
                            }`}
                          >
                            <span
                              className={`mt-2 h-1 w-1 shrink-0 rounded-full transition-colors ${
                                active
                                  ? "bg-celadon"
                                  : "bg-mist/30 group-hover/child:bg-mist/55"
                              }`}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="block text-[0.8125rem] font-medium tracking-wide">
                                  {child.label}
                                </span>
                                {showSupportBadge ? (
                                  <span
                                    className="inline-flex min-w-[1.25rem] items-center justify-center bg-celadon/90 px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums text-pine"
                                    aria-label={`${unread} unread support messages`}
                                  >
                                    {unread > 99 ? "99+" : unread}
                                  </span>
                                ) : null}
                              </span>
                              <span
                                className={`mt-0.5 block text-[0.7rem] ${
                                  active ? "text-mist/55" : "text-mist/35"
                                }`}
                              >
                                {child.hint}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div
          className={`relative mt-auto shrink-0 border-t border-mist/10 px-5 py-5 ${
            desktopOpen ? "" : "lg:invisible"
          }`}
        >
          <div className="flex items-center gap-3">
            {profile.passportUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.passportUrl}
                alt=""
                className="size-10 shrink-0 object-cover"
              />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center bg-mist/10 font-display text-lg text-celadon">
                {profile.first_name.slice(0, 1)}
                {profile.last_name.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-mist">{name}</p>
              <p className="mt-0.5 truncate text-xs text-mist/45">
                {profile.email}
              </p>
            </div>
          </div>
          <Link
            href="/student/account"
            className="mt-4 block w-full border border-mist/20 px-4 py-2.5 text-center text-sm font-medium text-mist/75 transition-colors hover:border-mist/45 hover:bg-mist/[0.06] hover:text-mist"
          >
            Account settings
          </Link>
          <form action={signOutStudent} className="mt-2">
            <button
              type="submit"
              className="w-full border border-mist/20 px-4 py-2.5 text-sm font-medium text-mist/75 transition-colors hover:border-mist/45 hover:bg-mist/[0.06] hover:text-mist"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div
        className={`relative flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          desktopOpen ? "lg:pl-72" : "lg:pl-0"
        } ${
          communityMobile
            ? "max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-hidden"
            : ""
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
                My Journey <span className="mx-2 text-stone">/</span>
                <span className="text-celadon">{currentSection}</span>
              </p>
              <p className="mt-1 font-display text-xl leading-none text-pine">
                School of Disciples
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-pine">{name}</p>
              <p className="mt-0.5 text-xs text-ink/45">Student account</p>
            </div>
            {profile.passportUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.passportUrl}
                alt=""
                className="size-11 shrink-0 rounded-full object-cover ring-1 ring-pine/15"
              />
            ) : (
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-pine/10 font-display text-sm text-pine"
                aria-hidden
              >
                {profile.first_name.slice(0, 1)}
                {profile.last_name.slice(0, 1)}
              </span>
            )}
          </div>
        </header>

        <main
          className={
            communityMobile
              ? "relative flex min-h-0 flex-1 flex-col overflow-hidden p-0 lg:overflow-visible lg:px-10 lg:py-10"
              : "relative flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
