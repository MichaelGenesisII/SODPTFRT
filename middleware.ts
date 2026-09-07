import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMiddlewareSession } from "@/lib/supabase/middleware";

function redirectAuthenticatedToDesk(
  request: NextRequest,
  nextPath: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = nextPath;
  url.search = "";
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

async function getActiveTeacherProfile(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data } = await supabase
    .from("teacher_profiles")
    .select("id, is_active")
    .eq("id", userId)
    .maybeSingle();

  return data && data.is_active ? data : null;
}

async function getActiveFinanceProfile(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data } = await supabase
    .from("finance_profiles")
    .select("id, is_active")
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

  if (pathname === "/login/teacher") {
    if (supabase && user) {
      const profile = await getActiveTeacherProfile(supabase, user.id);
      if (profile) {
        return redirectAuthenticatedToDesk(request, "/teacher");
      }
    }
    return response;
  }

  if (pathname === "/login/finance") {
    if (supabase && user) {
      const profile = await getActiveFinanceProfile(supabase, user.id);
      if (profile) {
        return redirectAuthenticatedToDesk(request, "/finance");
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
    pathname.startsWith("/admin") ||
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/finance")
  ) {
    if (!supabase) {
      const login = request.nextUrl.clone();
      login.pathname = pathname.startsWith("/admin")
        ? "/login/admin"
        : pathname.startsWith("/teacher")
          ? "/login/teacher"
          : pathname.startsWith("/finance")
            ? "/login/finance"
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
        : pathname.startsWith("/teacher")
          ? "/login/teacher"
          : pathname.startsWith("/finance")
            ? "/login/finance"
            : pathname.startsWith("/alumni")
              ? "/login/alumni"
              : "/login/student";
      return NextResponse.redirect(login);
    }

    // Teachers / Finance must not use the admin desk (fail closed).
    if (pathname.startsWith("/admin") && supabase) {
      const teacher = await getActiveTeacherProfile(supabase, user.id);
      const finance = await getActiveFinanceProfile(supabase, user.id);
      const admin = await getActiveAdminProfile(supabase, user.id);
      if (teacher && !admin) {
        const teacherHome = request.nextUrl.clone();
        teacherHome.pathname = "/teacher";
        teacherHome.search = "";
        return NextResponse.redirect(teacherHome);
      }
      if (finance && !admin) {
        const financeHome = request.nextUrl.clone();
        financeHome.pathname = "/finance";
        financeHome.search = "";
        return NextResponse.redirect(financeHome);
      }
    }

    // Finance users must not use the teacher portal (fail closed).
    if (pathname.startsWith("/teacher") && supabase) {
      const teacher = await getActiveTeacherProfile(supabase, user.id);
      const finance = await getActiveFinanceProfile(supabase, user.id);
      if (finance && !teacher) {
        const financeHome = request.nextUrl.clone();
        financeHome.pathname = "/finance";
        financeHome.search = "";
        return NextResponse.redirect(financeHome);
      }
    }

    // Teachers / admins without finance must not use Finance (fail closed).
    if (pathname.startsWith("/finance") && supabase) {
      const finance = await getActiveFinanceProfile(supabase, user.id);
      const teacher = await getActiveTeacherProfile(supabase, user.id);
      const admin = await getActiveAdminProfile(supabase, user.id);
      if (!finance) {
        if (teacher) {
          const teacherHome = request.nextUrl.clone();
          teacherHome.pathname = "/teacher";
          teacherHome.search = "";
          return NextResponse.redirect(teacherHome);
        }
        if (admin) {
          const adminHome = request.nextUrl.clone();
          adminHome.pathname = "/admin";
          adminHome.search = "";
          return NextResponse.redirect(adminHome);
        }
      }
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
    "/teacher/:path*",
    "/login/teacher",
    "/finance/:path*",
    "/login/finance",
  ],
};
