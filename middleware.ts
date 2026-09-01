import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMiddlewareSession } from "@/lib/supabase/middleware";

function redirectAuthenticatedToDesk(
  request: NextRequest,
  nextPath: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = "/auth/continue";
  url.search = `?next=${encodeURIComponent(nextPath)}`;
  return NextResponse.redirect(url);
}

async function getActiveAdminProfile(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data } = await supabase
    .from("admin_profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  return data && data.is_active ? data : null;
}

async function getActiveStudentProfile(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data } = await supabase
    .from("student_profiles")
    .select("id, is_active, account_kind")
    .eq("id", userId)
    .maybeSingle();

  return data && data.is_active ? data : null;
}

/**
 * Auth gate only. Profile / role checks live in layouts so every soft
 * navigation does not pay an extra Supabase round-trip here.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabase, response, user } = await createMiddlewareSession(request);

  if (pathname === "/login/admin") {
    if (supabase && user) {
      const profile = await getActiveAdminProfile(supabase, user.id);
      if (profile) {
        return redirectAuthenticatedToDesk(request, "/admin");
      }
    }
    return response;
  }

  if (pathname === "/login/student") {
    if (supabase && user) {
      const profile = await getActiveStudentProfile(supabase, user.id);
      if (profile) {
        const nextPath =
          profile.account_kind === "alumni" ? "/alumni" : "/student";
        return redirectAuthenticatedToDesk(request, nextPath);
      }
    }
    return response;
  }

  if (pathname === "/login/alumni") {
    if (supabase && user) {
      const profile = await getActiveStudentProfile(supabase, user.id);
      if (profile && profile.account_kind === "alumni") {
        return redirectAuthenticatedToDesk(request, "/alumni");
      }
    }
    return response;
  }

  if (
    pathname.startsWith("/alumni") ||
    pathname.startsWith("/student") ||
    pathname.startsWith("/admin")
  ) {
    if (!supabase) {
      const login = request.nextUrl.clone();
      login.pathname = pathname.startsWith("/admin")
        ? "/login/admin"
        : pathname.startsWith("/alumni")
          ? "/login/alumni"
          : "/login/student";
      login.searchParams.set("error", "config");
      return NextResponse.redirect(login);
    }

    if (!user) {
      const login = request.nextUrl.clone();
      login.pathname = pathname.startsWith("/admin")
        ? "/login/admin"
        : pathname.startsWith("/alumni")
          ? "/login/alumni"
          : "/login/student";
      return NextResponse.redirect(login);
    }

    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/login/admin",
    "/student/:path*",
    "/login/student",
    "/alumni/:path*",
    "/login/alumni",
  ],
};
