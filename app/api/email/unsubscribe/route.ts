import { NextResponse } from "next/server";
import { recordCampaignUnsubscribe } from "@/app/unsubscribe/actions";

export const runtime = "nodejs";

/**
 * One-click List-Unsubscribe (RFC 8058).
 * Providers POST with body `List-Unsubscribe=One-Click`.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("t")?.trim() || "";

  if (!token) {
    try {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const form = await request.formData();
        token = String(form.get("t") || "").trim();
      } else if (contentType.includes("application/json")) {
        const body = (await request.json().catch(() => null)) as {
          t?: string;
        } | null;
        token = body?.t?.trim() || "";
      }
    } catch {
      // ignore body parse errors
    }
  }

  if (!token) {
    return NextResponse.json(
      { ok: false, message: "Missing unsubscribe token." },
      { status: 400 },
    );
  }

  const result = await recordCampaignUnsubscribe(token, "one-click");
  return NextResponse.json(
    { ok: result.ok, message: result.message },
    { status: result.ok ? 200 : 400 },
  );
}

/** Allow GET for clients that open the List-Unsubscribe HTTPS URL. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t")?.trim() || "";
  if (!token) {
    return NextResponse.redirect(new URL("/unsubscribe", request.url));
  }
  const result = await recordCampaignUnsubscribe(token, "one-click");
  const dest = new URL("/unsubscribe", request.url);
  dest.searchParams.set("t", token);
  if (!result.ok) dest.searchParams.set("err", "1");
  return NextResponse.redirect(dest);
}
