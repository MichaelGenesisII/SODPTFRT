"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { requestAdminPasswordReset } from "@/app/login/admin/actions";
import { requestEnrolmentPasswordReset } from "@/app/enrol/actions";
import { AdminEntryLink } from "@/components/admin-entry-link";
import { useToast } from "@/components/ui/toast";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type LoginRole = "student" | "admin";

type LoginPanelProps = {
  role: LoginRole;
};

const copy = {
  student: {
    eyebrow: "Student portal",
    title: "Welcome back",
    lead: "Sign in to track your application, complete payment, and continue your course journey.",
    submit: "Sign in as student",
    asideTitle: "Continue the journey",
    asideBody:
      "Your enrolment, payments, and course progress — kept in one quiet place.",
    hints: ["Application status", "Payments", "Course progress"],
    passwordPlaceholder: "Temporary or account password",
    deskLabel: "Student portal",
    forgotTitle: "Forgot password",
    resetFailTitle: "Could not send reset",
    resetOkTitle: "Check your inbox",
    forbidden:
      "This account is not registered as a student.",
    notAuthorised:
      "This account is not registered as a student. Enrol first, or use the temporary password from your confirmation email.",
  },
  admin: {
    eyebrow: "Admin",
    title: "Sign in",
    lead: "Authorised staff only.",
    submit: "Sign in",
    asideTitle: "School of Disciples",
    asideBody: "Staff portal access.",
    hints: [] as string[],
    passwordPlaceholder: "Password",
    deskLabel: "Admin desk",
    forgotTitle: "Forgot password",
    resetFailTitle: "Could not send reset",
    resetOkTitle: "Check your inbox",
    forbidden: "This account is not authorised for admin access.",
    notAuthorised: "This account is not authorised for admin access.",
  },
} as const;

function signInFailureMessage(raw?: string): string {
  const source = (raw || "").toLowerCase();
  if (
    /invalid login|invalid credentials|wrong password|user not found|email not found/.test(
      source,
    )
  ) {
    return "Email or password is incorrect.";
  }
  if (/email not confirmed|confirm your email/.test(source)) {
    return "Please confirm your email before signing in.";
  }
  if (/too many requests|rate limit|over_request_rate/.test(source)) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return publicActionMessage(raw, "Could not sign in. Please try again.");
}

