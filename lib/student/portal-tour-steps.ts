/** David-guided walk-through — full student portal. */

export type StudentNavGroup = "enrolment" | "learning" | "reach";

export type StudentHomeSection = "overview" | "application";

export type StudentTourTabPayload =
  | { page: "payments"; tab: "due" | "review" | "paid" | "history" }
  | { page: "classes"; tab: "upcoming" | "checkin" | "seat" | "past" }
  | { page: "exams"; tab: "available" | "in_progress" | "done" }
  | { page: "records"; tab: "overview" | "attendance" | "exams" }
  | { page: "notices"; tab: "latest" | "earlier" };

export type StudentPortalTourStep = {
  id: string;
  quest: number;
  questLabel: string;
  title: string;
  body: string;
  /** Route or hash route, e.g. `/student#application`. Defaults to `/student#overview`. */
  href?: string;
  target?: string;
  /** Tried in order when the primary target is not in the DOM yet (empty data, etc.). */
  fallbackTargets?: string[];
  /** Shown in the guide when no spotlight could be attached. */
  missingNote?: string;
  homeSection?: StudentHomeSection;
  expandNavGroup?: StudentNavGroup;
  tourTab?: StudentTourTabPayload;
  cta: string;
};

export const STUDENT_PORTAL_TOUR_QUEST_COUNT = 5;

export const SOD_STUDENT_TOUR_EXPAND_EVENT = "sod-student-tour-expand";
export const SOD_STUDENT_TOUR_TAB_EVENT = "sod-student-tour-tab";

