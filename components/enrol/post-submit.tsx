"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BANK_TRANSFER,
  formatGbp,
  PROGRAMME_FEES,
  type ProgrammeFeeKey,
} from "@/lib/enrol/payment";
import { contact, SOD_SITE } from "@/lib/site-nav";
import type { ApplicationReference } from "@/lib/enrol/reference";

type Phase = "received" | "bank";

type PostSubmitProps = {
  reference: ApplicationReference;
  email: string;
  firstName: string;
  temporaryPassword: string;
  attendanceMode: string;
  emailSubject: string;
  emailSent: boolean;
};

const PAYMENTS_LOGIN_HREF = "/login/student?next=/student/payments";

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 touch-manipulation px-2 py-1.5 text-xs font-medium tracking-wide text-pine underline decoration-pine/30 underline-offset-4 transition-colors hover:text-celadon"
    >
      {copied ? "Copied" : label ?? "Copy"}
    </button>
  );
}

function DetailRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-stone/70 py-3.5 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
          {label}
        </p>
        <p
          className={`mt-1 text-sm leading-snug text-ink ${
            mono
              ? "break-all font-mono tracking-wide"
              : "break-words [overflow-wrap:anywhere]"
          }`}
        >
          {value}
        </p>
      </div>
      {copyable ? (
        <div className="flex justify-end sm:justify-start">
          <CopyButton value={value} />
        </div>
      ) : null}
    </div>
  );
}

function PhaseBack({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="touch-manipulation text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4"
    >
      {label}
    </button>
  );
}

