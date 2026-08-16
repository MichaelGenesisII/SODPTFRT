"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestEnrolmentPasswordReset } from "@/app/enrol/actions";
import { useToast } from "@/components/ui/toast";
import { contact, supportHref } from "@/lib/site-nav";

type EnrolAlreadyAppliedProps = {
  email: string;
  firstName?: string;
  onDismiss?: () => void;
};

export function EnrolAlreadyApplied({
  email,
  firstName,
  onDismiss,
}: EnrolAlreadyAppliedProps) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [resetSent, setResetSent] = useState(false);

  function sendReset() {
    startTransition(async () => {
      const result = await requestEnrolmentPasswordReset(email);
      if (!result.ok) {
        error(result.message, "Could not send reset");
        return;
      }
      setResetSent(true);
      success(result.message, "Check your inbox");
    });
  }

  return (
    <div className="animate-fade-rise border border-stone bg-mist">
      <div className="relative overflow-hidden border-b border-stone px-5 py-8 sm:px-8 sm:py-10">
        <div
          className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(95,143,122,0.28),transparent_70%)]"
          aria-hidden
        />
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Already enrolled
        </p>
        <h2 className="mt-3 font-display text-[clamp(1.65rem,4vw,2.35rem)] tracking-[-0.02em] text-pine">
          {firstName ? `${firstName}, you` : "You"} already have an application
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/70 sm:text-base">
          An account for{" "}
          <span className="break-all font-medium text-ink">{email}</span> is
          already on file. You cannot submit a second enrolment with the same
          email.
        </p>
      </div>

      <ol className="divide-y divide-stone">
        <li className="px-5 py-6 sm:px-8">
          <p className="font-display text-lg text-pine sm:text-xl">
            01 · Check your confirmation email
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Look for the School of Disciples message with your application
            reference and temporary portal password. Check spam or promotions if
            it is not in your inbox.
          </p>
        </li>

        <li className="px-5 py-6 sm:px-8">
          <p className="font-display text-lg text-pine sm:text-xl">
            02 · Sign in to the student portal
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Use the email above and the temporary password from that message to
            track payment and status.
          </p>
          <Link
            href="/login/student"
            className="mt-4 inline-flex w-full items-center justify-center bg-pine px-5 py-3.5 text-sm font-medium tracking-wide text-mist transition-colors hover:bg-celadon sm:w-auto"
          >
            Open student sign-in
          </Link>
        </li>

        <li className="px-5 py-6 sm:px-8">
          <p className="font-display text-lg text-pine sm:text-xl">
            03 · Resend temporary access
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Lost the temporary credentials? We can email a fresh temporary
            password to{" "}
            <span className="break-all text-ink">{email}</span> — better than
            waiting on support for the old one.
          </p>
          {resetSent ? (
            <p className="mt-4 border border-pine/20 bg-stone/40 px-4 py-3 text-sm text-ink/75">
              Fresh credentials sent. Check your inbox (and spam), then sign in
              to the student portal.
            </p>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={sendReset}
              className="mt-4 inline-flex w-full items-center justify-center border border-pine/30 px-5 py-3.5 text-sm font-medium text-pine transition-colors hover:border-pine hover:bg-stone/30 disabled:opacity-60 sm:w-auto"
            >
              {pending ? "Sending…" : "Email me fresh credentials"}
            </button>
          )}
        </li>

        <li className="px-5 py-6 sm:px-8">
          <p className="font-display text-lg text-pine sm:text-xl">
            04 · Still stuck? Contact support
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            If you cannot access your email or the reset does not arrive, reach
            the Listening Desk and we will help restore access.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href={supportHref}
              className="inline-flex w-full items-center justify-center border border-pine/30 px-5 py-3.5 text-sm font-medium text-pine transition-colors hover:border-pine sm:w-auto"
            >
              Open support
            </Link>
            <a
              href={contact.emailHref}
              className="inline-flex w-full items-center justify-center text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4 sm:w-auto sm:px-2"
            >
              {contact.email}
            </a>
          </div>
        </li>
      </ol>

      {onDismiss ? (
        <div className="border-t border-stone px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-ink/55 underline decoration-ink/20 underline-offset-4 hover:text-pine"
          >
            Use a different email on the form
          </button>
        </div>
      ) : null}
    </div>
  );
}
