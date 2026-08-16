"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { createSupportTicket } from "@/app/support/actions";
import { useToast } from "@/components/ui/toast";
import { contact } from "@/lib/site-nav";
import { MESSAGE_MAX, SUPPORT_TOPICS } from "@/lib/tickets";

const fieldClass =
  "w-full border border-stone bg-white/60 px-4 py-3.5 text-base text-ink outline-none transition-[border-color,background-color] duration-300 placeholder:text-ink/35 focus:border-pine focus:bg-mist sm:py-3 sm:text-[0.95rem]";

type Prefill = {
  name?: string;
  email?: string;
  signedInStudent?: boolean;
};

export function SupportForm({ prefill }: { prefill?: Prefill }) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [topic, setTopic] = useState<(typeof SUPPORT_TOPICS)[number]>(
    "General enquiry",
  );
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [messageLen, setMessageLen] = useState(0);
  const [sent, setSent] = useState<{
    reference: string;
    topic: string;
    linked: boolean;
  } | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const submittedTopic = String(formData.get("topic") ?? topic);

    startTransition(async () => {
      const result = await createSupportTicket(formData);
      if (result.ok && result.reference) {
        setSent({
          reference: result.reference,
          topic: submittedTopic,
          linked: Boolean(result.linked),
        });
        success(result.message, "Note received");
        form.reset();
        setTopic("General enquiry");
        setName(prefill?.name ?? "");
        setEmail(prefill?.email ?? "");
        setMessageLen(0);
      } else {
        error(result.message, "Could not send");
      }
    });
  }

  if (sent) {
    return (
      <div className="animate-fade-rise border border-pine/20 bg-mist/80 px-6 py-10 text-center sm:px-8">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          On the desk
        </p>
        <h2 className="mt-3 font-display text-3xl tracking-[-0.02em] text-pine">
          Thank you
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink/65">
          Your note about{" "}
          <span className="font-medium text-ink">{sent.topic}</span> reached the
          School of Disciples Listening Desk. Keep this reference if you follow
          up.
        </p>
        <p className="mt-6 inline-flex border border-pine/25 bg-white/50 px-4 py-2.5 font-mono text-sm tracking-wide text-pine">
          {sent.reference}
        </p>
        {sent.linked ? (
          <p className="mx-auto mt-4 max-w-sm text-sm text-ink/60">
            This thread is also in your{" "}
            <Link
              href="/student/support"
              className="font-medium text-pine underline decoration-pine/30 underline-offset-4"
            >
              student Support inbox
            </Link>
            .
          </p>
        ) : null}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setSent(null)}
            className="inline-flex border border-pine/30 px-5 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine hover:bg-mist"
          >
            Write another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      {prefill?.signedInStudent ? (
        <p className="border border-pine/15 bg-stone/35 px-4 py-3 text-sm leading-relaxed text-ink/70">
          Signed in as a student — notes sent with your account email appear in{" "}
          <Link
            href="/student/support"
            className="font-medium text-pine underline decoration-pine/30 underline-offset-4"
          >
            portal Support
          </Link>
          .
        </p>
      ) : null}

      <div>
        <label className="mb-2 block text-sm font-medium text-ink" htmlFor="topic">
          Topic
        </label>
        <div className="relative">
          <select
            id="topic"
            name="topic"
            value={topic}
            onChange={(event) =>
              setTopic(event.target.value as (typeof SUPPORT_TOPICS)[number])
            }
            className={`${fieldClass} appearance-none pr-10`}
            disabled={pending}
          >
            {SUPPORT_TOPICS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink/45"
            aria-hidden
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-ink" htmlFor="name">
            Full name
          </label>
          <input
            id="name"
            name="name"
            required
            autoComplete="name"
            disabled={pending}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldClass}
            placeholder="Your name"
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm font-medium text-ink"
            htmlFor="email"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={pending}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label
            className="block text-sm font-medium text-ink"
            htmlFor="message"
          >
            Message
          </label>
          <span className="text-xs tabular-nums text-ink/40">
            {messageLen}/{MESSAGE_MAX}
          </span>
        </div>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          maxLength={MESSAGE_MAX}
          disabled={pending}
          onChange={(e) => setMessageLen(e.target.value.length)}
          className={`${fieldClass} resize-y`}
          placeholder="How can we help you walk the path?"
        />
      </div>

      <p className="text-xs leading-relaxed text-ink/50">
        Prefer to reach us directly?{" "}
        <a
          href={contact.emailHref}
          className="font-medium text-pine underline decoration-pine/30 underline-offset-4"
        >
          {contact.email}
        </a>
      </p>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center bg-pine px-6 py-3.5 text-[0.95rem] font-medium tracking-wide text-mist transition-colors duration-300 hover:bg-celadon disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
