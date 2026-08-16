import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listAdminGallery } from "@/app/admin/gallery/actions";
import { AdminGalleryManager } from "@/components/admin/gallery-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Gallery | School of Disciples Portal",
};

export default async function AdminGalleryPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  let items: Awaited<ReturnType<typeof listAdminGallery>> = [];
  let loadError: string | null = null;

  try {
    items = await listAdminGallery("all");
  } catch (error) {
    console.error("[admin/gallery]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Gallery"),
    );
  }

  const flaggedCount = items.filter(
    (i) => i.moderationStatus === "flagged",
  ).length;
  const takenDownCount = items.filter(
    (i) => i.moderationStatus === "taken_down",
  ).length;

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Portraits
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Gallery desk
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {isNationalAdmin(profile)
            ? "Review graduation selfies across the network. Flag, take down with a reason, or delete."
            : "Review graduation selfies for your parish. Flag, take down with a reason, or delete."}
        </p>
      </section>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : (
        <AdminGalleryManager
          items={items}
          flaggedCount={flaggedCount}
          takenDownCount={takenDownCount}
          national={isNationalAdmin(profile)}
        />
      )}
    </div>
  );
}
