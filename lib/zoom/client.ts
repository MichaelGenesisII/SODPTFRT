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

/** Meeting SDK / REST expect digits-only meeting numbers (no spaces or dashes). */
export function normalizeZoomMeetingNumber(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Parse `/j/{id}` or `/w/{id}` from a Zoom join/start URL. */
export function parseMeetingIdFromJoinUrl(
  joinUrl: string | null | undefined,
): string | null {
  const raw = String(joinUrl ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/(?:j|w)\/(\d+)/i);
    return match?.[1] ?? null;
  } catch {
    const loose = raw.match(/\/(?:j|w)\/(\d+)/i);
    return loose?.[1] ?? null;
  }
}

/** Prefer join URL digits — Zoom's JSON `id` can disagree after parsing. */
export function canonicalZoomMeetingId(input: {
  id: unknown;
  join_url?: string | null;
  start_url?: string | null;
}): string {
  const fromJoin =
    parseMeetingIdFromJoinUrl(input.join_url) ??
    parseMeetingIdFromJoinUrl(input.start_url);
  const fromApi = normalizeZoomMeetingNumber(String(input.id ?? ""));
  if (fromJoin && fromApi && fromJoin !== fromApi) {
    console.warn("[zoom] meeting id mismatch; using join URL", {
      apiId: fromApi,
      joinUrlId: fromJoin,
    });
    return fromJoin;
  }
  return fromJoin || fromApi;
}

function extractMeetingIdFromJson(raw: string): string | null {
  const quoted = raw.match(/"id"\s*:\s*"(\d+)"/);
  if (quoted?.[1]) return quoted[1];
  const numeric = raw.match(/"id"\s*:\s*(\d+)/);
  if (numeric?.[1]) return numeric[1];
  return null;
}

function mapZoomMeetingPayload(data: {
  id: unknown;
  uuid: string;
  join_url: string;
  start_url: string;
  password?: string;
}): ZoomMeetingCreated {
  const id = canonicalZoomMeetingId(data);
  return {
    id,
    uuid: data.uuid,
    join_url: data.join_url,
    start_url: data.start_url,
    password: data.password ?? null,
  };
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
          ? `Zoom is missing scopes (${missing}). Add them on App A, Activate, then retry.`
          : "Zoom App A is missing meeting scopes. Add them, Activate, then retry.",
      );
    }
    throw new Error(`Zoom API ${path} failed (${res.status}): ${text.slice(0, 280)}`);
  }
  if (res.status === 204) return undefined as T;
  const rawText = await res.text();
  if (!rawText) return undefined as T;
  return JSON.parse(rawText) as T;
}

async function zoomFetchRaw(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; rawText: string }> {
  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const rawText = await res.text();
  if (!res.ok) {
    if (isZoomScopeError(res.status, rawText)) {
      clearZoomAccessTokenCache();
      const missing = zoomScopeHint(rawText);
      throw new Error(
        missing
          ? `Zoom is missing scopes (${missing}). Add them on App A, Activate, then retry.`
          : "Zoom App A is missing meeting scopes. Add them, Activate, then retry.",
      );
    }
    throw new Error(
      `Zoom API ${path} failed (${res.status}): ${rawText.slice(0, 280)}`,
    );
  }
  return { status: res.status, rawText };
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

  const start = new Date(input.startTime);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Invalid Zoom meeting start time.");
  }

  // Zoom expects local wall time (no Z) when timezone is set.
  const startLocal = formatZoomLondonLocal(start);

  const encodedHost = encodeURIComponent(host);
  const { rawText } = await zoomFetchRaw(`/users/${encodedHost}/meetings`, {
    method: "POST",
    body: JSON.stringify({
      topic: input.topic.slice(0, 200),
      type: 2, // scheduled
      start_time: startLocal,
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

  const data = JSON.parse(rawText) as {
    id: unknown;
    uuid: string;
    join_url: string;
    start_url: string;
    password?: string;
  };
  const idFromRaw = extractMeetingIdFromJson(rawText);
  if (idFromRaw) data.id = idFromRaw;

  const created = mapZoomMeetingPayload(data);

  // Confirm Zoom actually registered this id before the desk stores it.
  let verified: ZoomMeetingCreated | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    verified = await getZoomMeeting(created.id);
    if (verified) break;
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 400 + attempt * 400));
    }
  }
  if (!verified) {
    console.error("[zoom create] meeting not found after create", {
      id: created.id,
      join_url: created.join_url,
    });
    throw new Error("Zoom did not return a usable meeting id.");
  }

  return verified;
}

