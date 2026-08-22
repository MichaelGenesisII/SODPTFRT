/**
 * Zoom Server-to-Server OAuth client.
 * Env: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_HOST_USER_ID
 * (host user id or email used to create meetings)
 */

export type ZoomMeetingCreated = {
  id: string;
  uuid: string;
  join_url: string;
  start_url: string;
  password: string | null;
};

export type ZoomParticipant = {
  user_email: string;
  name: string;
  join_time: string | null;
  leave_time: string | null;
  duration: number; // seconds
};

export function zoomConfigured(): boolean {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
      process.env.ZOOM_CLIENT_ID &&
      process.env.ZOOM_CLIENT_SECRET &&
      process.env.ZOOM_HOST_USER_ID,
  );
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function clearZoomAccessTokenCache() {
  cachedToken = null;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      "Zoom is not configured. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.",
    );
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

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

function isZoomScopeError(status: number, body: string): boolean {
  return (
    status === 400 &&
    (/4711/.test(body) || /does not contain scopes/i.test(body))
  );
}

function zoomScopeHint(body: string): string | null {
  const match = body.match(/scopes:\s*\[([^\]]+)\]/i);
  if (!match?.[1]) return null;
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .join(", ");
}

async function zoomFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    if (isZoomScopeError(res.status, text)) {
      // Force a fresh token after scopes are added + Activate.
      clearZoomAccessTokenCache();
      const missing = zoomScopeHint(text);
      throw new Error(
        missing
          ? `Zoom App A is missing scopes: ${missing}. Add them on the Server-to-Server app, Activate again, then retry.`
          : "Zoom App A is missing required meeting scopes. Add them on the Server-to-Server app, Activate again, then retry.",
      );
    }
    throw new Error(`Zoom API ${path} failed (${res.status}): ${text.slice(0, 280)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function createZoomMeeting(input: {
  topic: string;
  startTime: string; // ISO
  durationMinutes: number;
  agenda?: string;
}): Promise<ZoomMeetingCreated> {
  const host = process.env.ZOOM_HOST_USER_ID;
  if (!host) {
    throw new Error("ZOOM_HOST_USER_ID is not set.");
  }

  const encodedHost = encodeURIComponent(host);
  const data = await zoomFetch<{
    id: number | string;
    uuid: string;
    join_url: string;
    start_url: string;
    password?: string;
  }>(`/users/${encodedHost}/meetings`, {
    method: "POST",
    body: JSON.stringify({
      topic: input.topic.slice(0, 200),
      type: 2, // scheduled
      start_time: input.startTime,
      duration: input.durationMinutes,
      timezone: "Europe/London",
      agenda: input.agenda?.slice(0, 2000) || undefined,
      settings: {
        join_before_host: true,
        waiting_room: false,
        mute_upon_entry: true,
        meeting_authentication: false,
      },
    }),
  });

  return {
    id: String(data.id),
    uuid: data.uuid,
    join_url: data.join_url,
    start_url: data.start_url,
    password: data.password ?? null,
  };
}

/** Double-encode UUID when required by Zoom report endpoints. */
function encodeMeetingUuid(uuid: string): string {
  const trimmed = uuid.trim();
  if (trimmed.includes("/") || trimmed.startsWith("/")) {
    return encodeURIComponent(encodeURIComponent(trimmed));
  }
  return encodeURIComponent(trimmed);
}

/**
 * Past-meeting participant report. Meeting must have ended.
 * Prefers UUID; falls back to numeric meeting id.
 */
export async function fetchMeetingParticipants(input: {
  meetingUuid?: string | null;
  meetingId?: string | null;
}): Promise<ZoomParticipant[]> {
  const candidates: string[] = [];
  if (input.meetingUuid) candidates.push(encodeMeetingUuid(input.meetingUuid));
  if (input.meetingId) candidates.push(encodeURIComponent(input.meetingId));

  if (!candidates.length) {
    throw new Error("No Zoom meeting id to sync.");
  }

  let lastError: Error | null = null;
  for (const id of candidates) {
    try {
      const aggregated = new Map<string, ZoomParticipant>();
      let nextPageToken = "";
      do {
        const qs = new URLSearchParams({ page_size: "300" });
        if (nextPageToken) qs.set("next_page_token", nextPageToken);
        const page = await zoomFetch<{
          participants?: {
            user_email?: string;
            name?: string;
            join_time?: string;
            leave_time?: string;
            duration?: number;
          }[];
          next_page_token?: string;
        }>(`/report/meetings/${id}/participants?${qs.toString()}`);

        for (const row of page.participants ?? []) {
          const email = (row.user_email ?? "").trim().toLowerCase();
          if (!email) continue;
          const duration = Math.max(0, Number(row.duration) || 0);
          const prev = aggregated.get(email);
          if (prev) {
            prev.duration += duration;
            if (row.join_time && (!prev.join_time || row.join_time < prev.join_time)) {
              prev.join_time = row.join_time;
            }
            if (row.leave_time && (!prev.leave_time || row.leave_time > prev.leave_time)) {
              prev.leave_time = row.leave_time;
            }
          } else {
            aggregated.set(email, {
              user_email: email,
              name: row.name ?? "",
              join_time: row.join_time ?? null,
              leave_time: row.leave_time ?? null,
              duration,
            });
          }
        }
        nextPageToken = page.next_page_token ?? "";
      } while (nextPageToken);

      return [...aggregated.values()];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Could not load Zoom participants.");
}

export type LiveZoomMeeting = {
  id: string;
  topic: string;
};

/** Live meetings currently running for the configured host user. */
export async function listLiveHostMeetings(): Promise<LiveZoomMeeting[]> {
  const host = process.env.ZOOM_HOST_USER_ID;
  if (!host) {
    throw new Error("ZOOM_HOST_USER_ID is not set.");
  }

  const encodedHost = encodeURIComponent(host);
  const page = await zoomFetch<{
    meetings?: { id?: number | string; topic?: string }[];
  }>(`/users/${encodedHost}/meetings?type=live&page_size=100`);

  return (page.meetings ?? [])
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      topic: (row.topic ?? "Untitled meeting").trim() || "Untitled meeting",
    }))
    .filter((row) => Boolean(row.id));
}

/** End one live meeting (kicks all participants). Idempotent if already ended. */
export async function endZoomMeeting(meetingId: string): Promise<void> {
  const id = String(meetingId).replace(/\s+/g, "");
  if (!id) throw new Error("Missing Zoom meeting id.");

  try {
    await zoomFetch<void>(`/meetings/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify({ action: "end" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Already ended / not found — treat as cleared.
    if (/\(404\)|\(400\).*not (found|exist)|already/i.test(message)) {
      return;
    }
    throw error;
  }
}

/**
 * End every live meeting on the host account.
 * Optionally also force-end a known meeting id (this class) even if Zoom
 * did not list it as live yet.
 */
export async function endAllLiveHostMeetings(options?: {
  alsoMeetingId?: string | null;
}): Promise<{ endedIds: string[]; topics: string[] }> {
  const live = await listLiveHostMeetings();
  const ids = new Set(live.map((m) => m.id));
  const topics = new Map(live.map((m) => [m.id, m.topic]));

  const also = options?.alsoMeetingId?.replace(/\s+/g, "") || "";
  if (also) ids.add(also);

  const endedIds: string[] = [];
  for (const id of ids) {
    await endZoomMeeting(id);
    endedIds.push(id);
  }

  return {
    endedIds,
    topics: endedIds.map((id) => topics.get(id) ?? id),
  };
}
