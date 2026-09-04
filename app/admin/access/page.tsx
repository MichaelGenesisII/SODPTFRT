import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listTeachersForFinance } from "@/app/admin/finance/teachers/actions";
import { AccessManager } from "@/components/admin/access-manager";
import {
  getSessionAdmin,
  isNationalAdmin,
  type AdminProfile,
} from "@/lib/admin/auth";
import { cachedSignStaffPhotoUrl } from "@/lib/staff/photos";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TeacherProfile } from "@/lib/teacher/types";

export const metadata: Metadata = {
  title: "Access | School of Disciples Portal",
};

type Props = {
  searchParams: Promise<{ staff?: string }>;
};

export default async function AdminAccessPage({ searchParams }: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const sp = await searchParams;
  const initialStaffTab =
    sp.staff === "teachers" && isNationalAdmin(profile) ? "teachers" : "admins";

  const supabase = await createServerSupabaseClient();
  const [{ data }, { data: parishRows }] = await Promise.all([
    supabase
      .from("admin_profiles")
      .select(
        "id, email, full_name, role, is_active, created_at, parish_id, avatar_path",
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("parishes")
      .select("id, name, region")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const admins = await Promise.all(
    (data ?? []).map(async (row) => {
      const base = {
        ...(row as Omit<AdminProfile, "parish_id" | "avatarUrl">),
        parish_id: (row as { parish_id?: string | null }).parish_id ?? null,
        avatar_path:
          (row as { avatar_path?: string | null }).avatar_path ?? null,
      };
      const avatarUrl = await cachedSignStaffPhotoUrl(base.avatar_path);
      return { ...base, avatarUrl } as AdminProfile;
    }),
  );

  let teachers: TeacherProfile[] = [];
  if (isNationalAdmin(profile)) {
    try {
      const rows = await listTeachersForFinance();
      teachers = await Promise.all(
        rows.map(async (teacher) => ({
          ...teacher,
          avatarUrl: await cachedSignStaffPhotoUrl(teacher.avatar_path),
        })),
      );
    } catch (error) {
      console.error("[admin/access/teachers]", error);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Administration
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Access
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {isNationalAdmin(profile)
            ? "Admin and teacher credentials, invites, and your password. Open Insight for a short guide to desks."
            : "Staff credentials, invites, and your password. Open Insight for a short guide to desks."}
        </p>
      </section>
      <AccessManager
        profile={profile}
        admins={admins}
        parishes={parishRows ?? []}
        teachers={teachers}
        initialStaffTab={initialStaffTab}
      />
    </div>
  );
}