export const STUDENT_PORTAL_TOUR_STEPS: StudentPortalTourStep[] = [
  // ── Quest 1: Overview ────────────────────────────────────────
  {
    id: "HOME-01",
    quest: 1,
    questLabel: "Your home",
    title: "Welcome to *My Journey*",
    body: "I'm David — your guide on this student desk. Together we'll walk the whole portal: where you stand, how to pay, classes and exams, notices, and the Listening Desk. Take your time.",
    href: "/student#overview",
    homeSection: "overview",
    cta: "Let's begin",
  },
  {
    id: "HOME-02",
    quest: 1,
    questLabel: "Your home",
    title: "Start from *here* each day",
    body: "This hero shows your next step — enrol, pay fees, add your passport photo, or enter classes. The big button always points to what matters most *right now*.",
    href: "/student#overview",
    target: '[data-tour="student-overview-hero"]',
    homeSection: "overview",
    cta: "Show my standing",
  },
  {
    id: "HOME-03",
    quest: 1,
    questLabel: "Your home",
    title: "Your standing at a *glance*",
    body: "Application status, payment progress, parish placement, and your reference — all in one strip. **Part paid** shows how much tuition is still left.",
    href: "/student#overview",
    target: '[data-tour="student-overview-identity"]',
    homeSection: "overview",
    cta: "The path ahead",
  },
  {
    id: "HOME-04",
    quest: 1,
    questLabel: "Your home",
    title: "Four thresholds on the *path*",
    body: "Applied → Review → Payment → Course. Dots show what's done, what's live, and what's still ahead. When tuition is part paid, the Payment step shows your balance.",
    href: "/student#overview",
    target: '[data-tour="student-overview-journey"]',
    homeSection: "overview",
    cta: "Latest signal",
  },
  {
    id: "HOME-05",
    quest: 1,
    questLabel: "Your home",
    title: "Signal from the *board*",
    body: "The latest student notice lands here. Open **All notices** for the full board, or reach the **Listening Desk** beside it when you need a person.",
    href: "/student#overview",
    target: '[data-tour="student-overview-signal"]',
    homeSection: "overview",
    cta: "Enrolment next",
  },

  // ── Quest 2: Enrolment ───────────────────────────────────────
  {
    id: "ENR-00",
    quest: 2,
    questLabel: "Enrolment & fees",
    title: "Application and *payments*",
    body: "**Enrolment** in the menu holds your application status and fee desk. We'll open both — your form is read-only; fees you settle in instalments.",
    href: "/student#overview",
    target: '[data-tour="student-nav-enrolment"]',
    expandNavGroup: "enrolment",
    homeSection: "overview",
    cta: "Open application",
  },
  {
    id: "ENR-01",
    quest: 2,
    questLabel: "Enrolment & fees",
    title: "Your application *status*",
    body: "Where the School stands on your enrolment — accepted, under review, payment pending, and so on. **Paper trail** on Overview jumps here anytime.",
    href: "/student#application",
    target: '[data-tour="student-application-status"]',
    homeSection: "application",
    expandNavGroup: "enrolment",
    cta: "What you submitted",
  },
  {
    id: "ENR-02",
    quest: 2,
    questLabel: "Enrolment & fees",
    title: "A read-only copy of *your form*",
    body: "Everything you sent at enrolment — contact, church, placement. If something is wrong, use **Support**; you cannot edit it here.",
    href: "/student#application",
    target: '[data-tour="student-application-form"]',
    fallbackTargets: [
      '[data-tour="student-application-status"]',
      '[data-tour="student-application-page"]',
    ],
    missingNote:
      "Your submitted form appears here once enrolment is on file.",
    homeSection: "application",
    expandNavGroup: "enrolment",
    cta: "Open payments",
  },
  {
    id: "ENR-03",
    quest: 2,
    questLabel: "Enrolment & fees",
    title: "Tuition and *graduation* fees",
    body: "Pay in full or by instalment — minimum **£30** each time unless you clear the balance. Card checkout or bank transfer with proof for the desk to approve.",
    href: "/student/payments",
    target: '[data-tour="student-payments-header"]',
    expandNavGroup: "enrolment",
    cta: "See balances",
  },
  {
    id: "ENR-04",
    quest: 2,
    questLabel: "Enrolment & fees",
    title: "Know what's *left*",
    body: "Progress bars for tuition and graduation. **Outstanding** at the top is your total remaining. Your first confirmed tuition instalment unlocks passport upload.",
    href: "/student/payments",
    target: '[data-tour="student-payments-balances"]',
    fallbackTargets: ['[data-tour="student-payments-header"]'],
    missingNote: "Balance bars appear once fee rows are set up for your account.",
    expandNavGroup: "enrolment",
    cta: "Tabs & history",
  },
  {
    id: "ENR-05",
    quest: 2,
    questLabel: "Enrolment & fees",
    title: "Due, review, paid — and *history*",
    body: "**Due** is where you pay next. **In review** waits on the desk. **Paid** is settled. **History** lists every instalment — card or approved bank transfer.",
    href: "/student/payments",
    target: '[data-tour="student-payments-tabs"]',
    expandNavGroup: "enrolment",
    tourTab: { page: "payments", tab: "due" },
    cta: "On to learning",
  },

  // ── Quest 3: Learning ────────────────────────────────────────
  {
    id: "LRN-00",
    quest: 3,
    questLabel: "Learning",
    title: "Classes, exams, *records*",
    body: "**Learning** in the menu is your classroom — live sessions, timed exams, your scorecard, and the graduation gallery.",
    href: "/student#overview",
    target: '[data-tour="student-nav-learning"]',
    expandNavGroup: "learning",
    homeSection: "overview",
    cta: "Open classes",
  },
  {
    id: "LRN-01",
    quest: 3,
    questLabel: "Learning",
    title: "The live *hall*",
    body: "Join Zoom from the portal when a session is live, submit a check-in code on site, and keep your Zoom seat email current.",
    href: "/student/classes",
    target: '[data-tour="student-classes-header"]',
    expandNavGroup: "learning",
    cta: "Four sections",
  },
  {
    id: "LRN-02",
    quest: 3,
    questLabel: "Learning",
    title: "Upcoming, check-in, *seat*, past",
    body: "**Upcoming** lists what's next. **Check-in** is for the code your leader gives you. **Zoom seat** is your join email. **Past** is attendance already recorded.",
    href: "/student/classes",
    target: '[data-tour="student-classes-tabs"]',
    expandNavGroup: "learning",
    tourTab: { page: "classes", tab: "upcoming" },
    cta: "Your exams",
  },
  {
    id: "LRN-03",
    quest: 3,
    questLabel: "Learning",
    title: "Timed *assessments*",
    body: "Exams appear when the desk publishes them. Available, in progress, and done — each paper allows one retake while the window is open.",
    href: "/student/exams",
    target: '[data-tour="student-exams-stats"]',
    expandNavGroup: "learning",
    cta: "Exam lanes",
  },
  {
    id: "LRN-04",
    quest: 3,
    questLabel: "Learning",
    title: "Sit, continue, or *review*",
    body: "Open a paper under **Available** when you're ready — the clock starts on Begin. **In progress** resumes an open attempt. **Done** shows released results.",
    href: "/student/exams",
    target: '[data-tour="student-exams-tabs"]',
    expandNavGroup: "learning",
    tourTab: { page: "exams", tab: "available" },
    cta: "Your record",
  },
  {
    id: "LRN-05",
    quest: 3,
    questLabel: "Learning",
    title: "Your *scorecard*",
    body: "Overview, attendance, and exam marks in one place — read-only, updated when the desk records classes and releases exams.",
    href: "/student/records",
    target: '[data-tour="student-records-stats"]',
    expandNavGroup: "learning",
    cta: "Three sections",
  },
  {
    id: "LRN-06",
    quest: 3,
    questLabel: "Learning",
    title: "Attendance and *marks*",
    body: "Switch tabs for session-by-session presence and each exam entry. Leave the tab and come back to pick up desk updates.",
    href: "/student/records",
    target: '[data-tour="student-records-tabs"]',
    expandNavGroup: "learning",
    tourTab: { page: "records", tab: "overview" },
    cta: "Gallery",
  },
  {
    id: "LRN-07",
    quest: 3,
    questLabel: "Learning",
    title: "Faces of the *School*",
    body: "After graduation fees are paid, upload your selfie here — it appears in your batch or parish gallery. You can replace or remove it later.",
    href: "/student/gallery",
    target: '[data-tour="student-gallery-header"]',
    expandNavGroup: "learning",
    cta: "Browse portraits",
  },
  {
    id: "LRN-08",
    quest: 3,
    questLabel: "Learning",
    title: "Batch, parish, *your portrait*",
    body: "Switch scope to see classmates. Your own graduation selfie sits at the top when you're eligible — manage it without leaving the gallery.",
    href: "/student/gallery",
    target: '[data-tour="student-gallery-selfie"]',
    fallbackTargets: ['[data-tour="student-gallery-header"]'],
    missingNote:
      "Your portrait upload unlocks after graduation fees are settled.",
    expandNavGroup: "learning",
    cta: "Stay connected",
  },

  // ── Quest 4: Reach ───────────────────────────────────────────
  {
    id: "RCH-00",
    quest: 4,
    questLabel: "Stay connected",
    title: "Notices, community, *desk*",
    body: "**Reach** is how the School talks to you — the notice board, national community chat, private support threads, and your account.",
    href: "/student#overview",
    target: '[data-tour="student-nav-reach"]',
    expandNavGroup: "reach",
    homeSection: "overview",
    cta: "Notices",
  },
  {
    id: "RCH-01",
    quest: 4,
    questLabel: "Stay connected",
    title: "The student *board*",
    body: "Official updates for your cohort — latest featured, earlier archive. External links and attachments ask before you leave the portal.",
    href: "/student/notices",
    target: '[data-tour="student-notices-header"]',
    expandNavGroup: "reach",
    cta: "Community",
  },
  {
    id: "RCH-02",
    quest: 4,
    questLabel: "Stay connected",
    title: "The national *room*",
    body: "A shared chat for students across the School. Be kind and on topic — for private matters, use **Support** instead.",
    href: "/student/community",
    target: '[data-tour="student-community-room"]',
    expandNavGroup: "reach",
    cta: "Support desk",
  },
  {
    id: "RCH-03",
    quest: 4,
    questLabel: "Stay connected",
    title: "The Listening *Desk*",
    body: "Start a conversation, reply in the thread, and delete a ticket anytime. Unread replies show a badge on **Support** in the menu.",
    href: "/student/support",
    target: '[data-tour="student-support-desk"]',
    expandNavGroup: "reach",
    cta: "Your account",
  },
  {
    id: "RCH-04",
    quest: 4,
    questLabel: "Stay connected",
    title: "Password and *profile*",
    body: "Change your password, see parish and batch on file, and review portal details. Your passport photo is locked once uploaded.",
    href: "/student/account",
    target: '[data-tour="student-account-stats"]',
    expandNavGroup: "reach",
    cta: "Almost done",
  },

  // ── Quest 5: Finish ──────────────────────────────────────────
  {
    id: "HOME-06",
    quest: 5,
    questLabel: "You're set",
    title: "The menu is always *here*",
    body: "Collapse the sidebar on desktop or use the menu on mobile. **Overview** brings you home; sections group under Enrolment, Learning, and Reach.",
    href: "/student#overview",
    target: '[data-tour="student-nav-overview"]',
    homeSection: "overview",
    cta: "Finish tour",
  },
  {
    id: "DONE",
    quest: 5,
    questLabel: "You're set",
    title: "Walk on — I'm *still here*",
    body: "That's **My Journey** end to end. Tap **Portal tour** on Overview anytime to replay. When something feels unclear, start with your hero button or open **Support**.",
    href: "/student#overview",
    homeSection: "overview",
    cta: "Back to Overview",
  },
];

export function tourStepPath(step: StudentPortalTourStep): string {
  return step.href ?? "/student#overview";
}

export function tourPathMatches(pathname: string, href: string): boolean {
  const pathOnly = href.split("#")[0]?.split("?")[0] || "/student";
  if (pathOnly === "/student") return pathname === "/student";
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

export function tourHrefReady(
  pathname: string,
  hash: string,
  href: string,
  search = "",
): boolean {
  if (!tourPathMatches(pathname, href)) return false;

  const hashPart = href.includes("#") ? href.split("#")[1]?.split("?")[0] : null;
  const hashNorm = hash.replace(/^#/, "") || "overview";

  if (pathname === "/student") {
    if (hashPart) return hashNorm === hashPart;
    return hashNorm === "overview";
  }

  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  if (!query) return true;
  const required = new URLSearchParams(query);
  const current = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  for (const [key, value] of required.entries()) {
    if (current.get(key) !== value) return false;
  }
  return true;
}
