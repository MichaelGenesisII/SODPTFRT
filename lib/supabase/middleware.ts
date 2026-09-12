import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isStaleRefreshAuthError } from "@/lib/supabase/auth-errors";

type MiddlewareSession = {
  supabase: SupabaseClient | null;
  response: NextResponse;
  user: User | null;
};

/**
 * Refreshes the auth cookie and resolves the caller in a single round trip.
 * Stale refresh tokens are cleared so the request continues as a guest.
 */
export async function createMiddlewareSession(
  request: NextRequest,
): Promise<MiddlewareSession> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { supabase: null, response, user: null };
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[],
      ) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error && isStaleRefreshAuthError(error)) {
    // Drop dead session cookies so the next request does not keep failing.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { supabase, response, user: null };
  }

  return { supabase, response, user: user ?? null };
}