export function LoginPanel({ role }: LoginPanelProps) {
  const content = copy[role];
  const isAdmin = role === "admin";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(() => {
    const code = searchParams.get("error");
    if (code === "forbidden") return content.forbidden;
    if (code === "config") {
      return "Sign-in is temporarily unavailable. Please try again later.";
    }
    return "";
  });
  const [status, setStatus] = useState<"idle" | "loading" | "forgot">("idle");
  const [info, setInfo] = useState("");

  function fail(message: string, title = "Sign in") {
    setError(message);
    toastError(message, title);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");

    if (!email.trim() || !password.trim()) {
      fail("Enter your email and password to continue.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      fail("Enter a valid email address.");
      return;
    }

    setStatus("loading");

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (signInError || !data.user) {
        setStatus("idle");
        fail(signInFailureMessage(signInError?.message));
        return;
      }

      if (isAdmin) {
        const { data: profile, error: profileError } = await supabase
          .from("admin_profiles")
          .select("id, role, is_active")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("[login/admin] profile load failed", profileError);
          await supabase.auth.signOut();
          setStatus("idle");
          fail(publicUnavailableMessage(content.deskLabel));
          return;
        }

        if (!profile || !profile.is_active) {
          await supabase.auth.signOut();
          setStatus("idle");
          fail(content.notAuthorised, "Access denied");
          return;
        }

        router.replace("/admin?welcome=1");
        router.refresh();
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("student_profiles")
        .select("id, is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("[login/student] profile load failed", profileError);
        await supabase.auth.signOut();
        setStatus("idle");
        fail(publicUnavailableMessage(content.deskLabel));
        return;
      }

      if (!profile || !profile.is_active) {
        await supabase.auth.signOut();
        setStatus("idle");
        fail(content.notAuthorised, "Access denied");
        return;
      }

      toastSuccess("You are signed in.", "Welcome");
      const nextRaw = searchParams.get("next");
      const nextPath =
        nextRaw &&
        nextRaw.startsWith("/student") &&
        !nextRaw.startsWith("//") &&
        !nextRaw.includes("://")
          ? nextRaw
          : "/student";
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      console.error("[login] sign-in failed", err);
      setStatus("idle");
      fail(
        publicActionMessage(
          err,
          "Could not reach authentication. Please try again.",
        ),
      );
    }
  }

  async function onForgotPassword() {
    setError("");
    setInfo("");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      const message = isAdmin
        ? "Enter your admin email, then try again."
        : "Enter the email on your application, then try again.";
      fail(message, content.forgotTitle);
      return;
    }
    setStatus("forgot");
    try {
      const result = isAdmin
        ? await requestAdminPasswordReset(email.trim())
        : await requestEnrolmentPasswordReset(email.trim());
      if (!result.ok) {
        fail(result.message, content.resetFailTitle);
        setStatus("idle");
        return;
      }
      setInfo(result.message);
      toastSuccess(result.message, content.resetOkTitle);
      setStatus("idle");
    } catch (err) {
      console.error("[login] password reset failed", err);
      fail(
        publicActionMessage(err, "Could not send access email. Please try again."),
        content.resetFailTitle,
      );
      setStatus("idle");
    }
  }

  return (
    <div className="flex flex-1 flex-col lg:grid lg:min-h-[min(70svh,44rem)] lg:grid-cols-2">
      <aside className="grain relative isolate hidden overflow-hidden border-r border-stone bg-mist px-10 py-12 text-ink lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.22),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(20,53,44,0.08),_transparent_50%)]"
          aria-hidden
        />

        <div className="relative z-10 max-w-md">
          <p className="animate-fade-rise text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
            {content.eyebrow}
          </p>
          <h1 className="animate-fade-rise-delay-1 mt-4 font-display text-[clamp(2.2rem,3.5vw,3.25rem)] leading-[0.95] tracking-[-0.02em] text-pine">
            {content.asideTitle}
          </h1>
          <p className="animate-fade-rise-delay-2 mt-5 text-base leading-relaxed text-ink/70">
            {content.asideBody}
          </p>
          {content.hints.length > 0 ? (
            <ul className="animate-fade-rise-delay-3 mt-10 space-y-3">
              {content.hints.map((hint) => (
                <li
                  key={hint}
                  className="flex items-center gap-3 text-sm tracking-wide text-ink/75"
                >
                  <span className="h-px w-6 shrink-0 bg-celadon" aria-hidden />
                  {hint}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-12 text-xs text-ink/45">
            Raising Disciples, Equipping The Local Church
          </p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col justify-center bg-mist px-5 py-10 sm:px-8 sm:py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
            {content.eyebrow}
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] tracking-[-0.02em] text-pine">
            {content.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70 sm:mt-3 sm:text-base">
            {content.lead}
          </p>

          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-5 sm:mt-10"
            noValidate
          >
            <div>
              <label
                htmlFor={`${role}-email`}
                className="mb-2 block text-sm font-medium tracking-wide text-ink"
              >
                Email
              </label>
              <input
                id={`${role}-email`}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-stone bg-white/50 px-4 py-3.5 text-base text-ink outline-none transition-[border-color,background-color] duration-300 placeholder:text-ink/35 focus:border-pine focus:bg-mist sm:py-3 sm:text-[0.95rem]"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor={`${role}-password`}
                  className="block text-sm font-medium tracking-wide text-ink"
                >
                  Password
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    disabled={status !== "idle"}
                    className="text-xs font-medium tracking-wide text-pine underline decoration-pine/30 underline-offset-4 disabled:opacity-50"
                  >
                    {status === "forgot" ? "Sending…" : "Forgot password?"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-xs font-medium tracking-wide text-pine underline decoration-pine/30 underline-offset-4"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <input
                id={`${role}-password`}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-stone bg-white/50 px-4 py-3.5 text-base text-ink outline-none transition-[border-color,background-color] duration-300 placeholder:text-ink/35 focus:border-pine focus:bg-mist sm:py-3 sm:text-[0.95rem]"
                placeholder={content.passwordPlaceholder}
              />
            </div>

            {error ? (
              <p className="text-sm text-red-800" role="alert">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="text-sm text-pine" role="status">
                {info}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={status === "loading"}
              className="inline-flex w-full items-center justify-center bg-pine px-6 py-3.5 text-[0.95rem] font-medium tracking-wide text-mist transition-colors duration-300 hover:bg-celadon disabled:opacity-60"
            >
              {status === "loading" ? "Signing in…" : content.submit}
            </button>
          </form>

          <div className="mt-8 space-y-3 border-t border-stone pt-6 text-sm text-ink/65">
            {role === "student" ? (
              <p>
                New applicant?{" "}
                <Link
                  href="/enrol"
                  className="font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:text-celadon"
                >
                  Enrol now
                </Link>
              </p>
            ) : (
              <p className="text-ink/55">Authorised staff only.</p>
            )}
            <p>
              {isAdmin ? (
                <Link
                  href="/login/student"
                  className="font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:text-celadon"
                >
                  Student sign-in
                </Link>
              ) : (
                <AdminEntryLink
                  className="font-medium text-pine underline decoration-pine/30 underline-offset-4 hover:text-celadon"
                  guestLabel="Admin sign-in"
                  memberLabel="Open admin desk"
                />
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