/**
 * Fetch a scheduled meeting by numeric id.
 * Returns null when Zoom reports not found (deleted / never existed).
 */
export async function getZoomMeeting(
  meetingId: string,
): Promise<ZoomMeetingCreated | null> {
  const raw = String(meetingId ?? "").trim();
  if (!raw) return null;

  const numeric = normalizeZoomMeetingNumber(raw);
  const pathId = numeric || raw;

  try {
    const data = await zoomFetch<{
      id: unknown;
      uuid: string;
      join_url: string;
      start_url: string;
      password?: string;
    }>(`/meetings/${encodeURIComponent(pathId)}`);
    return mapZoomMeetingPayload(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\(404\)/.test(message)) return null;
    throw error;
  }
}

/**
 * Resolve a class row to a live Zoom meeting — tries stored id, join URL id,
 * then UUID before deciding the meeting is missing.
 */
export async function resolveZoomMeetingForClass(input: {
  zoom_meeting_id?: string | null;
  zoom_meeting_uuid?: string | null;
  zoom_join_url?: string | null;
}): Promise<ZoomMeetingCreated | null> {
  const candidates: string[] = [];
  const push = (value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;
    const norm = normalizeZoomMeetingNumber(raw) || raw;
    if (!candidates.includes(norm)) candidates.push(norm);
  };

  push(input.zoom_meeting_id);
  push(parseMeetingIdFromJoinUrl(input.zoom_join_url));
  push(input.zoom_meeting_uuid);

  for (const candidate of candidates) {
    const meeting = await getZoomMeeting(candidate);
    if (meeting) return meeting;
  }
  return null;
}

/** `yyyy-MM-ddTHH:mm:ss` in Europe/London (no offset) — Zoom scheduled meeting format. */
function formatZoomLondonLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
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

/**
 * End one live meeting (kicks all participants).
 * Returns whether Zoom confirmed an end — not found / already ended is
 * "already_clear" so callers do not toast a false "ended" success.
 */
export async function endZoomMeeting(
  meetingId: string,
): Promise<"ended" | "already_clear"> {
  const id = normalizeZoomMeetingNumber(meetingId) || String(meetingId).trim();
  if (!id) throw new Error("Missing Zoom meeting id.");

  try {
    await zoomFetch<void>(`/meetings/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify({ action: "end" }),
    });
    return "ended";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Not live / already ended / gone — nothing to clear.
    if (
      /\(404\)|\(400\)|not (found|exist)|already|not in progress|3001|3610/i.test(
        message,
      )
    ) {
      return "already_clear";
    }
    throw error;
  }
}

/**
 * Delete a scheduled (or ended) meeting from the Zoom account calendar.
 * Returns "deleted" or "already_gone" (404 / not found). Live meetings
 * should be ended first when possible — Zoom may reject delete while live.
 */
export async function deleteZoomMeeting(
  meetingId: string,
): Promise<"deleted" | "already_gone"> {
  const id = normalizeZoomMeetingNumber(meetingId) || String(meetingId).trim();
  if (!id) throw new Error("Missing Zoom meeting id.");

  try {
    await zoomFetch<void>(`/meetings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return "deleted";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\(404\)|not (found|exist)|3001|3610/i.test(message)) {
      return "already_gone";
    }
    throw error;
  }
}

