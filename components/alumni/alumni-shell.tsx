"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutStudent } from "@/app/student/actions";
import {
  studentDisplayName,
  type StudentProfile,
} from "@/lib/student/types";

const nav = [
  { href: "/alumni", label: "Overview" },
  { href: "/alumni/payments", label: "Payments" },
  { href: "/alumni/records", label: "Records" },
];

export function AlumniShell({
  profile,
  children,
}: {
  profile: StudentProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-full bg-mist text-ink">
      <header className="border-b border-stone/80 bg-white/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
              Alumni portal
            </p>
            <p className="font-display text-lg text-pine">
              {studentDisplayName(profile)}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {nav.map((item) => {
              const active =
                item.href === "/alumni"
                  ? pathname === "/alumni"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`px-3 py-2 text-sm ${
                    active
                      ? "bg-pine text-mist"
                      : "border border-pine/20 text-pine hover:border-pine"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => signOutStudent()}
              className="px-3 py-2 text-sm text-ink/60 underline"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
