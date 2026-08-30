"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OverviewWalkthrough } from "@/components/admin/overview-walkthrough";
import {
  OVERVIEW_TOUR_STEPS,
  SOD_ADMIN_TOUR_EXPAND_EVENT,
  SOD_ADMIN_TOUR_TAB_EVENT,
  tourHrefReady,
  tourStepPath,
  type OverviewTourTab,
} from "@/lib/admin/overview-tour-steps";
import { tourStepNeedsOpenSidebar } from "@/lib/tour/sidebar-spotlight";

type AdminTourContextValue = {
  open: boolean;
  stepIndex: number;
  startTour: () => void;
  closeTour: () => void;
};

const AdminTourContext = createContext<AdminTourContextValue | null>(null);

export function useAdminTour() {
  const ctx = useContext(AdminTourContext);
  if (!ctx) {
    throw new Error("useAdminTour must be used within AdminTourProvider");
  }
  return ctx;
}

/** Safe for Overview trigger — no-ops outside provider (should not happen). */
export function useAdminTourOptional() {
  return useContext(AdminTourContext);
}

function openTourSidebar(groupId?: string) {
  window.dispatchEvent(
    new CustomEvent(SOD_ADMIN_TOUR_EXPAND_EVENT, {
      detail: { groupId },
    }),
  );
}

function expandNavGroup(groupId: string) {
  openTourSidebar(groupId);
}

function requestOverviewTab(tab: OverviewTourTab) {
  window.dispatchEvent(
    new CustomEvent(SOD_ADMIN_TOUR_TAB_EVENT, {
      detail: { tab },
    }),
  );
}

export function AdminTourProvider({
  firstName,
  children,
}: {
  firstName: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const navigateForStep = useCallback(
    (index: number) => {
      const step = OVERVIEW_TOUR_STEPS[index];
      if (!step) return;
      if (step.expandNavGroup) expandNavGroup(step.expandNavGroup);
      else if (tourStepNeedsOpenSidebar(step.target)) openTourSidebar();
      const href = tourStepPath(step);
      const ready = tourHrefReady(pathname, search, href);
      if (!ready) {
        router.push(href);
        return;
      }
      if (step.tab) requestOverviewTab(step.tab);
    },
    [pathname, router, search],
  );

  const startTour = useCallback(() => {
    setStepIndex(0);
    setOpen(true);
    if (pathname !== "/admin") {
      router.push("/admin");
    } else {
      requestOverviewTab("today");
    }
  }, [pathname, router]);

  const closeTour = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
  }, []);

  const finishTour = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
    if (pathname !== "/admin") {
      router.push("/admin");
    }
    requestOverviewTab("today");
  }, [pathname, router]);

  const goNext = useCallback(() => {
    if (stepIndex >= OVERVIEW_TOUR_STEPS.length - 1) {
      finishTour();
      return;
    }
    const next = stepIndex + 1;
    setStepIndex(next);
    navigateForStep(next);
  }, [finishTour, navigateForStep, stepIndex]);

  const goBack = useCallback(() => {
    if (stepIndex <= 0) return;
    const prev = stepIndex - 1;
    setStepIndex(prev);
    navigateForStep(prev);
  }, [navigateForStep, stepIndex]);

  const value = useMemo(
    () => ({ open, stepIndex, startTour, closeTour }),
    [open, stepIndex, startTour, closeTour],
  );

  return (
    <AdminTourContext.Provider value={value}>
      {children}
      <OverviewWalkthrough
        open={open}
        stepIndex={stepIndex}
        pathname={pathname}
        search={search}
        firstName={firstName}
        onClose={closeTour}
        onFinish={finishTour}
        onNext={goNext}
        onBack={goBack}
        onRequestTab={requestOverviewTab}
      />
    </AdminTourContext.Provider>
  );
}
