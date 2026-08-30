import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLegacyAlumniById } from "@/app/admin/alumni/actions";
import { AlumniDetailWorkspace } from "@/components/admin/alumni-detail-workspace";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getLegacyAlumniById(id).catch(() => null);
  const title =
    result?.ok === true
      ? `${result.person.display_name} | Alumni | School of Disciples Portal`
      : "Alumni | School of Disciples Portal";
  return { title };
}

export default async function AdminAlumniDetailPage({
  params,
  searchParams,
}: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");
  if (!isNationalAdmin(profile)) redirect("/admin");

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const backHref = sp.from
    ? `/admin/alumni?${sp.from}`
    : "/admin/alumni";

  const result = await getLegacyAlumniById(id);
  if (!result.ok) {
    notFound();
  }

  const person = result.person;

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          National desk · Alumni file
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.5rem,4vw,2.2rem)] tracking-[-0.02em] text-pine">
          {person.display_name}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Marks, attendance, fees, and portal access from the graduating register.
          Assign email or upgrade to the student portal here.
        </p>
      </section>

      <AlumniDetailWorkspace person={person} backHref={backHref} />
    </div>
  );
}
