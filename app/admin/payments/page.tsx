import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listAdminPaymentQueue } from "@/app/admin/payments/actions";
import { PaymentsManager } from "@/components/admin/payments-manager";
import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Payments | School of Disciples Portal",
};

type Props = {
  searchParams?: Promise<{ user?: string; from?: string }>;
};

export default async function AdminPaymentsPage({ searchParams }: Props) {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

  const params = (await searchParams) ?? {};
  const initialUserId = params.user?.trim() || undefined;
  const studentBackHref = params.from?.startsWith("student:")
    ? `/admin/students/${params.from.slice("student:".length)}`
    : undefined;

  let pending: Awaited<ReturnType<typeof listAdminPaymentQueue>> = [];
  let recent: Awaited<ReturnType<typeof listAdminPaymentQueue>> = [];
  let loadError: string | null = null;

  try {
    [pending, recent] = await Promise.all([
      listAdminPaymentQueue("pending_review"),
      listAdminPaymentQueue("paid"),
    ]);
  } catch (error) {
    console.error("[admin/payments]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Payments"),
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="animate-fade-rise mb-4 sm:mb-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Fees
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Payments
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          Review bank transfer proofs on the Desk. Open Insight for how this
          desk relates to Students and card payments.
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
        <PaymentsManager
          pending={pending}
          recentPaid={recent}
          national={isNationalAdmin(profile)}
          initialUserId={initialUserId}
          studentBackHref={studentBackHref}
        />
      )}
    </div>
  );
}
