import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listAdminCommunityMessages } from "@/app/admin/community/actions";
import { CommunityManager } from "@/components/admin/community-manager";
import { getSessionAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Community | Admin Portal",
};

export default async function AdminCommunityPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const messages = await listAdminCommunityMessages();

  return (
    <div className="w-full">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Communications
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Community
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          National text-only room. Students see visible messages in real time.
          National admins: press and hold a message to hide anything off-topic
          or unsafe.
        </p>
      </section>

      <CommunityManager profile={profile} initialMessages={messages} />
    </div>
  );
}
