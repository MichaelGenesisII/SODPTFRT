"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type AdminEntryLinkProps = {
  className?: string;
  /** Label when the visitor is not an active admin */
  guestLabel?: string;
  /** Label when an active admin session is detected */
  memberLabel?: string;
  children?: ReactNode;
};

type EntryState = {
  href: "/admin" | "/login/admin";
  label: string;
  ready: boolean;
  signedIn: boolean;
};

/**
 * Public-site gate to the admin desk.
 * Guests go to sign-in; an active admin session opens the dashboard directly.
 */
export function AdminEntryLink({
  className,
  guestLabel = "Enter as Admin",
  memberLabel = "Open your desk",
  children,
}: AdminEntryLinkProps) {
  const [entry, setEntry] = useState<EntryState>({
    href: "/login/admin",
    label: guestLabel,
    ready: false,
    signedIn: false,
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();

    async function resolveEntry() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (
          authError &&
          /refresh_token|session not found/i.test(
            `${authError.code ?? ""} ${authError.message ?? ""}`,
          )
        ) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        }

        if (!user) {
          if (!cancelled) {
            setEntry({
              href: "/login/admin",
              label: guestLabel,
              ready: true,
              signedIn: false,
            });
          }
          return;
        }

        const { data: profile } = await supabase
          .from("admin_profiles")
          .select("is_active")
          .eq("id", user.id)
          .maybeSingle();

        if (!cancelled) {
          if (profile?.is_active) {
            setEntry({
              href: "/admin",
              label: memberLabel,
              ready: true,
              signedIn: true,
            });
          } else {
            setEntry({
              href: "/login/admin",
              label: guestLabel,
              ready: true,
              signedIn: false,
            });
          }
        }
      } catch {
        if (!cancelled) {
          setEntry({
            href: "/login/admin",
            label: guestLabel,
            ready: true,
            signedIn: false,
          });
        }
      }
    }

    void resolveEntry();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void resolveEntry();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [guestLabel, memberLabel]);

  return (
    <Link
      href={entry.href}
      className={className}
      aria-label={entry.label}
      data-admin-session={entry.signedIn ? "active" : "guest"}
    >
      {children ?? (
        <span className="inline-flex items-center gap-2">
          {entry.signedIn ? (
            <span
              className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-celadon"
              aria-hidden
            />
          ) : null}
          <span
            className={
              entry.ready
                ? "transition-opacity duration-300"
                : "opacity-80 transition-opacity duration-300"
            }
          >
            {entry.label}
          </span>
        </span>
      )}
    </Link>
  );
}