export function EnrolPostSubmit({
  reference,
  email,
  firstName,
  temporaryPassword,
  attendanceMode,
  emailSubject,
  emailSent,
}: PostSubmitProps) {
  const [phase, setPhase] = useState<Phase>("received");

  const fee = useMemo(() => {
    const key = (
      attendanceMode in PROGRAMME_FEES ? attendanceMode : "standard"
    ) as ProgrammeFeeKey;
    return PROGRAMME_FEES[key];
  }, [attendanceMode]);

  if (phase === "bank") {
    return (
      <div className="animate-fade-rise border border-stone bg-mist">
        <div className="border-b border-stone px-4 py-5 sm:px-8 sm:py-6">
          <PhaseBack
            label="Back"
            onClick={() => setPhase("received")}
          />
          <p className="mt-4 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Direct deposit
          </p>
          <h2 className="mt-2 font-display text-[clamp(1.55rem,5vw,1.9rem)] tracking-[-0.02em] text-pine sm:text-3xl">
            Transfer to the SOD account
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/70">
            Pay {formatGbp(fee.amountGbp)}. Use the payment reference exactly so
            we can match your transfer. Then sign in to upload proof from
            Payments.
          </p>
        </div>

        <div className="grid gap-4 px-4 py-5 sm:gap-6 sm:px-8 sm:py-7 lg:grid-cols-2">
          <div className="border border-stone bg-mist/50 px-3.5 py-1 sm:px-5 sm:py-2">
            <DetailRow
              label="Payment reference"
              value={reference.compact}
              mono
              copyable
            />
            <DetailRow
              label="Account name"
              value={BANK_TRANSFER.accountName}
              copyable
            />
            <DetailRow
              label="Sort code"
              value={BANK_TRANSFER.sortCode}
              mono
              copyable
            />
            <DetailRow
              label="Account number"
              value={BANK_TRANSFER.accountNumber}
              mono
              copyable
            />
            <DetailRow
              label="SWIFT/BIC"
              value={BANK_TRANSFER.swiftBic}
              mono
              copyable
            />
            <DetailRow
              label="IBAN"
              value={BANK_TRANSFER.iban}
              mono
              copyable
            />
          </div>

          <div className="flex flex-col justify-between border border-pine/20 bg-stone/35 px-4 py-5 sm:px-5 sm:py-6">
            <div>
              <h3 className="font-display text-xl text-pine">Next</h3>
              <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-ink/75">
                <li>Make the transfer using the reference above.</li>
                <li>Sign in to your student portal with the email we sent.</li>
                <li>Open Payments and upload your proof.</li>
                <li>Admin confirms — status becomes Paid.</li>
              </ol>
            </div>
            <Link
              href={PAYMENTS_LOGIN_HREF}
              className="mt-6 inline-flex w-full items-center justify-center bg-pine px-5 py-3.5 text-sm font-medium tracking-wide text-mist transition-colors hover:bg-celadon sm:mt-8 sm:w-fit"
            >
              Sign in to upload proof
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-rise border border-stone bg-mist">
      <div className="px-4 py-8 text-center sm:px-10 sm:py-12">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Application received
        </p>
        <h2 className="mt-3 font-display text-[clamp(1.65rem,5vw,2.25rem)] tracking-[-0.02em] text-pine sm:text-4xl">
          Thank you for beginning the journey
          {firstName ? `, ${firstName}` : ""}.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-ink/70 sm:text-base">
          We can confirm receipt of your application. Further information will
          follow within 2 business days.
          {emailSent ? (
            <>
              {" "}
              A personalised confirmation has been sent to{" "}
              <span className="break-all text-ink">{email}</span> with your
              reference and temporary portal login.
            </>
          ) : (
            <>
              {" "}
              We could not deliver the confirmation email to{" "}
              <span className="break-all text-ink">{email}</span> just now —
              please save your temporary password below and sign in to the
              student portal.
            </>
          )}
        </p>

        <div className="mx-auto mt-7 max-w-md border border-pine/20 bg-stone/40 px-4 py-4 text-left sm:mt-8 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
              Application reference
            </p>
            <CopyButton value={reference.display} />
          </div>
          <p className="mt-2 break-all font-mono text-base tracking-wide text-pine sm:text-xl">
            {reference.display}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink/55">
            Bank payment reference (no dashes):{" "}
            <span className="break-all font-mono text-ink/80">
              {reference.compact}
            </span>
          </p>
        </div>

        <Link
          href={PAYMENTS_LOGIN_HREF}
          className="mt-7 inline-flex w-full max-w-sm touch-manipulation items-center justify-center bg-pine px-8 py-3.5 text-[0.95rem] font-medium tracking-wide text-mist transition-colors duration-300 hover:bg-celadon sm:mt-8 sm:w-auto"
        >
          Sign in to pay
        </Link>
        <p className="mt-3 text-sm text-ink/55">
          Card or bank transfer on{" "}
          <Link
            href={PAYMENTS_LOGIN_HREF}
            className="font-medium text-pine underline decoration-pine/30 underline-offset-4"
          >
            Student → Payments
          </Link>
          . Or{" "}
          <button
            type="button"
            onClick={() => setPhase("bank")}
            className="font-medium text-pine underline decoration-pine/30 underline-offset-4"
          >
            view bank details
          </button>{" "}
          here first ({formatGbp(fee.amountGbp)}).
        </p>
      </div>

      <div className="grid gap-0 border-t border-stone lg:grid-cols-2">
        <div className="border-b border-stone px-4 py-6 sm:px-8 sm:py-7 lg:border-b-0 lg:border-r">
          <h3 className="font-display text-xl text-pine">
            {emailSent ? "Email on its way" : "Email could not be sent"}
          </h3>
          <p className="mt-2 text-sm text-ink/60">
            {emailSent
              ? "Look for a message from the School of Disciples — your reference, temporary password, and a link to the student portal are inside."
              : "Your application is still saved. Use the temporary login on this page, then contact us if the email never arrives."}
          </p>
          <div className="mt-5 space-y-3 text-sm leading-relaxed text-ink/75">
            <p className="break-words">
              <span className="text-ink/45">To</span>{" "}
              <span className="break-all">{email}</span>
            </p>
            <p className="break-words">
              <span className="text-ink/45">Subject</span> {emailSubject}
            </p>
            {emailSent ? (
              <p>
                Includes your reference, temporary portal password, next steps,
                and a sign-in button.
              </p>
            ) : (
              <p className="text-[#6b4f2a]">
                Save the credentials below — they will not be emailed again
                automatically.
              </p>
            )}
            <p>
              Questions:{" "}
              <a
                href={contact.emailHref}
                className="text-pine underline decoration-pine/30 underline-offset-4"
              >
                {contact.email}
              </a>
            </p>
          </div>
        </div>

        <div className="px-4 py-6 sm:px-8 sm:py-7">
          <h3 className="font-display text-xl text-pine">
            Temporary portal login
          </h3>
          <p className="mt-2 text-sm text-ink/60">
            Generated uniquely for this application — 10 characters, letters and
            digits. It is your portal password until you change it. It is not
            stored in plain text after creation.
          </p>
          <div className="mt-5 border border-stone bg-mist/50 px-3.5 py-1 sm:px-5 sm:py-2">
            <DetailRow label="Email" value={email} copyable />
            <DetailRow
              label="Temporary password"
              value={temporaryPassword}
              mono
              copyable
            />
          </div>
          <Link
            href="/login/student"
            className="mt-5 inline-flex w-full items-center justify-center border border-pine/30 px-4 py-3 text-sm font-medium text-pine transition-colors hover:border-pine sm:w-auto sm:border-0 sm:px-0 sm:py-0 sm:underline sm:decoration-pine/30 sm:underline-offset-4 sm:hover:text-celadon"
          >
            Open student portal
          </Link>
          <p className="mt-4 text-xs text-ink/50">
            Public site:{" "}
            <a
              href={SOD_SITE}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              schoolofdisciples.org
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
