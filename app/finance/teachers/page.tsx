import type { Metadata } from "next";
import { requireSessionFinance } from "@/lib/finance/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { teacherDisplayName } from "@/lib/teacher/types";

export const metadata: Metadata = {
  title: "Teachers | Finance Portal",
};

export default async function FinanceTeachersPage() {
  await requireSessionFinance();

  let teachers: {
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
  }[] = [];
  let loadError: string | null = null;

  try {
    const service = createServiceSupabaseClient();
    const { data, error } = await service
      .from("teacher_profiles")
      .select("id, email, full_name, is_active")
      .order("full_name", { ascending: true });
    if (error) {
      console.error("[finance/teachers]", error.message);
      throw new Error("Teachers are temporarily unavailable.");
    }
    teachers = (data ?? []) as typeof teachers;
  } catch (error) {
    console.error("[finance/teachers]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Teachers"),
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Teachers
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Teacher directory
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/65">
          Read-only list for pay reference. Invite and activate teachers from
          the national Access desk.
        </p>
      </section>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : teachers.length === 0 ? (
        <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center">
          <p className="font-display text-lg text-pine">No teachers yet</p>
          <p className="mt-2 text-sm text-ink/55">
            When teachers are invited on Access, they will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-stone/70 border border-stone/80 bg-white/55">
          {teachers.map((teacher) => (
            <li
              key={teacher.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {teacherDisplayName(teacher)}
                </p>
                <p className="mt-1 text-sm text-ink/55">{teacher.email}</p>
              </div>
              <span
                className={`text-xs font-medium uppercase tracking-[0.12em] ${
                  teacher.is_active ? "text-celadon" : "text-ink/40"
                }`}
              >
                {teacher.is_active ? "Active" : "Inactive"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
