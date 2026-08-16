"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { enrolHref, primaryNav, type NavItem } from "@/lib/site-nav";

function ExternalOrLocal({
  item,
  className,
  onNavigate,
}: {
  item: NavItem;
  className?: string;
  onNavigate?: () => void;
}) {
  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={onNavigate}
      >
        {item.label}
      </a>
    );
  }

  return (
    <Link href={item.href} className={className} onClick={onNavigate}>
      {item.label}
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && headerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const linkClass =
    "nav-link-header text-[0.8125rem] font-medium tracking-wide text-ink/70";

  const mobileLinkClass =
    "nav-link-header w-fit font-display text-xl text-pine";

  return (
    <>
      {open ? (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-ink/25 xl:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <header
        ref={headerRef}
        className="sticky top-0 z-50 border-b border-stone/80 bg-mist/90 backdrop-blur-md"
      >
        <div className="relative mx-auto max-w-6xl px-6 sm:px-10 lg:px-12">
          <div className="flex items-center justify-between gap-4 py-4">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Christ Redeemer's Ministries — Disciple"
                width={48}
                height={48}
                className="h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12"
                priority
              />
              <span className="font-display text-lg leading-none tracking-[-0.02em] text-pine sm:text-xl">
                School of Disciples
                <span className="mt-1 block font-sans text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
                  Portal
                </span>
              </span>
            </Link>

            <nav
              className="hidden items-center gap-x-10 xl:flex"
              aria-label="Primary"
            >
              {primaryNav.map((item) => (
                <ExternalOrLocal
                  key={item.href}
                  item={item}
                  className={linkClass}
                />
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Link
                href={enrolHref}
                className="hidden bg-pine px-4 py-2 text-[0.8125rem] font-medium tracking-wide text-mist transition-colors duration-300 hover:bg-celadon sm:inline-flex"
              >
                Enrol Now
              </Link>

              <button
                type="button"
                className="inline-flex items-center justify-center border border-pine/25 px-3 py-2 text-[0.8125rem] font-medium text-pine transition-colors duration-300 hover:border-pine hover:bg-stone/40 xl:hidden"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? "Close" : "Menu"}
              </button>
            </div>
          </div>

          {open ? (
            <div
              id={menuId}
              className="absolute left-0 right-0 top-full z-50 border border-t-0 border-stone bg-mist px-6 py-6 shadow-lg sm:px-10 xl:hidden"
            >
              <nav className="flex flex-col gap-4" aria-label="Mobile">
                {primaryNav.map((item) => (
                  <div key={item.href} className="flex flex-col gap-2">
                    <ExternalOrLocal
                      item={item}
                      className={mobileLinkClass}
                      onNavigate={() => setOpen(false)}
                    />
                    {item.children?.map((child) => (
                      <ExternalOrLocal
                        key={child.href}
                        item={child}
                        className="nav-link-header w-fit pl-3 text-sm text-ink/65"
                        onNavigate={() => setOpen(false)}
                      />
                    ))}
                  </div>
                ))}
                <Link
                  href={enrolHref}
                  className="mt-2 inline-flex w-fit bg-pine px-4 py-2.5 text-sm font-medium text-mist"
                  onClick={() => setOpen(false)}
                >
                  Enrol Now
                </Link>
              </nav>
            </div>
          ) : null}
        </div>
      </header>
    </>
  );
}