/** Stored id and join URL can disagree — try every candidate. */
export function zoomMeetingIdCandidates(input: {
  meetingId?: string | null;
  joinUrl?: string | null;
}): string[] {
  const out: string[] = [];
  const push = (value?: string | null) => {
    const norm = normalizeZoomMeetingNumber(value) || String(value ?? "").trim();
    if (norm && !out.includes(norm)) out.push(norm);
  };
  push(input.meetingId);
  push(parseMeetingIdFromJoinUrl(input.joinUrl));
  return out;
}

export type RemoveZoomMeetingResult =
  | { ok: true; status: "removed" | "already_gone" }
  | { ok: false; lastError: unknown };

/** End (if live) and delete scheduled meetings for a class desk row. */
export async function removeZoomMeetingsFromHost(input: {
  meetingId?: string | null;
  joinUrl?: string | null;
}): Promise<RemoveZoomMeetingResult> {
  const ids = zoomMeetingIdCandidates(input);
  if (!ids.length) return { ok: true, status: "already_gone" };

  let removedAny = false;
  let goneAny = false;
  let lastError: unknown = null;

  for (const id of ids) {
    try {
      await endZoomMeeting(id);
      const deleted = await deleteZoomMeeting(id);
      if (deleted === "deleted") removedAny = true;
      if (deleted === "already_gone") goneAny = true;
    } catch (error) {
      console.error("[zoom] remove meeting candidate failed", { id, error });
      lastError = error;
    }
  }

  if (removedAny || goneAny) {
    return { ok: true, status: removedAny ? "removed" : "already_gone" };
  }
  if (lastError) return { ok: false, lastError };
  return { ok: true, status: "already_gone" };
}

/** End a class meeting by id even when list-live omits it (id mismatch). */
export async function endClassZoomMeetingCandidates(input: {
  meetingId?: string | null;
  joinUrl?: string | null;
}): Promise<string[]> {
  const endedIds: string[] = [];
  for (const id of zoomMeetingIdCandidates(input)) {
    try {
      const result = await endZoomMeeting(id);
      if (result === "ended") endedIds.push(id);
    } catch (error) {
      console.warn("[zoom] end class meeting candidate failed", { id, error });
    }
  }
  return endedIds;
}

/**
 * End every live meeting on the host account.
 * Only meetings Zoom lists as **live** are ended — a scheduled (not started)
 * class meeting id is never treated as a successful end.
 */
export async function endAllLiveHostMeetings(options?: {
  alsoMeetingId?: string | null;
}): Promise<{ endedIds: string[]; topics: string[]; skippedIdleId: string | null }> {
  const live = await listLiveHostMeetings();
  const liveByNorm = new Map(
    live.map((m) => [normalizeZoomMeetingNumber(m.id) || m.id, m]),
  );

  const alsoNorm = normalizeZoomMeetingNumber(options?.alsoMeetingId) || "";
  const idsToEnd = new Set(liveByNorm.keys());

  // If this class's meeting is live (possibly under a different string form),
  // ensure it is included. Do **not** end idle scheduled meetings — Zoom's
  // status/end on a non-live id is a no-op / error and used to produce a
  // false "Ended live meeting" toast.
  if (alsoNorm && liveByNorm.has(alsoNorm)) {
    idsToEnd.add(alsoNorm);
  }

  const endedIds: string[] = [];
  const topics: string[] = [];
  for (const normId of idsToEnd) {
    const row = liveByNorm.get(normId);
    const rawId = row?.id ?? normId;
    const result = await endZoomMeeting(rawId);
    if (result === "ended") {
      endedIds.push(rawId);
      topics.push(row?.topic ?? rawId);
    }
  }

  return {
    endedIds,
    topics,
    skippedIdleId:
      alsoNorm && !liveByNorm.has(alsoNorm) ? alsoNorm : null,
  };
}
