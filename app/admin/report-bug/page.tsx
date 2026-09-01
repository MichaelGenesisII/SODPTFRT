import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SupportForm } from "@/components/support/support-form";
import { WhatsAppChatLink } from "@/components/support/whatsapp-chat-link";
import { getSessionAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Report a bug | Admin Portal",
  description:
    "Tell the team when something on the admin desk is not working as expected.",
};

export default async function AdminReportBugPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  return (
    <div className="mx-auto max-w-2xl">
      <section className="mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Desk feedback
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.2rem)] tracking-[-0.02em] text-pine">
          Report a bug
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink/70">
          When a desk screen misbehaves, send a note with the page you were on
          and what you expected. Tickets land in the same{" "}
          <Link href="/admin/tickets" className="font-medium text-pine underline">
            Support inbox
          </Link>
          .
        </p>
        <p className="mt-3 text-sm text-ink/60">
          Urgent?{" "}
          <WhatsAppChatLink className="inline-flex items-center gap-1.5 font-medium text-pine underline decoration-pine/30 underline-offset-4" />
        </p>
      </section>

      <div className="border border-stone bg-white/70 px-5 py-7 sm:px-8">
        <SupportForm
          prefill={{
            name: profile.full_name?.trim() || profile.email,
            email: profile.email,
          }}
          defaultTopic="Report a bug"
        />
      </div>
    </div>
  );
}
