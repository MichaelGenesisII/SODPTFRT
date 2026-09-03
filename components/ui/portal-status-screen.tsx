import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export const portalStatusPrimaryClass =
  "inline-flex items-center justify-center bg-pine px-7 py-3.5 text-[0.95rem] font-medium tracking-wide text-mist transition-[background-color] duration-300 hover:bg-celadon focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

export const portalStatusSecondaryClass =
  "inline-flex items-center justify-center border border-pine/35 bg-mist/55 px-7 py-3.5 text-[0.95rem] font-medium tracking-wide text-pine transition-[background-color,border-color] duration-300 hover:border-pine hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

export function PortalStatusScreen({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate flex flex-1 flex-col overflow-hidden bg-mist text-ink">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.16),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(20,53,44,0.06),_transparent_45%)]"
        aria-hidden
      />
      <div className="grain relative flex flex-1 flex-col">
        <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16 sm:px-10 sm:py-20">
          <Link href="/" className="animate-fade-rise flex items-center gap-3">
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

          <p className="animate-fade-rise-delay-1 mt-10 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
            {eyebrow}
          </p>
          <h1 className="animate-fade-rise-delay-2 mt-3 font-display text-[clamp(2rem,5vw,3.15rem)] leading-[1.05] tracking-[-0.02em] text-pine">
            {title}
          </h1>
          <p className="animate-fade-rise-delay-3 mt-4 max-w-md text-base leading-relaxed text-ink/70 sm:text-lg">
            {body}
          </p>
          <div
            className="animate-draw-line mt-8 h-px w-28 bg-celadon"
            aria-hidden
          />
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PortalNotFoundView({
  homeHref,
  homeLabel,
  secondaryHref = "/support",
  secondaryLabel = "Support",
}: {
  homeHref: string;
  homeLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <PortalStatusScreen
      eyebrow="Page not found"
      title="This path isn’t here."
      body="The page you requested doesn’t exist, or it may have moved. Head back, or reach Support if you expected to find something here."
    >
      <Link href={homeHref} className={portalStatusPrimaryClass}>
        {homeLabel}
      </Link>
      <Link href={secondaryHref} className={portalStatusSecondaryClass}>
        {secondaryLabel}
      </Link>
    </PortalStatusScreen>
  );
}
