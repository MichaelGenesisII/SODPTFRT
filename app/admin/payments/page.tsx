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

export default async function AdminPaymentsPage() {
  const profile = await getSessionAdmin();
  if (!profile) redirect("/login/admin");

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
          Bank proofs
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
          {isNationalAdmin(profile)
            ? "Fee desk only — review bank transfer uploads across the UK network. Student profiles and enrolment CRUD stay on Students."
            : "Fee desk only — review bank transfer uploads for your parish. Student profiles and enrolment CRUD stay on Students."}
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
        />
      )}
    </div>
  );
}
