import type { Metadata } from "next";
import { SupportForm } from "@/components/support/support-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionStudent, studentDisplayName } from "@/lib/student/auth";
import { contact } from "@/lib/site-nav";

export const metadata: Metadata = {
  title: "Support | School of Disciples Portal",
  description:
    "Get support from the School of Disciples team in Belfast — enrolment, portal, and general enquiries.",
};

const paths = [
  {
    label: "Visit",
    detail: contact.addressLines.join(", "),
  },
  {
    label: "Call",
    detail: contact.phone,
    href: contact.phoneHref,
  },
  {
    label: "Email",
    detail: contact.email,
    href: contact.emailHref,
  },
] as const;

export default async function SupportPage() {
  const student = await getSessionStudent();
  const prefill = student
    ? {
        name: studentDisplayName(student),
        email: student.email,
        signedInStudent: true,
      }
    : undefined;

  return (
    <div className="flex min-h-full flex-col bg-mist text-ink">
      <SiteHeader />

      <main className="relative flex-1 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.16),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(20,53,44,0.06),_transparent_45%)]"
          aria-hidden
        />

        <section className="relative border-b border-stone">
          <div className="mx-auto max-w-6xl px-6 pb-14 pt-12 sm:px-10 sm:pb-16 sm:pt-16 lg:px-12">
            <p className="animate-fade-rise text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
              Support
            </p>
            <h1 className="animate-fade-rise-delay-1 mt-4 max-w-2xl font-display text-[clamp(2.35rem,6vw,3.75rem)] leading-[0.95] tracking-[-0.02em] text-pine">
              School of Disciples
            </h1>
            <p className="animate-fade-rise-delay-2 mt-5 max-w-lg text-base leading-relaxed text-ink/70 sm:text-lg">
              Questions about enrolment, payments, or the student portal? Reach
              the School of Disciples team — we&apos;re here to help.
            </p>
            <div
              className="animate-draw-line mt-8 h-px w-28 bg-celadon"
              aria-hidden
            />
          </div>
        </section>

        <section className="relative mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16 lg:grid lg:grid-cols-12 lg:gap-14 lg:px-12 lg:py-20">
          <aside className="animate-fade-rise lg:col-span-5">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-ink/45">
              Ways to reach us
            </p>
            <ul className="mt-8 space-y-8">
              {paths.map((item, index) => (
                <li key={item.label} className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span
                      className="font-display text-2xl tabular-nums text-celadon/80"
                      aria-hidden
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-pine">
                      {item.label}
                    </p>
                  </div>
                  {"href" in item && item.href ? (
                    <a
                      href={item.href}
                      className="mt-2 block pl-11 text-base leading-relaxed text-ink/75 transition-colors hover:text-pine"
                    >
                      {item.detail}
                    </a>
                  ) : (
                    <p className="mt-2 pl-11 text-base leading-relaxed text-ink/75">
                      {item.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-12 border-t border-stone pt-8">
              <p className="font-display text-xl tracking-[-0.02em] text-pine">
                Belfast office
              </p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink/60">
                We read every message with care. For urgent enrolment questions,
                include your full name and preferred programme in the note.
              </p>
            </div>
          </aside>

          <div className="animate-fade-rise-delay-1 mt-12 lg:col-span-7 lg:mt-0">
            <div className="border border-stone bg-mist/70 px-5 py-7 sm:px-8 sm:py-9">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                Write to us
              </p>
              <h2 className="mt-2 font-display text-2xl tracking-[-0.02em] text-pine sm:text-3xl">
                Send a note
              </h2>
              <p className="mt-2 text-sm text-ink/60">
                Choose a topic, then leave your message. You&apos;ll receive a
                desk reference when it arrives.
              </p>
              <div className="mt-8">
                <SupportForm prefill={prefill} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
