"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PaymentsPulse = {
  pending: number;
};

/**
 * Unresolved bank proofs for the nav badge. Uses the cookie client so RLS
 * parish-scopes the count for parish admins.
 */
export async function getPaymentsPulse(): Promise<PaymentsPulse> {
  try {
    const supabase = await createServerSupabaseClient();
    const { count } = await supabase
      .from("fee_transactions")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_review");

    return { pending: count ?? 0 };
  } catch {
    return { pending: 0 };
  }
}
