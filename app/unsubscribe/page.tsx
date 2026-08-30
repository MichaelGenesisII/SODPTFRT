import Link from "next/link";
import { recordCampaignUnsubscribe } from "./actions";

export const metadata = {
  title: "Email preferences · School of Disciples",
  description: "Manage desk campaign email preferences.",
};

type PageProps = {
  searchParams: Promise<{ t?: string }>;
};

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.t?.trim() || "";

  let result: { ok: boolean; message: string; email?: string } | null = null;
  if (token) {
    result = await recordCampaignUnsubscribe(token, "link");
  }

  return (
    <main className="mx-auto flex min-h-[70svh] max-w-lg flex-col justify-center px-6 py-16 text-ink">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest/70">
        School of Disciples
      </p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight">
        Email preferences
      </h1>

      {!token ? (
        <p className="mt-4 text-base leading-relaxed text-ink/70">
          Open the unsubscribe link from a desk campaign email to update your
          preferences. Transactional messages about payments and access are
          separate.
        </p>
      ) : result?.ok ? (
        <p className="mt-4 text-base leading-relaxed text-ink/80">
          {result.message}
          {result.email ? (
            <>
              {" "}
              (<span className="whitespace-nowrap">{result.email}</span>)
            </>
          ) : null}
        </p>
      ) : (
        <p className="mt-4 text-base leading-relaxed text-ink/80">
          {result?.message || "This link is not valid."}
        </p>
      )}

      <p className="mt-8 text-sm text-ink/55">
        <Link href="/support" className="underline underline-offset-2">
          Contact Support
        </Link>
        {" · "}
        <Link href="/login/student" className="underline underline-offset-2">
          Student login
        </Link>
      </p>
    </main>
  );
}
