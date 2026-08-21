"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getStudentSupportPulse,
  markStudentTicketRead,
  type StudentChatEvent,
  type StudentSupportPulse,
} from "@/app/student/support/pulse";
import { useToast } from "@/components/ui/toast";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { StudentProfile } from "@/lib/student/types";

const TOAST_SEEN_KEY = "sod-student-chat-toast-seen";
const FALLBACK_POLL_MS = 90_000;
const BURST_MS = 450;

type ReadMap = Record<string, string>;

type StudentSupportLiveValue = {
  unread: number;
  markTicketRead: (ticketId: string) => Promise<void>;
};

const StudentSupportLiveContext =
  createContext<StudentSupportLiveValue | null>(null);

function readKey(userId: string) {
  return `sod-student-support-read:${userId}`;
}

function loadReadMap(userId: string): ReadMap {
  try {
    const raw = window.localStorage.getItem(readKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ReadMap;
  } catch {
    return {};
  }
}

function saveReadMap(userId: string, map: ReadMap) {
  window.localStorage.setItem(readKey(userId), JSON.stringify(map));
}

function isUnread(event: StudentChatEvent, readMap: ReadMap) {
  const lastRead = readMap[event.ticketId];
  if (!lastRead) return true;
  return new Date(event.createdAt).getTime() > new Date(lastRead).getTime();
}

function countUnread(notes: StudentChatEvent[], readMap: ReadMap) {
  return notes.filter((event) => isUnread(event, readMap)).length;
}

function readSeenNoteIds(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(TOAST_SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((item): item is string => typeof item === "string"),
    );
  } catch {
    return new Set();
  }
}

function writeSeenNoteIds(ids: Set<string>) {
  window.sessionStorage.setItem(
    TOAST_SEEN_KEY,
    JSON.stringify(Array.from(ids).slice(-80)),
  );
}

function mergeReadMaps(local: ReadMap, server: ReadMap): ReadMap {
  const next: ReadMap = { ...local };
  for (const [ticketId, serverAt] of Object.entries(server)) {
    const localAt = next[ticketId];
    if (!localAt) {
      next[ticketId] = serverAt;
      continue;
    }
    // Keep the later read timestamp across devices.
    if (new Date(serverAt).getTime() > new Date(localAt).getTime()) {
      next[ticketId] = serverAt;
    }
  }
  return next;
}

export function StudentSupportLiveProvider({
  profile,
  initialPulse,
  children,
}: {
  profile: StudentProfile;
  initialPulse: StudentSupportPulse;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [notes, setNotes] = useState(initialPulse.notes);
  const [readMap, setReadMap] = useState<ReadMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [serverPulse, setServerPulse] = useState(initialPulse);

  if (serverPulse !== initialPulse) {
    setServerPulse(initialPulse);
    setNotes(initialPulse.notes);
  }

  useEffect(() => {
    const merged = mergeReadMaps(
      loadReadMap(profile.id),
      initialPulse.reads ?? {},
    );
    setReadMap(merged);
    saveReadMap(profile.id, merged);
    setHydrated(true);
  }, [profile.id, initialPulse.reads]);

  const unread = useMemo(
    () => (hydrated ? countUnread(notes, readMap) : 0),
    [hydrated, notes, readMap],
  );

  const applyPulse = useCallback(
    (next: StudentSupportPulse, { announce }: { announce: boolean }) => {
      setNotes(next.notes);
      const merged = mergeReadMaps(loadReadMap(profile.id), next.reads ?? {});
      saveReadMap(profile.id, merged);
      setReadMap(merged);
      const fresh = next.notes.filter((event) => isUnread(event, merged));

      if (!announce) {
        const seen = readSeenNoteIds();
        for (const event of fresh) seen.add(event.noteId);
        if (next.latestNoteId) seen.add(next.latestNoteId);
        writeSeenNoteIds(seen);
        return;
      }

      const seen = readSeenNoteIds();
      const novel = fresh.filter((event) => !seen.has(event.noteId));
      for (const event of novel) {
        seen.add(event.noteId);
        toast({
          title: "New message",
          message: `${event.topic} · ${event.preview}`,
          tone: "info",
          durationMs: 6500,
        });
      }
      if (next.latestNoteId) seen.add(next.latestNoteId);
      writeSeenNoteIds(seen);

      if (novel.length > 0 && pathname.startsWith("/student/support")) {
        router.refresh();
      }
    },
    [pathname, profile.id, router, toast],
  );

  useEffect(() => {
    applyPulse(initialPulse, { announce: false });

    let cancelled = false;
    let inFlight = false;
    let burstTimer = 0;
    let lastLatest = initialPulse.latestNoteId;

    async function refreshPulse(announce: boolean) {
      if (cancelled || inFlight) return;
      if (document.visibilityState === "hidden") return;

      inFlight = true;
      try {
        const next = await getStudentSupportPulse();
        if (cancelled) return;
        const changed = next.latestNoteId !== lastLatest;
        applyPulse(next, { announce: announce && changed });
        lastLatest = next.latestNoteId;
      } catch {
        // Keep last known pulse.
      } finally {
        inFlight = false;
      }
    }

    function scheduleRefresh() {
      window.clearTimeout(burstTimer);
      burstTimer = window.setTimeout(() => void refreshPulse(true), BURST_MS);
    }

    let supabase: ReturnType<typeof createBrowserSupabaseClient> | null = null;
    let channel: ReturnType<
      ReturnType<typeof createBrowserSupabaseClient>["channel"]
    > | null = null;

    try {
      supabase = createBrowserSupabaseClient();
      channel = supabase
        .channel("student-support-pulse")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "support_ticket_notes" },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "support_tickets" },
          scheduleRefresh,
        )
        .subscribe();
    } catch {
      // Fallback poll still covers us.
    }

    const interval = window.setInterval(
      () => void refreshPulse(true),
      FALLBACK_POLL_MS,
    );
    const onWake = () => {
      if (document.visibilityState === "visible") void refreshPulse(true);
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      cancelled = true;
      window.clearTimeout(burstTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, router, applyPulse]);

  const markTicketRead = useCallback(
    async (ticketId: string) => {
      const now = new Date().toISOString();
      setReadMap((current) => {
        const next = { ...current, [ticketId]: now };
        saveReadMap(profile.id, next);
        return next;
      });
      void markStudentTicketRead(ticketId);
    },
    [profile.id],
  );

  const value = useMemo(
    () => ({ unread, markTicketRead }),
    [unread, markTicketRead],
  );

  return (
    <StudentSupportLiveContext.Provider value={value}>
      {children}
    </StudentSupportLiveContext.Provider>
  );
}

export function useStudentSupportLive() {
  const context = useContext(StudentSupportLiveContext);
  if (!context) {
    throw new Error(
      "useStudentSupportLive must be used within StudentSupportLiveProvider",
    );
  }
  return context;
}
