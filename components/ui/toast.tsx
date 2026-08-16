"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { publicToastMessage } from "@/lib/safe-action-message";

export type ToastTone = "success" | "error" | "info";

export type ToastInput = {
  title?: string;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastItem = {
  id: string;
  title?: string;
  message: string;
  tone: ToastTone;
  leaving?: boolean;
};

type ToastContextValue = {
  toast: (input: ToastInput | string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function toneStyles(tone: ToastTone) {
  switch (tone) {
    case "success":
      return {
        bar: "bg-celadon",
        shell: "border-pine/20 bg-pine text-mist",
        label: "text-celadon",
      };
    case "error":
      return {
        bar: "bg-red-300",
        shell: "border-red-900/30 bg-[#3a1f1f] text-red-50",
        label: "text-red-200",
      };
    default:
      return {
        bar: "bg-stone",
        shell: "border-stone bg-mist text-ink",
        label: "text-celadon",
      };
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, leaving: true } : item,
      ),
    );
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 280);
  }, []);

  const toast = useCallback(
    (input: ToastInput | string) => {
      const payload =
        typeof input === "string" ? { message: input } : input;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tone = payload.tone ?? "info";
      const durationMs = payload.durationMs ?? (tone === "error" ? 5200 : 3800);

      setItems((current) => [
        ...current.slice(-3),
        {
          id,
          title: payload.title,
          message: publicToastMessage(payload.message, tone),
          tone,
        },
      ]);

      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message, title = "Done") =>
        toast({ message, title, tone: "success" }),
      error: (message, title = "Something went wrong") =>
        toast({ message, title, tone: "error" }),
      info: (message, title) => toast({ message, title, tone: "info" }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-stretch gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:inset-x-auto sm:right-6 sm:top-6 sm:items-end sm:p-0"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((item) => {
          const styles = toneStyles(item.tone);
          return (
            <div
              key={item.id}
              className={`pointer-events-auto w-full max-w-md border shadow-[0_12px_40px_rgba(20,53,44,0.18)] sm:w-[22rem] ${styles.shell} ${
                item.leaving ? "animate-toast-out" : "animate-toast-in"
              }`}
              role="status"
            >
              <div className="flex gap-3 px-4 py-3.5">
                <span
                  className={`mt-1 h-8 w-0.5 shrink-0 ${styles.bar}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  {item.title ? (
                    <p
                      className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${styles.label}`}
                    >
                      {item.title}
                    </p>
                  ) : null}
                  <p
                    className={`text-sm leading-relaxed ${
                      item.title ? "mt-1.5" : ""
                    }`}
                  >
                    {item.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 self-start text-xs tracking-wide opacity-70 transition-opacity hover:opacity-100"
                  aria-label="Dismiss notification"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
