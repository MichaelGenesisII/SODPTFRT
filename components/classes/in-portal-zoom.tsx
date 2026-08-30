"use client";

import { useEffect, useRef, useState } from "react";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
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
    maximumVideosInGalleryView?: number;
    customize?: {
      video?: {
        isResizable?: boolean;
        viewSizes?: {
          default?: { width: number; height: number };
          ribbon?: { width: number; height: number };
        };
      };
    };
  }) => Promise<void>;
  join: (opts: {
    signature: string;
    meetingNumber: string;
    password: string;
    userName: string;
    userEmail: string;
    zak?: string;
  }) => Promise<void>;
  updateVideoOptions?: (opts: {
    viewSizes?: {
      default?: { width: number; height: number };
      ribbon?: { width: number; height: number };
    };
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

/** Zoom caps component-view canvas size (see Meeting SDK resizing docs). */
function videoViewSizesForContainer(container: HTMLElement): {
  default: { width: number; height: number };
  ribbon: { width: number; height: number };
} {
  const rect = container.getBoundingClientRect();
  const width = Math.max(720, Math.min(Math.floor(rect.width || 960), 1440));
  const height = Math.max(411, Math.min(Math.floor(rect.height || 540), 810));
  return {
    default: { width, height },
    ribbon: {
      width: Math.min(316, width),
      height: Math.min(720, height),
    },
  };
}

async function syncVideoSize(
  client: ZoomEmbeddedClient | null,
  container: HTMLElement | null,
) {
  if (!client?.updateVideoOptions || !container) return;
  try {
    await client.updateVideoOptions({
      viewSizes: videoViewSizesForContainer(container),
    });
  } catch {
    // Non-fatal — user can still drag-resize when isResizable is on.
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
  const shellRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ZoomEmbeddedClient | null>(null);
  const missingNotifiedRef = useRef(false);
  const onMeetingMissingRef = useRef(onMeetingMissing);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
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
    function onFullscreenChange() {
      const active = document.fullscreenElement === shellRef.current;
      setFullscreen(active);
      void syncVideoSize(clientRef.current, rootRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (status !== "live") return;
    const container = rootRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      void syncVideoSize(clientRef.current, container);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [status]);

  function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement === shell) {
      void document.exitFullscreen();
      return;
    }
    void shell.requestFullscreen?.();
  }

  function performLeave() {
    setLeaving(true);
    if (document.fullscreenElement === shellRef.current) {
      void document.exitFullscreen();
    }
    const client = clientRef.current;
    clientRef.current = null;
    void safeLeave(client).finally(() => {
      setLeaving(false);
      setConfirmLeave(false);
      onLeave();
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function joinWithClient(
      client: ZoomEmbeddedClient,
      root: HTMLElement,
    ) {
      const viewSizes = videoViewSizesForContainer(root);
      await client.init({
        zoomAppRoot: root,
        language: "en-US",
        patchJsMedia: true,
        maximumVideosInGalleryView: 25,
        customize: {
          video: {
            isResizable: true,
            viewSizes,
          },
        },
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
              ? "You are hosting in the portal. Drag the corner to resize, or use Expand."
              : "You have joined in the portal. Drag the corner to resize, or use Expand.",
          );
          await syncVideoSize(clientRef.current, rootRef.current);
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
              ? "This meeting could not be opened in the browser. Try Host in Zoom app (that confirms the meeting exists). If the app works but the portal does not, App B needs Production Meeting SDK credentials and this site’s hostname on Zoom’s domain allow list."
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
    <div
      ref={shellRef}
      className={`border border-stone bg-ink/5 ${fullscreen ? "bg-black" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone bg-mist px-3 py-2">
        <p className="max-w-[min(100%,40rem)] text-xs text-ink/60">{message}</p>
        <div className="flex flex-wrap items-center gap-2">
          {status === "live" ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="border border-stone px-2.5 py-1 text-xs text-ink/70"
            >
              {fullscreen ? "Exit expand" : "Expand"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            className="border border-stone px-2.5 py-1 text-xs text-ink/70"
          >
            Leave portal Zoom
          </button>
        </div>
      </div>
      {status === "error" ? (
        <p className="px-4 py-8 text-center text-sm text-red-900">{message}</p>
      ) : (
        <div
          ref={rootRef}
          className={`w-full bg-black/90 ${
            fullscreen
              ? "h-[calc(100vh-3rem)] min-h-[calc(100vh-3rem)]"
              : "min-h-[min(80vh,54rem)] h-[min(80vh,54rem)]"
          }`}
        />
      )}
      {status === "live" && !fullscreen ? (
        <p className="border-t border-stone bg-mist/60 px-3 py-2 text-[0.65rem] leading-relaxed text-ink/50">
          In-portal Zoom is a simplified embed — not the full Zoom desktop app.
          For breakout rooms, full host controls, recording, and gallery layout,
          use{" "}
          <span className="font-medium text-ink/65">Host in Zoom app</span> on
          the class desk.
        </p>
      ) : null}
      <DeskConfirmModal
        open={confirmLeave}
        onClose={() => !leaving && setConfirmLeave(false)}
        onConfirm={performLeave}
        eyebrow="In-portal Zoom"
        title={
          session.role === 1 ? "Leave the portal player?" : "Leave this class?"
        }
        body={
          session.role === 1 ? (
            <>
              You will stop hosting in the browser, but the meeting may still
              be live on Zoom. When class is over, use{" "}
              <span className="font-medium text-ink/80">End live Zoom</span> or{" "}
              <span className="font-medium text-ink/80">Delete</span> on the
              class desk to clear it from the host calendar.
            </>
          ) : (
            <>
              You will leave the in-portal player. You can join again from
              Classes while the session is open.
            </>
          )
        }
        confirmLabel={session.role === 1 ? "Leave player" : "Leave class"}
        busy={leaving}
        busyLabel="Leaving…"
      />
    </div>
  );
}
