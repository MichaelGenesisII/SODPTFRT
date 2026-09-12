import { cache } from "react";
import { isStaleRefreshAuthError } from "@/lib/supabase/auth-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { FinanceProfile } from "@/lib/finance/types";

export type { FinanceProfile } from "@/lib/finance/types";
export { financeDisplayName } from "@/lib/finance/types";

const FINANCE_SELECT =
  "id, email, full_name, is_active, created_at, updated_at, avatar_path";
const FINANCE_SELECT_LEGACY =
  "id, email, full_name, is_active, created_at, updated_at";

function isMissingAvatarColumn(message: string) {
  return /avatar_path|schema cache|column .* does not exist/i.test(message);
}

/** Deduped per request — finance layout + pages. */
export const getSessionFinance = cache(
  async (): Promise<FinanceProfile | null> => {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError && isStaleRefreshAuthError(authError)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return null;
    }
    if (!user) return null;

    let { data, error } = await supabase
      .from("finance_profiles")
      .select(FINANCE_SELECT)
      .eq("id", user.id)
      .maybeSingle();

    if (error && isMissingAvatarColumn(error.message)) {
      console.error(
        "[finance/auth] avatar_path unavailable; loading profile without it",
      );
      ({ data, error } = await supabase
        .from("finance_profiles")
        .select(FINANCE_SELECT_LEGACY)
        .eq("id", user.id)
        .maybeSingle());
    }

    if (error) {
      console.error("[finance/auth]", error.message);
      return null;
    }
    if (!data || !data.is_active) return null;

    return {
      ...(data as Omit<FinanceProfile, "avatarUrl">),
      avatar_path: (data as { avatar_path?: string | null }).avatar_path ?? null,
      avatarUrl: null,
    };
  },
);

export async function requireSessionFinance(): Promise<FinanceProfile> {
  const profile = await getSessionFinance();
  if (!profile) {
    throw new Error("Unauthorized");
  }
  return profile;
}
