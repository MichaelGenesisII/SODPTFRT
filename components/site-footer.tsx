import Image from "next/image";
import Link from "next/link";
import { contact, footerExplore, SOD_SITE } from "@/lib/site-nav";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-stone bg-pine text-mist">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-14 sm:px-10 lg:grid-cols-12 lg:px-12 lg:py-16">
        <div className="lg:col-span-5">
          <div className="flex items-center gap-4">
            <Image
              src="/logo.png"
              alt="Christ Redeemer's Ministries — Disciple"
              width={72}
              height={72}
              className="h-16 w-16 shrink-0 object-contain sm:h-[4.5rem] sm:w-[4.5rem]"
            />
            <p className="font-display text-3xl leading-tight tracking-[-0.02em]">
              School of Disciples
            </p>
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-mist/75">
            Started in 1985 and coordinated by Christ the Redeemer&apos;s
            Ministries — a school where Christians of all denominations learn
            how to become genuine disciples of Jesus Christ.
          </p>
          <a
            href={SOD_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link-footer mt-6 text-sm font-medium text-mist/90"
          >
            Visit schoolofdisciples.org
          </a>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:gap-8 lg:col-span-7 lg:gap-12">
          <div>
            <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-mist/55">
              Explore
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {footerExplore.map((item) => (
                <li key={item.href}>
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="nav-link-footer text-sm text-mist/80"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      href={item.href}
                      className="nav-link-footer text-sm text-mist/80"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-mist/55">
              Contact
            </h2>
            <address className="mt-4 not-italic text-sm leading-relaxed text-mist/80">
              {contact.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <p className="mt-4 text-sm">
              <a
                href={contact.phoneHref}
                className="nav-link-footer text-mist/80"
              >
                {contact.phone}
              </a>
            </p>
            <p className="mt-2 text-sm">
              <a
                href={contact.emailHref}
                className="nav-link-footer text-mist/80"
              >
                {contact.email}
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-mist/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-5 text-xs text-mist/50 sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-12">
          <p>© School of Disciples Portal</p>
          <p>Raising Disciples, Equipping The Local Church</p>
        </div>
      </div>
    </footer>
  );
}
