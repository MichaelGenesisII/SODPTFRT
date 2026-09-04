"use client";

import {
  deleteAdminAvatar,
  uploadAdminAvatar,
} from "@/app/admin/account/actions";
import { StaffAvatarCard } from "@/components/staff/staff-avatar-card";
import type { AdminProfile } from "@/lib/admin/profile";

export function AdminAccountManager({
  profile,
}: {
  profile: AdminProfile;
}) {
  const displayName = profile.full_name || profile.email;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.14),_transparent_55%)]"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Account
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.6rem,5vw,2.3rem)] tracking-[-0.02em] text-pine">
            {displayName}
          </h1>
          <p className="mt-2 text-sm text-ink/65">{profile.email}</p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink/55">
            Manage how you appear on the admin desk. Password and security live
            under Access.
          </p>
        </div>
      </section>

      <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Appearance
        </p>
        <h2 className="mt-1 font-display text-xl text-pine">Profile picture</h2>
        <p className="mt-2 mb-4 text-sm text-ink/55">
          Shown in the header menu when you are signed in.
        </p>
        <StaffAvatarCard
          previewUrl={profile.avatarUrl}
          hasAvatar={Boolean(profile.avatar_path)}
          onUpload={uploadAdminAvatar}
          onDelete={deleteAdminAvatar}
        />
      </section>
    </div>
  );
}
