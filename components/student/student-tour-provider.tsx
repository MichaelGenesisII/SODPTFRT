"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StudentPortalWalkthrough } from "@/components/student/student-portal-walkthrough";
import {
  SOD_STUDENT_TOUR_EXPAND_EVENT,
  SOD_STUDENT_TOUR_TAB_EVENT,
  STUDENT_PORTAL_TOUR_STEPS,
  tourHrefReady,
  tourStepPath,
  type StudentHomeSection,
  type StudentTourTabPayload,
} from "@/lib/student/portal-tour-steps";
import { tourStepNeedsOpenSidebar } from "@/lib/tour/sidebar-spotlight";
import {
  readLiveTourLocation,
  TOUR_NAV_MAX_MS,
  TOUR_NAV_POLL_MS,
  TOUR_NAV_RETRY_MS,
} from "@/lib/tour/walkthrough-runtime";

type StudentTourContextValue = {
  open: boolean;
  stepIndex: number;
  startTour: () => void;
  closeTour: () => void;
};

const StudentTourContext = createContext<StudentTourContextValue | null>(null);

export function useStudentTour() {
  const ctx = useContext(StudentTourContext);
  if (!ctx) {
    throw new Error("useStudentTour must be used within StudentTourProvider");
  }
  return ctx;
}

export function useStudentTourOptional() {
  return useContext(StudentTourContext);
}

function openTourSidebar(groupId?: string) {
  window.dispatchEvent(
    new CustomEvent(SOD_STUDENT_TOUR_EXPAND_EVENT, {
      detail: { groupId },
    }),
  );
}

function expandNavGroup(groupId: string) {
  openTourSidebar(groupId);
}

function requestHomeSection(section: StudentHomeSection) {
  if (typeof window === "undefined") return;
  const next = section === "application" ? "application" : "overview";
  if (window.location.pathname === "/student") {
    if (window.location.hash.slice(1) !== next) {
      window.location.hash = next;
    }
    window.dispatchEvent(new Event("hashchange"));
  }
}

function requestTourTab(payload: StudentTourTabPayload) {
  window.dispatchEvent(
    new CustomEvent(SOD_STUDENT_TOUR_TAB_EVENT, {
      detail: payload,
    }),
  );
}

function navigateToHref(router: ReturnType<typeof useRouter>, href: string) {
  if (href.includes("#")) {
    const [path, hashPart] = href.split("#");
    if (window.location.pathname !== path) {
      router.push(href);
      return;
    }
    const section = hashPart?.split("?")[0] ?? "overview";
    if (window.location.hash.slice(1) !== section) {
      window.location.hash = section;
    }
    window.dispatchEvent(new Event("hashchange"));
    return;
  }
  router.push(href);
}

function stepHrefReady(stepIndex: number, search: string) {
  const step = STUDENT_PORTAL_TOUR_STEPS[stepIndex];
  if (!step) return true;
  const live = readLiveTourLocation();
  return tourHrefReady(
    live.pathname,
    live.hash,
    tourStepPath(step),
    live.search || search,
  );
}

export function StudentTourProvider({
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
  const [hash, setHash] = useState("");
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [locationTick, setLocationTick] = useState(0);
  const navStartedRef = useRef(0);
  const navRetryRef = useRef(0);

  useEffect(() => {
    function readHash() {
      setHash(window.location.hash);
    }
    readHash();
    window.addEventListener("hashchange", readHash);
    window.addEventListener("popstate", readHash);
    return () => {
      window.removeEventListener("hashchange", readHash);
      window.removeEventListener("popstate", readHash);
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    let last = "";
    const snapshot = () => JSON.stringify(readLiveTourLocation());
    last = snapshot();
    const id = window.setInterval(() => {
      const next = snapshot();
      if (next !== last) {
        last = next;
        setLocationTick((tick) => tick + 1);
      }
    }, TOUR_NAV_POLL_MS);
    return () => window.clearInterval(id);
  }, [open, stepIndex]);

  const navigateForStep = useCallback(
    (index: number) => {
      const step = STUDENT_PORTAL_TOUR_STEPS[index];
      if (!step) return;
      if (step.expandNavGroup) expandNavGroup(step.expandNavGroup);
      else if (tourStepNeedsOpenSidebar(step.target)) openTourSidebar();

      const href = tourStepPath(step);
      const live = readLiveTourLocation();
      const ready = tourHrefReady(
        live.pathname,
        live.hash,
        href,
        live.search || search,
      );
      if (!ready) {
        navigateToHref(router, href);
        return;
      }
      if (step.homeSection) requestHomeSection(step.homeSection);
      if (step.tourTab) requestTourTab(step.tourTab);
    },
    [router, search],
  );

  useEffect(() => {
    if (!open) return;
    const step = STUDENT_PORTAL_TOUR_STEPS[stepIndex];
    if (!step) return;

    if (stepHrefReady(stepIndex, search)) {
      if (step.homeSection) requestHomeSection(step.homeSection);
      if (step.tourTab) requestTourTab(step.tourTab);
      return;
    }

    const href = tourStepPath(step);
    navigateToHref(router, href);
    navStartedRef.current = Date.now();

    let cancelled = false;

    const retry = () => {
      if (cancelled || !open) return;
      if (stepHrefReady(stepIndex, search)) {
        if (step.homeSection) requestHomeSection(step.homeSection);
        if (step.tourTab) requestTourTab(step.tourTab);
        return;
      }
      if (Date.now() - navStartedRef.current >= TOUR_NAV_MAX_MS) return;
      navigateToHref(router, href);
      navRetryRef.current = window.setTimeout(retry, TOUR_NAV_RETRY_MS);
    };

    navRetryRef.current = window.setTimeout(retry, TOUR_NAV_RETRY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(navRetryRef.current);
    };
  }, [open, stepIndex, router, search]);

  useEffect(() => {
    if (!open) return;
    const step = STUDENT_PORTAL_TOUR_STEPS[stepIndex];
    if (!step || !stepHrefReady(stepIndex, search)) return;
    if (step.homeSection) requestHomeSection(step.homeSection);
    if (step.tourTab) requestTourTab(step.tourTab);
  }, [open, stepIndex, pathname, hash, search, locationTick]);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setOpen(true);
    navigateToHref(router, "/student#overview");
  }, [router]);

  const closeTour = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
  }, []);

  const finishTour = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
    navigateToHref(router, "/student#overview");
  }, [router]);

  const goNext = useCallback(() => {
    if (stepIndex >= STUDENT_PORTAL_TOUR_STEPS.length - 1) {
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
    <StudentTourContext.Provider value={value}>
      {children}
      <StudentPortalWalkthrough
        open={open}
        stepIndex={stepIndex}
        pathname={pathname}
        hash={hash}
        search={search}
        firstName={firstName}
        onClose={closeTour}
        onFinish={finishTour}
        onNext={goNext}
        onBack={goBack}
        onRequestHomeSection={requestHomeSection}
        onRequestTab={requestTourTab}
      />
    </StudentTourContext.Provider>
  );
}
