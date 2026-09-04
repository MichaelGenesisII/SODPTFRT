"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { enrolHref, loginNav, primaryNav, type NavItem } from "@/lib/site-nav";

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

function DesktopNavDropdown({
  item,
  linkClass,
  align = "left",
}: {
  item: NavItem;
  linkClass: string;
  align?: "left" | "right";
}) {
  const children = item.children ?? [];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  if (!children.length) {
    return <ExternalOrLocal item={item} className={linkClass} />;
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`${linkClass} inline-flex items-center gap-1`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {item.label}
        <svg
          viewBox="0 0 12 12"
          className={`size-3 opacity-60 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          className={`absolute top-full z-50 min-w-[10.5rem] pt-2 ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="menu"
        >
          <div className="border border-stone/80 bg-mist py-1 shadow-lg">
            {children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-[0.8125rem] font-medium tracking-wide text-ink/75 transition-colors hover:bg-stone/50 hover:text-pine"
              >
                {child.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileLoginLinks({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  const children = loginNav.children ?? [];
  if (!children.length) return null;

  return (
    <div className="border-t border-stone pt-4">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
        Sign in
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {children.map((child) => (
          <Link
            key={child.href}
            href={child.href}
            onClick={onNavigate}
            className="flex min-h-11 items-center justify-center border border-pine/20 bg-white/40 px-2 py-2.5 text-center text-[0.8125rem] font-medium leading-tight text-pine transition-colors hover:border-pine hover:bg-stone/40"
          >
            {child.label}
          </Link>
        ))}
      </div>
    </div>
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

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden xl:block">
                <DesktopNavDropdown
                  item={loginNav}
                  linkClass={linkClass}
                  align="right"
                />
              </div>
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
                  <ExternalOrLocal
                    key={item.href}
                    item={item}
                    className={mobileLinkClass}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
                <MobileLoginLinks onNavigate={() => setOpen(false)} />
                <Link
                  href={enrolHref}
                  className="inline-flex w-full items-center justify-center bg-pine px-4 py-3 text-sm font-medium text-mist"
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
