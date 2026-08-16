"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOutAdmin } from "@/app/admin/actions";
import {
  getDeskPulse,
  type DeskPulse,
} from "@/app/admin/tickets/pulse";
import {
  getPaymentsPulse,
  type PaymentsPulse,
} from "@/app/admin/payments/pulse";
import { AdminWelcome } from "@/components/admin/admin-welcome";
import { useToast } from "@/components/ui/toast";
import type { AdminProfile } from "@/lib/admin/profile";
import { isParishAdmin } from "@/lib/admin/profile";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const SIDEBAR_KEY = "sod-admin-sidebar-open";
const DESK_SEEN_KEY = "sod-desk-open-seen";
const DESK_SEEN_CHAT_KEY = "sod-desk-chat-seen";
// Realtime drives the badge; this is only a safety net if the socket drops.
const DESK_FALLBACK_POLL_MS = 120_000;
const DESK_BURST_MS = 400;

type NavIcon = (props: { className?: string }) => ReactNode;

type NavChild = {
  href: string;
  label: string;
  hint: string;
};

type NavLink = {
  kind: "link";
  href: string;
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
    href: "/admin",
    label: "Overview",
    hint: "Pulse of the portal",
    icon: OverviewIcon,
  },
  {
    kind: "group",
    id: "cohort",
    label: "Cohort",
    hint: "People & placement",
    icon: StudentsIcon,
    children: [
      {
        href: "/admin/students",
        label: "Students",
        hint: "Applications & seats",
      },
      {
        href: "/admin/payments",
        label: "Payments",
        hint: "Bank proofs",
      },
      {
        href: "/admin/parishes",
        label: "Parishes",
        hint: "Churches & batches",
      },
    ],
  },
  {
    kind: "group",
    id: "learning",
    label: "Learning",
    hint: "Classes & results",
    icon: ClassesIcon,
    children: [
      {
        href: "/admin/classes",
        label: "Classes",
        hint: "Zoom & attendance",
      },
      {
        href: "/admin/exams",
        label: "Exams",
        hint: "Compose & grade",
      },
      {
        href: "/admin/records",
        label: "Records",
        hint: "Scorecards",
      },
      {
        href: "/admin/gallery",
        label: "Gallery",
        hint: "Selfie moderation",
      },
    ],
  },
  {
    kind: "group",
    id: "reach",
    label: "Reach",
    hint: "Inbox & outbound",
    icon: CampaignsIcon,
    children: [
      {
        href: "/admin/tickets",
        label: "Desk",
        hint: "Support inbox",
      },
      {
        href: "/admin/announcements",
        label: "Notices",
        hint: "Home & student notices",
      },
      {
        href: "/admin/campaigns",
        label: "Campaigns",
        hint: "Email & marketing",
      },
    ],
  },
  {
    kind: "link",
    href: "/admin/access",
    label: "Access",
    hint: "Password & team",
    icon: AccessIcon,
  },
];

