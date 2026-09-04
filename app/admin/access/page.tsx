import type { Metadata } from "next";
import Link from "next/link";
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
      <section className="animate-fade-rise mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
            Administration
          </p>
          <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
            Access
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
            {isNationalAdmin(profile)
              ? "Admin and teacher credentials and invites. Change your own password in My account. Open Insight for a short guide to desks."
              : "Staff credentials and invites. Change your own password in My account. Open Insight for a short guide to desks."}
          </p>
        </div>
        <Link
          href="/admin/account"
          className="inline-flex min-h-[2.5rem] shrink-0 items-center justify-center border border-pine/35 bg-white px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine hover:bg-mist"
        >
          My account
        </Link>
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
