"use client";

import { useEffect, useRef, useState } from "react";
import type { InPortalZoomSession } from "@/lib/zoom/types";

type Props = {
  session: InPortalZoomSession;
  onLeave: () => void;
  /** Called once when Zoom reports the meeting id is gone (3610 / 3001). */
  onMeetingMissing?: () => void;
};

/** Keep in sync with Zoom Meeting SDK web releases. */
const ZOOM_SDK_VERSION = "6.2.0";

const ZOOM_VENDOR_SCRIPTS = [
  `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/react.min.js`,
  `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/react-dom.min.js`,
  `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/redux.min.js`,
  `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/redux-thunk.min.js`,
  `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/lodash.min.js`,
] as const;

/** Official CDN path (not versioned folder) — see Zoom get-started docs. */
const ZOOM_EMBED_SRC = `https://source.zoom.us/zoom-meeting-embedded-${ZOOM_SDK_VERSION}.min.js`;

type ZoomEmbeddedClient = {
  init: (opts: {
    zoomAppRoot: HTMLElement;
    language: string;
    patchJsMedia?: boolean;
  }) => Promise<void>;
  join: (opts: {
    signature: string;
    meetingNumber: string;
    password: string;
    userName: string;
    userEmail: string;
    zak?: string;
  }) => Promise<void>;
  leaveMeeting?: () => void | Promise<void>;
  destroy?: () => void | Promise<void>;
};

type ZoomEmbeddedFactory = {
  createClient: () => ZoomEmbeddedClient;
};

declare global {
  interface Window {
    ZoomMtgEmbedded?: ZoomEmbeddedFactory;
  }
}

function loadScriptOnce(src: string, marker: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-zoom-sdk="${marker}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load Zoom SDK asset (${marker}).`)),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.zoomSdk = marker;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () =>
      reject(new Error(`Failed to load Zoom SDK asset (${marker}).`));
    document.body.appendChild(script);
  });
}

async function loadZoomEmbeddedScript(): Promise<ZoomEmbeddedFactory> {
  if (typeof window === "undefined") {
    throw new Error("Zoom embed is browser-only.");
  }
  if (window.ZoomMtgEmbedded) {
    return window.ZoomMtgEmbedded;
  }

  for (const [index, src] of ZOOM_VENDOR_SCRIPTS.entries()) {
    await loadScriptOnce(src, `vendor-${ZOOM_SDK_VERSION}-${index}`);
  }
  await loadScriptOnce(ZOOM_EMBED_SRC, `embedded-${ZOOM_SDK_VERSION}`);

  if (!window.ZoomMtgEmbedded) {
    throw new Error("Zoom embed script loaded without ZoomMtgEmbedded.");
  }
  return window.ZoomMtgEmbedded;
}

/** Zoom SDK often rejects with plain objects, not Error instances. */
function formatZoomEmbedError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const row = error as {
      reason?: unknown;
      errorMessage?: unknown;
      message?: unknown;
      errorCode?: unknown;
      type?: unknown;
    };
    const reason =
      (typeof row.reason === "string" && row.reason) ||
      (typeof row.errorMessage === "string" && row.errorMessage) ||
      (typeof row.message === "string" && row.message) ||
      "";
    const code =
      row.errorCode != null
        ? ` (${String(row.errorCode)}${row.type ? ` · ${String(row.type)}` : ""})`
        : "";
    if (reason) return `${reason}${code}`;
    try {
      return JSON.stringify(error);
    } catch {
      // fall through
    }
  }
  return "Could not start in-portal Zoom.";
}

function isMeetingInProgressError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { errorCode?: unknown; reason?: unknown };
  if (row.errorCode === 3000) return true;
  return (
    typeof row.reason === "string" &&
    /already has other meetings in progress/i.test(row.reason)
  );
}

async function safeLeave(client: ZoomEmbeddedClient | null) {
  if (!client) return;
  try {
    await client.leaveMeeting?.();
  } catch {
    // ignore — meeting may already be gone
  }
  try {
    await client.destroy?.();
  } catch {
    // ignore
  }
}

/**
 * Embeds Zoom Meeting SDK (component view) via Zoom's CDN + vendor scripts.
 * npm `@zoom/meetingsdk` peers React 18 and conflicts with this app's React 19,
 * so CDN remains the supported path. External Zoom app links stay the fallback.
 *
 * Note: Zoom's API is always `client.join(...)`. Hosting is JWT role 1 + host ZAK,
 * not a separate "create host" call.
 */
