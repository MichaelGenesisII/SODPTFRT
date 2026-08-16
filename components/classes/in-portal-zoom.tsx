"use client";

import { useEffect, useRef, useState } from "react";
import type { InPortalZoomSession } from "@/lib/zoom/types";

type Props = {
  session: InPortalZoomSession;
  onLeave: () => void;
};

const ZOOM_SDK_VERSION = "6.2.0";
const ZOOM_EMBED_SRC = `https://source.zoom.us/${ZOOM_SDK_VERSION}/zoom-meeting-embedded-${ZOOM_SDK_VERSION}.min.js`;

type ZoomEmbeddedClient = {
  init: (opts: {
    zoomAppRoot: HTMLElement;
    language: string;
    patchJsMedia?: boolean;
  }) => Promise<void>;
  join: (opts: {
    signature: string;
    sdkKey: string;
    meetingNumber: string;
    password: string;
    userName: string;
    userEmail: string;
    zak?: string;
  }) => Promise<void>;
  leaveMeeting?: () => void;
};

type ZoomEmbeddedFactory = {
  createClient: () => ZoomEmbeddedClient;
};

declare global {
  interface Window {
    ZoomMtgEmbedded?: ZoomEmbeddedFactory;
  }
}

function loadZoomEmbeddedScript(): Promise<ZoomEmbeddedFactory> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Zoom embed is browser-only."));
  }
  if (window.ZoomMtgEmbedded) {
    return Promise.resolve(window.ZoomMtgEmbedded);
  }

  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-zoom-embedded="${ZOOM_SDK_VERSION}"]`,
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => {
        if (window.ZoomMtgEmbedded) resolve(window.ZoomMtgEmbedded);
        else reject(new Error("Zoom embed script loaded without ZoomMtgEmbedded."));
      });
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Zoom Meeting SDK script.")),
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = ZOOM_EMBED_SRC;
    script.async = true;
    script.dataset.zoomEmbedded = ZOOM_SDK_VERSION;
    script.onload = () => {
      if (window.ZoomMtgEmbedded) resolve(window.ZoomMtgEmbedded);
      else reject(new Error("Zoom embed script loaded without ZoomMtgEmbedded."));
    };
    script.onerror = () =>
      reject(new Error("Failed to load Zoom Meeting SDK from CDN."));
    document.body.appendChild(script);
  });
}

/**
 * Embeds Zoom Meeting SDK (component view) via Zoom's CDN.
 * Avoids bundling `@zoom/meetingsdk` through Turbopack (React 19 / missing
 * `@zoom/download-manager`). External Zoom app links remain the fallback.
 */
export function InPortalZoom({ session, onLeave }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ZoomEmbeddedClient | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const [message, setMessage] = useState("Opening Zoom in the portal…");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const ZoomEmbed = await loadZoomEmbeddedScript();
        if (cancelled || !rootRef.current) return;

        const client = ZoomEmbed.createClient();
        clientRef.current = client;

        await client.init({
          zoomAppRoot: rootRef.current,
          language: "en-US",
          patchJsMedia: true,
        });

        await client.join({
          signature: session.signature,
          sdkKey: session.sdkKey,
          meetingNumber: session.meetingNumber,
          password: session.password,
          userName: session.userName,
          userEmail: session.userEmail,
          ...(session.zak ? { zak: session.zak } : {}),
        });

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
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not start in-portal Zoom. Use the Zoom app link instead.",
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      try {
        clientRef.current?.leaveMeeting?.();
      } catch {
        // SDK may already have torn down
      }
      clientRef.current = null;
    };
  }, [session]);

  return (
    <div className="border border-stone bg-ink/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone bg-mist px-3 py-2">
        <p className="text-xs text-ink/60">{message}</p>
        <button
          type="button"
          onClick={() => {
            try {
              clientRef.current?.leaveMeeting?.();
            } catch {
              // ignore
            }
            onLeave();
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
