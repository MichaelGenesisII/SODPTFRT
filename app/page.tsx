import Image from "next/image";
import Link from "next/link";
import { AnnouncementsSection } from "@/components/announcements";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { enrolHref } from "@/lib/site-nav";

/** Refresh home periodically so admin announcements from Supabase stay current. */
export const revalidate = 60;

const HERO_IMAGE = "/hero.jpg";

const heroSecondaryClass =
  "inline-flex items-center justify-center border border-pine/35 bg-mist/55 px-7 py-3.5 text-[0.95rem] font-medium tracking-wide text-pine backdrop-blur-sm transition-[background-color,border-color] duration-300 hover:border-pine hover:bg-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-mist text-ink">
      <SiteHeader />

      <section className="grain relative isolate flex min-h-[min(52svh,30rem)] flex-col overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src={HERO_IMAGE}
            alt="A quiet forest path in soft morning light"
            fill
            priority
            sizes="100vw"
            className="animate-ken-burns object-cover object-center"
          />
          <div
            className="absolute inset-0 bg-gradient-to-r from-mist via-mist/88 to-mist/25"
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-mist via-transparent to-mist/40"
            aria-hidden
          />
        </div>

        <div
          className="relative z-10 flex flex-1 flex-col justify-start px-6 pb-14 sm:px-10 sm:pb-16 lg:px-12 lg:pb-20"
          style={{ paddingTop: "var(--hero-content-pt)" }}
        >
          <div className="mx-auto w-full max-w-6xl">
            <h1 className="animate-fade-rise max-w-xl font-display text-[clamp(2rem,4.5vw,3.35rem)] leading-[1.1] tracking-[-0.015em] text-ink">
              Continue the journey.
            </h1>
            <p className="animate-fade-rise-delay-2 mt-4 max-w-md text-lg leading-relaxed text-ink/75 sm:text-xl">
              A quiet place for students and leaders to walk the course
              together.
            </p>

            <div className="animate-fade-rise-delay-3 mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <Link
                href={enrolHref}
                className="inline-flex items-center justify-center bg-pine px-7 py-3.5 text-[0.95rem] font-medium tracking-wide text-mist transition-[background-color] duration-300 hover:bg-celadon focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              >
                Enrol Now
              </Link>
              <Link href="/login/student" className={heroSecondaryClass}>
                Enter as Student
              </Link>
            </div>
          </div>
        </div>
      </section>

      <AnnouncementsSection />

      <SiteFooter />
    </div>
  );
}