export function InPortalZoom({ session, onLeave, onMeetingMissing }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ZoomEmbeddedClient | null>(null);
  const missingNotifiedRef = useRef(false);
  const onMeetingMissingRef = useRef(onMeetingMissing);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const [message, setMessage] = useState(
    session.role === 1
      ? "Starting meeting as host…"
      : "Joining the meeting…",
  );

  useEffect(() => {
    onMeetingMissingRef.current = onMeetingMissing;
  }, [onMeetingMissing]);

  useEffect(() => {
    missingNotifiedRef.current = false;
  }, [session.meetingNumber, session.signature]);

  useEffect(() => {
    let cancelled = false;

    async function joinWithClient(
      client: ZoomEmbeddedClient,
      root: HTMLElement,
    ) {
      await client.init({
        zoomAppRoot: root,
        language: "en-US",
        patchJsMedia: true,
      });

      if (session.role === 1 && !session.zak) {
        throw new Error(
          "Host credentials are missing. Use Host in Zoom app instead.",
        );
      }

      // sdkKey removed from joinOptions since Meeting SDK v4 — key lives in the JWT.
      // Hosting still uses join(); role 1 + zak starts the meeting as host.
      await client.join({
        signature: session.signature,
        meetingNumber: session.meetingNumber,
        password: session.password,
        userName: session.userName,
        userEmail: session.userEmail,
        ...(session.zak ? { zak: session.zak } : {}),
      });
    }

    async function start() {
      try {
        setStatus("loading");
        setMessage(
          session.role === 1
            ? "Starting meeting as host…"
            : "Joining the meeting…",
        );

        const ZoomEmbed = await loadZoomEmbeddedScript();
        if (cancelled || !rootRef.current) return;

        // Drop any prior in-page session (Strict Mode remount / retry).
        await safeLeave(clientRef.current);
        clientRef.current = null;

        const client = ZoomEmbed.createClient();
        clientRef.current = client;

        try {
          await joinWithClient(client, rootRef.current);
        } catch (firstError) {
          if (!isMeetingInProgressError(firstError)) throw firstError;
          // Clear sticky SDK state, then retry once.
          await safeLeave(client);
          if (cancelled || !rootRef.current) return;
          const retry = ZoomEmbed.createClient();
          clientRef.current = retry;
          await joinWithClient(retry, rootRef.current);
        }

        if (!cancelled) {
          setStatus("live");
          setMessage(
            session.role === 1
              ? "You are hosting in the portal."
              : "You have joined in the portal.",
          );
        }
      } catch (error) {
        if (cancelled) return;
        const detail = formatZoomEmbedError(error);
        console.error("[in-portal-zoom]", detail, error);
        setStatus("error");
        const missingMeeting =
          /meeting does not exist|3610|3001/i.test(detail);
        if (
          missingMeeting &&
          onMeetingMissingRef.current &&
          !missingNotifiedRef.current
        ) {
          missingNotifiedRef.current = true;
          onMeetingMissingRef.current();
        }
        setMessage(
          /already has other meetings/i.test(detail)
            ? "Another Zoom session is still open in this browser. Leave it or close other portal Zoom tabs, then try again — or use Host / Join in the Zoom app."
            : missingMeeting
              ? "This Zoom meeting is no longer available. Try Host in portal again (it can refresh the meeting), or use Host in Zoom app."
              : `${detail} You can use the Zoom app link instead.`,
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      const client = clientRef.current;
      clientRef.current = null;
      void safeLeave(client);
    };
  }, [session]);

  return (
    <div className="border border-stone bg-ink/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone bg-mist px-3 py-2">
        <p className="text-xs text-ink/60">{message}</p>
        <button
          type="button"
          onClick={() => {
            const client = clientRef.current;
            clientRef.current = null;
            void safeLeave(client).finally(onLeave);
          }}
          className="border border-stone px-2.5 py-1 text-xs text-ink/70"
        >
          Leave portal Zoom
        </button>
      </div>
      {status === "error" ? (
        <p className="px-4 py-8 text-center text-sm text-red-900">{message}</p>
      ) : (
        <div
          ref={rootRef}
          className="min-h-[min(70vh,32rem)] w-full bg-black/90"
        />
      )}
    </div>
  );
}
