/**
 * Zoom Meeting SDK auth (in-portal host / join).
 * Env: ZOOM_MEETING_SDK_KEY, ZOOM_MEETING_SDK_SECRET
 * Host ZAK uses Server-to-Server OAuth (ZOOM_ACCOUNT_ID / CLIENT_* / HOST_USER_ID).
 */

import { createHmac } from "crypto";
import { zoomConfigured } from "@/lib/zoom/client";

export function meetingSdkConfigured(): boolean {
  return Boolean(
    process.env.ZOOM_MEETING_SDK_KEY && process.env.ZOOM_MEETING_SDK_SECRET,
  );
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Meeting SDK JWT — role 1 = host, 0 = participant. */
export function createMeetingSdkSignature(input: {
  meetingNumber: string;
  role: 0 | 1;
}): string {
  const sdkKey = process.env.ZOOM_MEETING_SDK_KEY?.trim();
  const sdkSecret = process.env.ZOOM_MEETING_SDK_SECRET?.trim();
  if (!sdkKey || !sdkSecret) {
    throw new Error(
      "Meeting SDK is not configured. Set ZOOM_MEETING_SDK_KEY and ZOOM_MEETING_SDK_SECRET.",
    );
  }

  // Digits only — spaces/dashes in stored ids break Meeting SDK join (3610).
  const meetingNumber = String(input.meetingNumber).replace(/\D/g, "");
  if (!meetingNumber) {
    throw new Error("Missing Zoom meeting number for Meeting SDK signature.");
  }

  // Zoom requires exp/tokenExp at least 1800s after iat.
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  // Official web JWT uses appKey only (Client ID). Do not mix in App A OAuth ids.
  const payload = base64UrlJson({
    appKey: sdkKey,
    mn: meetingNumber,
    role: input.role,
    iat,
    exp,
    tokenExp: exp,
  });
  const signature = createHmac("sha256", sdkSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function getS2SAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom Server-to-Server OAuth is not configured.");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const url = new URL("https://zoom.us/oauth/token");
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", accountId);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom auth failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Host Zoom Access Key — required to start a meeting in the Meeting SDK. */
export async function fetchHostZakToken(): Promise<string> {
  if (!zoomConfigured()) {
    throw new Error(
      "Host ZAK needs ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, and ZOOM_HOST_USER_ID.",
    );
  }
  const host = process.env.ZOOM_HOST_USER_ID!;
  const token = await getS2SAccessToken();
  const res = await fetch(
    `https://api.zoom.us/v2/users/${encodeURIComponent(host)}/token?type=zak`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not fetch host ZAK (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error("Zoom returned an empty ZAK token.");
  return json.token;
}