function pathMatches(href: string, pathname: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function findActiveNavLabel(pathname: string): string {
  for (const entry of nav) {
    if (entry.kind === "link" && pathMatches(entry.href, pathname)) {
      return entry.label;
    }
    if (entry.kind === "group") {
      const child = entry.children.find((c) => pathMatches(c.href, pathname));
      if (child) return child.label;
    }
  }
  return "Command";
}

function groupContainsPath(group: NavGroup, pathname: string) {
  return group.children.some((c) => pathMatches(c.href, pathname));
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

function StudentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19.5V8.75L12 4l8 4.75V19.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 12.5h7M8.5 16h4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 4v16"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function PaymentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="6"
        width="17"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3.5 10h17M8 14h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExamsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4.5h9l3 3V19.5H6V4.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 10h6M9 13.5h6M9 17h3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClassesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5h16v10H4V7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 12h.01M12 12h.01M16 12h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M9 17.5v2M15 17.5v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RecordsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5.5h16v13H4V5.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 9h8M8 12.5h8M8 16h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ParishesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20V10l8-6 8 6v10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 20v-6h6v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5h16v3.5H4V7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M6 11v8M18 11v8M4 19h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9 5.5 12 3l3 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NoticesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7.5h11.5a2 2 0 0 1 2 2V18H7a2 2 0 0 1-2-2V7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7 7.5V5.75A1.75 1.75 0 0 1 8.75 4h7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9 11.5h7M9 14.5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CampaignsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5h16v10.5H4V7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m4 8 8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="5"
        y="11"
        width="14"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 11V8a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 16.5 18.5 12 14 7.5M18.5 12H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
      {open ? (
        <path
          d="M6 6l12 12M18 6 6 18"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M4 7h16M4 12h12M4 17h16"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      {collapsed ? (
        <path
          d="M4 6h16M4 12h10M4 18h16M15 9l4 3-4 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M4 6h16M4 12h10M4 18h16M19 9l-4 3 4 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
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

function ProfileMenu({
  profile,
  mobile = false,
}: {
  profile: AdminProfile;
  mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = profile.full_name || profile.email;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={menuRef}
      className="relative"
      onMouseEnter={mobile ? undefined : () => setOpen(true)}
      onMouseLeave={mobile ? undefined : () => setOpen(false)}
    >
      <button
        type="button"
        onClick={() =>
          mobile ? setOpen((value) => !value) : setOpen(true)
        }
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Open profile menu for ${displayName}`}
        className={`group flex items-center transition-colors ${
          mobile
            ? "h-11 gap-1.5 border border-mist/20 bg-mist/[0.04] px-1.5 text-mist hover:border-mist/45"
            : "gap-3 border border-stone bg-white/55 py-1.5 pl-1.5 pr-3 text-ink hover:border-pine/30 hover:bg-white/80"
        }`}
      >
        <span
          className={`relative shrink-0 overflow-hidden rounded-full ${
            mobile ? "h-8 w-8" : "h-9 w-9"
          }`}
        >
          <Image
            src="/lion.png"
            alt=""
            fill
            sizes={mobile ? "32px" : "36px"}
            className="object-cover"
          />
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-mist bg-celadon"
            aria-hidden
          />
        </span>

        {!mobile ? (
          <span className="min-w-0 text-left">
            <span className="block max-w-36 truncate text-sm font-medium text-ink">
              {displayName}
            </span>
            <span className="mt-0.5 block text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon">
              {profile.role === "master"
                ? "Master admin"
                : isParishAdmin(profile)
                  ? "Parish admin"
                  : "National admin"}
            </span>
          </span>
        ) : null}
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          role="menu"
          className={`animate-disclose absolute right-0 z-[70] mt-0 w-[min(18rem,calc(100vw-2rem))] border border-stone bg-mist text-ink shadow-[0_18px_55px_-18px_rgba(20,53,44,0.45)] ${
            mobile ? "" : "sm:w-72"
          }`}
        >
          <div className="relative overflow-hidden bg-pine px-4 py-4 text-mist">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(95,143,122,0.4),transparent_55%)]"
              aria-hidden
            />
            <div className="relative flex items-center gap-3">
              <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-celadon/45">
                <Image
                  src="/lion.png"
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-lg leading-tight">
                  {displayName}
                </p>
                <p className="mt-1 truncate text-xs text-mist/55">
                  {profile.email}
                </p>
              </div>
            </div>
          </div>

          <div className="p-1.5">
            <Link
              href="/admin/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="group flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors hover:bg-pine/5 hover:text-pine"
            >
              My account
              <span className="text-ink/30 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              href="/admin/access"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="group flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors hover:bg-pine/5 hover:text-pine"
            >
              Access &amp; security
              <span className="text-ink/30 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              href="/"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="group flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors hover:bg-pine/5 hover:text-pine"
            >
              View public site
              <span className="text-ink/30 transition-transform group-hover:translate-x-0.5">
                ↗
              </span>
            </Link>
          </div>

          <form action={signOutAdmin} className="border-t border-stone p-1.5">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-[#8c3b2f] transition-colors hover:bg-[#8c3b2f]/5"
            >
              Sign out
              <span aria-hidden>→</span>
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({
  profile,
  deskLabel,
  deskPulse: initialPulse,
  paymentsPulse: initialPaymentsPulse,
  children,
}: {
  profile: AdminProfile;
  deskLabel: string;
  deskPulse: DeskPulse;
  paymentsPulse: PaymentsPulse;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [deskPulse, setDeskPulse] = useState<DeskPulse>(initialPulse);
  const [paymentsPulse, setPaymentsPulse] =
    useState<PaymentsPulse>(initialPaymentsPulse);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  // Fresh server counts win over the last polled value.
  const [lastServerPulse, setLastServerPulse] = useState(initialPulse);
  if (lastServerPulse !== initialPulse) {
    setLastServerPulse(initialPulse);
    setDeskPulse(initialPulse);
  }
  const [lastPaymentsPulse, setLastPaymentsPulse] =
    useState(initialPaymentsPulse);
  if (lastPaymentsPulse !== initialPaymentsPulse) {
    setLastPaymentsPulse(initialPaymentsPulse);
    setPaymentsPulse(initialPaymentsPulse);
  }

  useEffect(() => {
    const match = nav.find(
      (entry) =>
        entry.kind === "group" && groupContainsPath(entry, pathname),
    );
    setOpenGroupId(match && match.kind === "group" ? match.id : null);
  }, [pathname]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(SIDEBAR_KEY);
      if (stored === "0") setDesktopOpen(false);
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SIDEBAR_KEY, desktopOpen ? "1" : "0");
  }, [desktopOpen, hydrated]);

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
    function notifyOpen(open: number) {
      const seenRaw = window.sessionStorage.getItem(DESK_SEEN_KEY);
      const seen = seenRaw === null ? -1 : Number(seenRaw);

      if (open <= 0) {
        window.sessionStorage.setItem(DESK_SEEN_KEY, "0");
        return;
      }

      if (open > seen) {
        toast({
          title: "Desk alert",
          message:
            open === 1
              ? "1 new note is waiting on the Listening Desk."
              : `${open} new notes are waiting on the Listening Desk.`,
          tone: "info",
          durationMs: 6500,
        });
        window.sessionStorage.setItem(DESK_SEEN_KEY, String(open));
      } else if (open < seen) {
        window.sessionStorage.setItem(DESK_SEEN_KEY, String(open));
      }
    }

    function notifyChat(
      chat: DeskPulse["latestChat"],
      { announce }: { announce: boolean },
    ) {
      if (!chat) return;

      // Always advance the watermark so our own outbound notes never toast later.
      const previous = window.sessionStorage.getItem(DESK_SEEN_CHAT_KEY);
      if (!announce || previous === null) {
        window.sessionStorage.setItem(DESK_SEEN_CHAT_KEY, chat.noteId);
        return;
      }
      if (previous === chat.noteId) return;
      window.sessionStorage.setItem(DESK_SEEN_CHAT_KEY, chat.noteId);

      // Receiver-only: admin is alerted for student messages, never their own.
      if (!chat.fromStudent) return;

      toast({
        title: "New chat message",
        message: `${chat.reference} · ${chat.preview}`,
        tone: "info",
        durationMs: 6500,
      });
    }

    notifyOpen(initialPulse.open);
    notifyChat(initialPulse.latestChat, { announce: false });

    let cancelled = false;
    let inFlight = false;
    let lastOpen = initialPulse.open;
    let lastChatId = initialPulse.latestChat?.noteId ?? null;
    let burstTimer = 0;

    async function refreshPulse() {
      if (cancelled || inFlight) return;
      if (document.visibilityState === "hidden") return;

      inFlight = true;
      try {
        const [next, nextPayments] = await Promise.all([
          getDeskPulse(),
          getPaymentsPulse(),
        ]);
        if (cancelled) return;
        setDeskPulse(next);
        setPaymentsPulse(nextPayments);
        notifyOpen(next.open);
        notifyChat(next.latestChat, { announce: true });
        const chatId = next.latestChat?.noteId ?? null;
        if (
          next.open > lastOpen ||
          (chatId &&
            chatId !== lastChatId &&
            next.latestChat?.fromStudent)
        ) {
          router.refresh();
        }
        lastOpen = next.open;
        lastChatId = chatId;
      } catch {
        // Keep last known pulse if the desk table is unavailable.
      } finally {
        inFlight = false;
      }
    }

    // A batch of row changes should settle into one fetch.
    function scheduleRefresh() {
      window.clearTimeout(burstTimer);
      burstTimer = window.setTimeout(() => void refreshPulse(), DESK_BURST_MS);
    }

    let supabase: ReturnType<typeof createBrowserSupabaseClient> | null = null;
    let channel: ReturnType<
      ReturnType<typeof createBrowserSupabaseClient>["channel"]
    > | null = null;

    try {
      supabase = createBrowserSupabaseClient();
      channel = supabase
        .channel("desk-pulse")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "support_tickets" },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "support_ticket_notes" },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "student_fee_payments" },
          scheduleRefresh,
        )
        .subscribe();
    } catch {
      // No Supabase env in the browser — the fallback poll still covers us.
    }

    const interval = window.setInterval(refreshPulse, DESK_FALLBACK_POLL_MS);
    const onWake = () => {
      if (document.visibilityState === "visible") void refreshPulse();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      cancelled = true;
      window.clearTimeout(burstTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  // Intentionally omit initialPulse — toast once on auth/mount, then subscribe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, router]);

  const unsettled = deskPulse.unsettled;
  const paymentsPending = paymentsPulse.pending;
  const badgeLabel = unsettled > 99 ? "99+" : String(unsettled);
  const paymentsBadgeLabel =
    paymentsPending > 99 ? "99+" : String(paymentsPending);
  const menuAlertCount = unsettled + paymentsPending;
  const menuAlertLabel =
    menuAlertCount > 99 ? "99+" : String(menuAlertCount);

  function isActive(href: string) {
    return pathMatches(href, pathname);
  }

  function isGroupOpen(group: NavGroup) {
    return openGroupId === group.id;
  }

  function toggleGroup(id: string) {
    setOpenGroupId((current) => (current === id ? null : id));
  }

  const currentSection = findActiveNavLabel(pathname);

  return (
    <div className="relative flex min-h-svh flex-col bg-mist text-ink lg:flex-row">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.12),_transparent_45%),radial-gradient(ellipse_at_bottom_left,_rgba(20,53,44,0.06),_transparent_40%)]"
        aria-hidden
      />

      {/* Mobile top bar */}
      <div className="grain relative isolate sticky top-0 z-40 border-b border-mist/10 bg-pine px-4 py-3 text-mist lg:hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(95_143_122/0.28),transparent_60%)]"
          aria-hidden
        />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-lg leading-none tracking-[-0.02em]">
                Command
              </p>
              <p className="mt-1 truncate text-[0.65rem] uppercase tracking-[0.14em] text-celadon">
                {profile.role === "master"
                  ? "Master"
                  : isParishAdmin(profile)
                    ? "Parish"
                    : "National"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ProfileMenu profile={profile} mobile />
            <button
              type="button"
              onClick={() => setMobileOpen((value) => !value)}
              className="relative inline-flex h-11 w-11 items-center justify-center border border-mist/20 bg-mist/[0.04] text-mist transition-colors hover:border-mist/45 hover:bg-mist/[0.08]"
              aria-expanded={mobileOpen}
              aria-controls="admin-sidebar"
              aria-label={
                mobileOpen
                  ? "Close menu"
                  : menuAlertCount > 0
                    ? `Open menu, ${menuAlertCount} alerts`
                    : "Open menu"
              }
            >
              <MenuIcon open={mobileOpen} />
              {menuAlertCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center bg-celadon px-1 text-[0.65rem] font-semibold tabular-nums leading-none text-pine">
                  {menuAlertLabel}
                </span>
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
        id="admin-sidebar"
        className={`grain isolate fixed inset-y-0 left-0 z-50 flex h-svh max-h-svh w-[min(20rem,88vw)] flex-col overflow-hidden bg-pine text-mist shadow-[8px_0_40px_-12px_rgba(20,53,44,0.55)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:z-40 lg:border-r lg:border-mist/10 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          desktopOpen
            ? "lg:w-72 lg:translate-x-0"
            : "lg:pointer-events-none lg:w-0 lg:translate-x-0 lg:border-0"
        }`}
        aria-hidden={desktopOpen || mobileOpen ? undefined : true}
      >
        {/* Full-height atmosphere */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(95_143_122/0.32),transparent_52%),radial-gradient(ellipse_at_bottom_right,rgb(20_53_44/0.9),transparent_55%),linear-gradient(180deg,rgb(20_53_44/0.35)_0%,transparent_28%,transparent_72%,rgb(8_22_18/0.55)_100%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-mist/15 via-mist/5 to-transparent"
          aria-hidden
        />

        <div
          className={`relative border-b border-mist/10 px-6 pb-6 pt-8 ${
            desktopOpen ? "" : "lg:invisible"
          }`}
        >
          <div className="hidden items-start justify-between gap-3 lg:flex">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src="/logo.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-mist/45">
                  Staff desk
                </p>
                <p className="mt-1 font-display text-2xl leading-none tracking-[-0.02em]">
                  Command
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDesktopOpen(false)}
              className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center border border-mist/20 bg-mist/[0.04] text-mist/80 transition-colors hover:border-mist/45 hover:bg-mist/[0.08] hover:text-mist"
              aria-label="Hide sidebar"
              title="Hide sidebar"
            >
              <PanelIcon collapsed={false} />
            </button>
          </div>

          {/* Mobile drawer brand (desktop brand is above) */}
          <div className="flex items-center gap-3 lg:hidden">
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-mist/45">
                Staff desk
              </p>
              <p className="mt-1 font-display text-xl leading-none tracking-[-0.02em]">
                Command
              </p>
            </div>
          </div>
        </div>

        <nav
          className={`relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden px-3 py-4 ${
            desktopOpen ? "" : "lg:invisible"
          }`}
        >
          {nav.map((entry, index) => {
            if (entry.kind === "link") {
              const active = isActive(entry.href);
              const Icon = entry.icon;
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={() => setMobileOpen(false)}
                  tabIndex={desktopOpen ? undefined : -1}
                  className={`group relative flex animate-slide-in-left items-start gap-3 px-3 py-3.5 transition-colors duration-300 ${
                    active
                      ? "bg-mist/[0.09] text-mist"
                      : "text-mist/65 hover:bg-mist/[0.05] hover:text-mist"
                  }`}
                  style={{ animationDelay: `${80 + index * 60}ms` }}
                >
                  <span
                    className={`absolute inset-y-2 left-0 w-0.5 bg-celadon transition-opacity duration-300 ${
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                    }`}
                    aria-hidden
                  />
                  <span className="relative mt-0.5 shrink-0">
                    <Icon
                      className={`h-5 w-5 transition-colors ${
                        active
                          ? "text-celadon"
                          : "text-mist/50 group-hover:text-mist/80"
                      }`}
                    />
                  </span>
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
            const open = isGroupOpen(entry);
            const groupActive = groupContainsPath(entry, pathname);
            const groupBadge =
              entry.id === "cohort" && paymentsPending > 0
                ? paymentsBadgeLabel
                : entry.id === "reach" && unsettled > 0
                  ? badgeLabel
                  : null;

            return (
              <div
                key={entry.id}
                className="animate-slide-in-left"
                style={{ animationDelay: `${80 + index * 60}ms` }}
              >
                <button
                  type="button"
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
                  <span className="relative mt-0.5 shrink-0">
                    <Icon
                      className={`h-5 w-5 transition-colors ${
                        groupActive
                          ? "text-celadon"
                          : "text-mist/50 group-hover:text-mist/80"
                      }`}
                    />
                  </span>
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
                        const active = isActive(child.href);
                        const showDeskBadge =
                          child.href === "/admin/tickets" && unsettled > 0;
                        const showPaymentsBadge =
                          child.href === "/admin/payments" &&
                          paymentsPending > 0;
                        const showBadge = showDeskBadge || showPaymentsBadge;
                        const itemBadgeLabel = showPaymentsBadge
                          ? paymentsBadgeLabel
                          : badgeLabel;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setMobileOpen(false)}
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
                                {showBadge ? (
                                  <span className="inline-flex h-5 min-w-5 items-center justify-center bg-celadon px-1.5 text-[0.65rem] font-semibold tabular-nums text-pine">
                                    {itemBadgeLabel}
                                    <span className="sr-only">
                                      {showPaymentsBadge
                                        ? " unresolved proofs"
                                        : " unsettled tickets"}
                                    </span>
                                  </span>
                                ) : null}
                              </span>
                              <span
                                className={`mt-0.5 block text-[0.7rem] ${
                                  active ? "text-mist/55" : "text-mist/35"
                                }`}
                              >
                                {showDeskBadge
                                  ? deskPulse.open > 0
                                    ? `${deskPulse.open} new in inbox`
                                    : "Notes still on the path"
                                  : showPaymentsBadge
                                    ? `${paymentsPending} proof${paymentsPending === 1 ? "" : "s"} to review`
                                    : child.hint}
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
          className={`relative mt-auto shrink-0 border-t border-mist/10 px-3 py-3 ${
            desktopOpen ? "" : "lg:invisible"
          }`}
        >
          <form action={signOutAdmin}>
            <button
              type="submit"
              tabIndex={desktopOpen ? undefined : -1}
              className="group flex w-full items-center gap-3 px-3 py-3 text-left text-mist/70 transition-colors hover:bg-mist/[0.06] hover:text-mist"
            >
              <LogoutIcon className="h-5 w-5 shrink-0 text-mist/45 transition-colors group-hover:text-mist/80" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium tracking-wide">
                  Log out
                </span>
                <span className="mt-0.5 block text-xs text-mist/40 group-hover:text-mist/50">
                  End this desk session
                </span>
              </span>
            </button>
          </form>
        </div>
      </aside>

      <div
        className={`relative flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          desktopOpen ? "lg:pl-72" : "lg:pl-0"
        }`}
      >
        <header className="sticky top-0 z-30 hidden h-[4.75rem] items-center justify-between gap-4 border-b border-stone/80 bg-mist/90 px-6 backdrop-blur-xl lg:flex lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            {!desktopOpen ? (
              <button
                type="button"
                onClick={() => setDesktopOpen(true)}
                className="inline-flex h-10 items-center gap-2 border border-pine/25 bg-mist px-3 text-sm font-medium text-pine transition-colors hover:border-pine hover:bg-white/40"
                aria-label="Show sidebar"
                title="Show sidebar"
              >
                <PanelIcon collapsed />
                Menu
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-ink/40">
                Command
                <span className="text-stone" aria-hidden>
                  /
                </span>
                <span className="text-celadon">{currentSection}</span>
              </p>
              <p className="mt-1 font-display text-xl leading-none tracking-[-0.02em] text-pine">
                School of Disciples
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {paymentsPending > 0 ? (
              <Link
                href="/admin/payments"
                className="group inline-flex h-12 items-center gap-2 border border-stone bg-white/45 px-3 text-sm text-ink/60 transition-colors hover:border-pine/30 hover:text-pine"
              >
                <span>Payments</span>
                <span className="inline-flex h-5 min-w-5 items-center justify-center bg-pine px-1.5 text-[0.65rem] font-semibold tabular-nums text-mist">
                  {paymentsBadgeLabel}
                </span>
              </Link>
            ) : null}
            {unsettled > 0 ? (
              <Link
                href="/admin/tickets"
                className="group inline-flex h-12 items-center gap-2 border border-stone bg-white/45 px-3 text-sm text-ink/60 transition-colors hover:border-pine/30 hover:text-pine"
              >
                <span className="relative">
                  Desk
                  {deskPulse.open > 0 ? (
                    <span
                      className="absolute -right-2.5 -top-1 h-1.5 w-1.5 rounded-full bg-celadon animate-pulse-soft"
                      aria-hidden
                    />
                  ) : null}
                </span>
                <span className="inline-flex h-5 min-w-5 items-center justify-center bg-pine px-1.5 text-[0.65rem] font-semibold tabular-nums text-mist">
                  {badgeLabel}
                </span>
              </Link>
            ) : null}
            <ProfileMenu profile={profile} />
          </div>
        </header>
        <div className="relative flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {children}
        </div>
      </div>

      <Suspense fallback={null}>
        <AdminWelcome profile={profile} deskLabel={deskLabel} />
      </Suspense>
    </div>
  );
}
