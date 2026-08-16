import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMiddlewareSession } from "@/lib/supabase/middleware";

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
    .select("id, is_active")
    .eq("id", userId)
    .maybeSingle();

  return data && data.is_active ? data : null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabase, response, user } = await createMiddlewareSession(request);

  if (pathname === "/login/admin") {
    if (supabase && user) {
      const profile = await getActiveAdminProfile(supabase, user.id);
      if (profile) {
        const desk = request.nextUrl.clone();
        desk.pathname = "/admin";
        desk.search = "";
        return NextResponse.redirect(desk);
      }
    }
    return response;
  }

  if (pathname === "/login/student") {
    if (supabase && user) {
      const profile = await getActiveStudentProfile(supabase, user.id);
      if (profile) {
        const portal = request.nextUrl.clone();
        portal.pathname = "/student";
        portal.search = "";
        return NextResponse.redirect(portal);
      }
    }
    return response;
  }

  if (pathname.startsWith("/student")) {
    if (!supabase) {
      const login = request.nextUrl.clone();
      login.pathname = "/login/student";
      login.searchParams.set("error", "config");
      return NextResponse.redirect(login);
    }

    if (!user) {
      const login = request.nextUrl.clone();
      login.pathname = "/login/student";
      return NextResponse.redirect(login);
    }

    const profile = await getActiveStudentProfile(supabase, user.id);

    if (!profile) {
      await supabase.auth.signOut();
      const login = request.nextUrl.clone();
      login.pathname = "/login/student";
      login.searchParams.set("error", "forbidden");
      return NextResponse.redirect(login);
    }

    return response;
  }

  if (!pathname.startsWith("/admin")) {
    return response;
  }

  if (!supabase) {
    const login = request.nextUrl.clone();
    login.pathname = "/login/admin";
    login.searchParams.set("error", "config");
    return NextResponse.redirect(login);
  }

  if (!user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login/admin";
    return NextResponse.redirect(login);
  }

  const profile = await getActiveAdminProfile(supabase, user.id);

  if (!profile) {
    await supabase.auth.signOut();
    const login = request.nextUrl.clone();
    login.pathname = "/login/admin";
    login.searchParams.set("error", "forbidden");
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/login/admin",
    "/student/:path*",
    "/login/student",
  ],
};
