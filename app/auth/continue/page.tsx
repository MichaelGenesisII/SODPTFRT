import { redirect } from "next/navigation";
import { safeAuthContinuePath } from "@/lib/auth/safe-next-path";

type AuthContinuePageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

/**
 * Brief hand-off after login middleware redirects.
 * Server redirect keeps this route free of client hydration races.
 */
export default async function AuthContinuePage({
  searchParams,
}: AuthContinuePageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.next) ? params.next[0] : params.next;
  redirect(safeAuthContinuePath(raw));
}
