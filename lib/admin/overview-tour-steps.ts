/** David Command walk-through — full admin portal, ≥3 stops per desk. */

export type OverviewTourTab = "today" | "pulse" | "learning" | "statement";

export type OverviewTourStep = {
  id: string;
  quest: number;
  questLabel: string;
  title: string;
  body: string;
  /** Page to open for this stop. Defaults to /admin. */
  href?: string;
  /** CSS selector for driver.js spotlight cutout; omit for dim overlay only. */
  target?: string;
  /** Switch Overview tab before highlighting (Overview page only). */
  tab?: OverviewTourTab;
  /** Expand this sidebar accordion before / while highlighting. */
  expandNavGroup?: "cohort" | "learning" | "reach";
  cta: string;
};

export const OVERVIEW_TOUR_QUEST_COUNT = 5;

/**
 * Portal order mirrors the sidebar.
 * Every desk route has at least three spotlight stops (see assertTourCoverage).
 * Voice: David — warm, first-person, practical; speaks to the admin as a partner.
 */
export const OVERVIEW_TOUR_STEPS: OverviewTourStep[] = [
  // ── Quest 1: Overview home (3+) ──────────────────────────────
  {
    id: "MAP-01",
    quest: 1,
    questLabel: "Getting oriented",
    title: "I'm *glad* you're here",
    body: "I'm David — your guide on this Staff desk. Together we'll walk this **Admin Portal** end to end: where work shows up, where *your people* live, how learning runs, and how you stay in touch. Take your time; I'm right here with you.",
    href: "/admin",
    tab: "today",
    cta: "Let's begin",
  },
  {
    id: "OV-TABS",
    quest: 1,
    questLabel: "Getting oriented",
    title: "Your home has *four* rooms",
    body: "Think of these tabs as how you arrive each day. **Today** is for decisions. **Pulse** shows how the cohort is moving. **Learning** keeps classes and exams close. Statement is for official lists when you need to prove the work.",
    href: "/admin",
    target: '[data-tour="overview-tabs"]',
    tab: "today",
    cta: "Show me what waits",
  },
  {
    id: "OV-ATTN",
    quest: 1,
    questLabel: "Getting oriented",
    title: "This number has *your back*",
    body: "When something needs you — inbox, applications, proofs, exams — it lands here. Tap **Today** anytime and I'll take you straight in. *You don't have to hunt.*",
    href: "/admin",
    target: '[data-tour="overview-attention"]',
    tab: "today",
    cta: "What's in Today?",
  },
  {
    id: "OV-LANES",
    quest: 1,
    questLabel: "Getting oriented",
    title: "Clear the path, *one lane* at a time",
    body: "Each row is a live **lane** of work. Expand one for a plain tip, then open that **desk**. When a row is tinted, something is waiting for you — we'll visit those desks together next.",
    href: "/admin",
    target: '[data-tour="overview-today-lanes"]',
    tab: "today",
    cta: "Meet your people",
  },

  // ── Quest 2: Cohort ──────────────────────────────────────────
  {
    id: "COH-00",
    quest: 2,
    questLabel: "Your people",
    title: "This is where *your people* live",
    body: "**Cohort** holds Students, Alumni, programmes, Payments, and Parishes. Whenever you're placing someone or watching fees, start here in the sidebar.",
    href: "/admin",
    target: '[data-tour="nav-group-cohort"]',
    expandNavGroup: "cohort",
    cta: "Open Students",
  },

  // Students ×3
  {
    id: "STU-01",
    quest: 2,
    questLabel: "Your people",
    title: "You're on the **Students** desk",
    body: "**Desk** is where you work the register every day. If you ever feel lost, **Insight** is a calm companion — it explains the lanes *without getting in your way*.",
    href: "/admin/students",
    target: '[data-tour="students-tabs"]',
    expandNavGroup: "cohort",
    cta: "Keep going",
  },
  {
    id: "STU-02",
    quest: 2,
    questLabel: "Your people",
    title: "Refine with *one panel*",
    body: "Programme intake (Cohort 1–3), parish batch, Saturday, roster status, and fees all live here. *No duplicate cards or tabs* — just filters.",
    href: "/admin/students",
    target: '[data-tour="students-filters"]',
    expandNavGroup: "cohort",
    cta: "Show me how",
  },
  {
    id: "STU-03",
    quest: 2,
    questLabel: "Your people",
    title: "Find them, then open *their story*",
    body: "Combine intake and batch year when you need a slice of the roster. The list stays view-only; open a row when you're ready to help on the **student file**.",
    href: "/admin/students",
    target: '[data-tour="students-filters"]',
    expandNavGroup: "cohort",
    cta: "Next · Alumni",
  },

  // Alumni ×3
  {
    id: "ALU-01",
    quest: 2,
    questLabel: "Your people",
    title: "Graduates still *matter* here",
    body: "Before you search, glance at who's in the **register**, who still needs an email, and who's ready for the **portal**. It tells you *where care is needed*.",
    href: "/admin/alumni",
    target: '[data-tour="alumni-stats"]',
    expandNavGroup: "cohort",
    cta: "Keep going",
  },
  {
    id: "ALU-02",
    quest: 2,
    questLabel: "Your people",
    title: "Look up, or bring a *batch* in",
    body: "**Register** is for finding people already on file. **Import** is for spreadsheet intakes when a new run begins. Two doors, *same heart*: keeping graduates close.",
    href: "/admin/alumni",
    target: '[data-tour="alumni-tabs"]',
    expandNavGroup: "cohort",
    cta: "Show me Register",
  },
  {
    id: "ALU-03",
    quest: 2,
    questLabel: "Your people",
    title: "Search with *kindness*",
    body: "Name, centre, year — refine until you see the right person, then open their file for **portal access**. *You're never guessing in the dark.*",
    href: "/admin/alumni",
    target: '[data-tour="alumni-register"]',
    expandNavGroup: "cohort",
    cta: "Next · Students",
  },

  // Students intakes ×3 (was Cohorts desk)
  {
    id: "COR-01",
    quest: 2,
    questLabel: "Your people",
    title: "Three intakes, *one filter*",
    body: "**Programme intake** picks Cohort 1 (November), Cohort 2 (January), or Cohort 3 (February). Everything else in the panel still narrows within that slice.",
    href: "/admin/students",
    target: '[data-tour="students-filters"]',
    expandNavGroup: "cohort",
    cta: "Keep going",
  },
  {
    id: "COR-02",
    quest: 2,
    questLabel: "Your people",
    title: "Same calendar *batch year*",
    body: "Use **Batch year** to see students across intakes and parishes who share that year label on their parish batch — handy when C1, C2, and C3 sit side by side.",
    href: "/admin/students",
    target: '[data-tour="students-filters"]',
    expandNavGroup: "cohort",
    cta: "Try a year",
  },
  {
    id: "COR-03",
    quest: 2,
    questLabel: "Your people",
    title: "Bulk work when you need *speed*",
    body: "Select rows for enrolment status, payment, manuals wave 1, pause/reactivate, or CSV export — *without* leaving the Students desk.",
    href: "/admin/students",
    target: '[data-tour="students-filters"]',
    expandNavGroup: "cohort",
    cta: "Next · Payments",
  },

  // Payments ×3
  {
    id: "PAY-01",
    quest: 2,
    questLabel: "Your people",
    title: "Fees need a *careful* eye",
    body: "This **Desk** is where bank proofs wait for you. **Insight** is there if you want a gentle reminder of fee types and how **approve** or return works.",
    href: "/admin/payments",
    target: '[data-tour="payments-tabs"]',
    expandNavGroup: "cohort",
    cta: "Keep going",
  },
  {
    id: "PAY-02",
    quest: 2,
    questLabel: "Your people",
    title: "Know your *queue* before you dive in",
    body: "Unresolved proofs, **Tuition**, **Graduation**, recently **Approved** — a calm snapshot so you know *how heavy the morning looks*.",
    href: "/admin/payments",
    target: '[data-tour="payments-stats"]',
    expandNavGroup: "cohort",
    cta: "Show me the queue",
  },
  {
    id: "PAY-03",
    quest: 2,
    questLabel: "Your people",
    title: "Open a proof, decide with *care*",
    body: "Switch **Unresolved** or **Approved**, then open a proof beside the list. **Approve** when it's clear; return it kindly when the upload isn't ready yet.",
    href: "/admin/payments",
    target: '[data-tour="payments-lanes"]',
    expandNavGroup: "cohort",
    cta: "Next · Parishes",
  },

  // Parishes ×3
  {
    id: "PAR-01",
    quest: 2,
    questLabel: "Your people",
    title: "Churches and *their runs*",
    body: "**Desk** is for browsing and opening enrolment. **Manage** holds the deeper parish and batch edits. **Insight** keeps the open / closed story straight.",
    href: "/admin/parishes",
    target: '[data-tour="parishes-tabs"]',
    expandNavGroup: "cohort",
    cta: "Keep going",
  },
  {
    id: "PAR-02",
    quest: 2,
    questLabel: "Your people",
    title: "Your parish *landscape*",
    body: "How many **churches** you can see, which batches are **open**, and which runs still need a programme — so *nothing sits forgotten*.",
    href: "/admin/parishes",
    target: '[data-tour="parishes-stats"]',
    expandNavGroup: "cohort",
    cta: "Show the directory",
  },
  {
    id: "PAR-03",
    quest: 2,
    questLabel: "Your people",
    title: "Find a church, tend *its batches*",
    body: "Search or select a parish to load its **batches**. From here you **open or close** enrolment — a small switch with *a big welcome* for applicants.",
    href: "/admin/parishes",
    target: '[data-tour="parishes-directory"]',
    expandNavGroup: "cohort",
    cta: "On to Learning",
  },

  // ── Quest 3: Learning ────────────────────────────────────────
  {
    id: "LEA-00",
    quest: 3,
    questLabel: "Learning together",
    title: "Now we *teach*",
    body: "**Learning** holds Classes, Exams, Records, and Gallery — from a live session, through marks, to a graduation portrait. I'll walk you through *each door*.",
    href: "/admin",
    target: '[data-tour="nav-group-learning"]',
    expandNavGroup: "learning",
    cta: "Open Classes",
  },

  // Classes ×3
  {
    id: "CLA-01",
    quest: 3,
    questLabel: "Learning together",
    title: "The hall is *ready*",
    body: "**Desk** is where you schedule sessions. **Insight** sits nearby for Zoom, check-in codes, and how attendance finds its way to **Records**.",
    href: "/admin/classes",
    target: '[data-tour="classes-tabs"]',
    expandNavGroup: "learning",
    cta: "Keep going",
  },
  {
    id: "CLA-02",
    quest: 3,
    questLabel: "Learning together",
    title: "How full is *the hall*?",
    body: "Upcoming sessions, codes ready for **check-in**, present marks across the books — a quick sense of whether the week feels *calm or busy*.",
    href: "/admin/classes",
    target: '[data-tour="classes-stats"]',
    expandNavGroup: "learning",
    cta: "Show the schedule",
  },
  {
    id: "CLA-03",
    quest: 3,
    questLabel: "Learning together",
    title: "Schedule, then open *the room*",
    body: "Search what's coming, or tap **Schedule** to add a session. Open any row for the class file — live status, **attendance**, and Zoom live there with you.",
    href: "/admin/classes",
    target: '[data-tour="classes-schedule"]',
    expandNavGroup: "learning",
    cta: "Next · Exams",
  },

  // Exams ×3
  {
    id: "EXM-01",
    quest: 3,
    questLabel: "Learning together",
    title: "Papers have a *clear path*",
    body: "**Compose** and **Upload** build the paper. Samples lend you a ready pack. **Queue** is where you mark. Results is where scores settle. You've got every stage here.",
    href: "/admin/exams",
    target: '[data-tour="exams-tabs"]',
    expandNavGroup: "learning",
    cta: "Keep going",
  },
  {
    id: "EXM-02",
    quest: 3,
    questLabel: "Learning together",
    title: "Find a paper, or *start one*",
    body: "Search drafts and live exams, or create something **new**. Open a row when you're ready for questions, **publish**, and the share link.",
    href: "/admin/exams",
    target: '[data-tour="exams-directory"]',
    expandNavGroup: "learning",
    cta: "Take me to Queue",
  },
  {
    id: "EXM-03",
    quest: 3,
    questLabel: "Learning together",
    title: "Mark with care, then *release*",
    body: "This is the **grading** surface. Pick a submitted script, **mark** it steadily, and **release** when you're proud of the result — *students will feel that care*.",
    href: "/admin/exams?tab=queue",
    target: '[data-tour="exams-queue"]',
    expandNavGroup: "learning",
    cta: "Next · Records",
  },

  // Records ×3
  {
    id: "REC-01",
    quest: 3,
    questLabel: "Learning together",
    title: "Scorecards in *one place*",
    body: "**Desk** is the directory of student records. **Insight** gently shows how Classes and Exams feed what you see here.",
    href: "/admin/records",
    target: '[data-tour="records-tabs"]',
    expandNavGroup: "learning",
    cta: "Keep going",
  },
  {
    id: "REC-02",
    quest: 3,
    questLabel: "Learning together",
    title: "Narrow until you *find them*",
    body: "**Parish**, batch, or a name search — scope the cohort until the right person appears, then open their **scorecard** for attendance and marks.",
    href: "/admin/records",
    target: '[data-tour="records-filters"]',
    expandNavGroup: "learning",
    cta: "Show the directory",
  },
  {
    id: "REC-03",
    quest: 3,
    questLabel: "Learning together",
    title: "The list points; the file *works*",
    body: "This directory stays **view-only** on purpose. The real work — attendance, exams, notes — waits on the **scorecard** once you open a row.",
    href: "/admin/records",
    target: '[data-tour="records-directory"]',
    expandNavGroup: "learning",
    cta: "Next · Gallery",
  },

  // Gallery ×3
  {
    id: "GAL-01",
    quest: 3,
    questLabel: "Learning together",
    title: "Portraits with *dignity*",
    body: "**Desk** is where you moderate graduation selfies. **Insight** explains when a portrait is needed on the student path — so expectations stay *kind and clear*.",
    href: "/admin/gallery",
    target: '[data-tour="gallery-tabs"]',
    expandNavGroup: "learning",
    cta: "Keep going",
  },
  {
    id: "GAL-02",
    quest: 3,
    questLabel: "Learning together",
    title: "See what still needs *a look*",
    body: "Portraits on file, **Flagged**, **Taken down** — a soft backlog so you know who still needs *a gentle decision*.",
    href: "/admin/gallery",
    target: '[data-tour="gallery-stats"]',
    expandNavGroup: "learning",
    cta: "Show the filters",
  },
  {
    id: "GAL-03",
    quest: 3,
    questLabel: "Learning together",
    title: "Filter, then *decide*",
    body: "**All**, **Flagged**, or Taken down — then open a portrait to approve, flag, or remove. You're protecting a public moment; *take the beat you need*.",
    href: "/admin/gallery",
    target: '[data-tour="gallery-filters"]',
    expandNavGroup: "learning",
    cta: "Stay in touch",
  },

  // ── Quest 4: Communications ──────────────────────────────────
  {
    id: "COM-00",
    quest: 4,
    questLabel: "Staying close",
    title: "How you *reach* them",
    body: "**Communications** is your reach: Listening Desk for one-to-one care, Community for the national room, Notices, Campaigns, and Email templates. Let's open the **inbox** first.",
    href: "/admin",
    target: '[data-tour="nav-group-reach"]',
    expandNavGroup: "reach",
    cta: "Open the Desk",
  },

  // Tickets ×3
  {
    id: "TIK-01",
    quest: 4,
    questLabel: "Staying close",
    title: "Who still needs *a reply*?",
    body: "**Inbox** versus **Settled** — a honest count of correspondence that still waits for *your voice*.",
    href: "/admin/tickets",
    target: '[data-tour="tickets-stats"]',
    expandNavGroup: "reach",
    cta: "Keep going",
  },
  {
    id: "TIK-02",
    quest: 4,
    questLabel: "Staying close",
    title: "This is *live care*",
    body: "**Desk** is the conversation in motion. **Insight** is there if you want a calm walk through claim, reply, and settle.",
    href: "/admin/tickets",
    target: '[data-tour="tickets-tabs"]',
    expandNavGroup: "reach",
    cta: "Show me the lanes",
  },
  {
    id: "TIK-03",
    quest: 4,
    questLabel: "Staying close",
    title: "Claim a thread, *walk with them*",
    body: "Filter **Inbox**, **Walking**, or Settled — then open a note. **Claim** it, reply in the thread, and settle when they're unblocked. Refine helps when the list grows long.",
    href: "/admin/tickets",
    target: '[data-tour="tickets-lanes"]',
    expandNavGroup: "reach",
    cta: "Next · Community",
  },

  // Community ×3
  {
    id: "CMY-01",
    quest: 4,
    questLabel: "Staying close",
    title: "The *shared* room",
    body: "This is the national student chat. **Desk** can post and keep the room safe; parish desks can read along and *stay aware*.",
    href: "/admin/community",
    target: '[data-tour="community-room"]',
    expandNavGroup: "reach",
    cta: "Keep going",
  },
  {
    id: "CMY-02",
    quest: 4,
    questLabel: "Staying close",
    title: "Listen to *the thread*",
    body: "Messages land here. If something shouldn't stay visible, long-press or right-click to **hide** it — firm when needed, *gentle in spirit*.",
    href: "/admin/community",
    target: '[data-tour="community-transcript"]',
    expandNavGroup: "reach",
    cta: "Show the composer",
  },
  {
    id: "CMY-03",
    quest: 4,
    questLabel: "Staying close",
    title: "Speak as **Listening Desk**",
    body: "National desks post from here as **Listening Desk**. Parish desks see a quiet note instead — posting stays with the *national team*.",
    href: "/admin/community",
    target: '[data-tour="community-composer"]',
    expandNavGroup: "reach",
    cta: "Next · Notices",
  },

  // Notices ×3
  {
    id: "NTC-01",
    quest: 4,
    questLabel: "Staying close",
    title: "Words on *the boards*",
    body: "**Desk** publishes home and student notices. **Insight** explains the slots so you never overcrowd what students see.",
    href: "/admin/announcements",
    target: '[data-tour="notices-tabs"]',
    expandNavGroup: "reach",
    cta: "Keep going",
  },
  {
    id: "NTC-02",
    quest: 4,
    questLabel: "Staying close",
    title: "Live, drafts, and *room to breathe*",
    body: "How many notices are **live**, how many wait as **drafts**, and how full the home and student boards are — *space managed with care*.",
    href: "/admin/announcements",
    target: '[data-tour="notices-stats"]',
    expandNavGroup: "reach",
    cta: "Show compose",
  },
  {
    id: "NTC-03",
    quest: 4,
    questLabel: "Staying close",
    title: "Write something *worth posting*",
    body: "Search what's already up, or tap **New notice**. Set the audience, then publish to **Live** — or keep a **Draft** until the wording feels right.",
    href: "/admin/announcements",
    target: '[data-tour="notices-compose"]',
    expandNavGroup: "reach",
    cta: "Next · Campaigns",
  },

  // Campaigns ×3
  {
    id: "CMP-01",
    quest: 4,
    questLabel: "Staying close",
    title: "Outbound with *intention*",
    body: "**Drafts** waiting, sends completed — a quiet count before you open anything. **Campaigns** are for moments that need a *wider reach*.",
    href: "/admin/campaigns",
    target: '[data-tour="campaigns-stats"]',
    expandNavGroup: "reach",
    cta: "Keep going",
  },
  {
    id: "CMP-02",
    quest: 4,
    questLabel: "Staying close",
    title: "Find a send, or *start fresh*",
    body: "Search an existing campaign, or create a **New draft**. Choose recipients when you're ready — *no rush on the first blank page*.",
    href: "/admin/campaigns",
    target: '[data-tour="campaigns-toolbar"]',
    expandNavGroup: "reach",
    cta: "Show the list",
  },
  {
    id: "CMP-03",
    quest: 4,
    questLabel: "Staying close",
    title: "Open, edit, send *when ready*",
    body: "Each row is a **campaign** you can shape. Open it to compose and **send**. Only remove one when it truly shouldn't stay on the desk.",
    href: "/admin/campaigns",
    target: '[data-tour="campaigns-list"]',
    expandNavGroup: "reach",
    cta: "Next · Templates",
  },

  // Email templates ×3
  {
    id: "EML-01",
    quest: 4,
    questLabel: "Staying close",
    title: "The letters that *already go out*",
    body: "**Desk** lists the lifecycle emails students receive. **Insight** explains defaults versus the wording you've made your own.",
    href: "/admin/email-templates",
    target: '[data-tour="email-templates-tabs"]',
    expandNavGroup: "reach",
    cta: "Keep going",
  },
  {
    id: "EML-02",
    quest: 4,
    questLabel: "Staying close",
    title: "How much have you *customised*?",
    body: "Catalog size and how many templates already carry **your voice** — a small *pride check* before you edit another.",
    href: "/admin/email-templates",
    target: '[data-tour="email-templates-stats"]',
    expandNavGroup: "reach",
    cta: "Show categories",
  },
  {
    id: "EML-03",
    quest: 4,
    questLabel: "Staying close",
    title: "Tune the words *they'll read*",
    body: "Filter by lifecycle moment, then open a card. **Subject** and **body** save for every future send — write as if you're *speaking to one student*.",
    href: "/admin/email-templates",
    target: '[data-tour="email-templates-categories"]',
    expandNavGroup: "reach",
    cta: "Meet Access",
  },

  // ── Quest 5: Access & Overview prove ─────────────────────────
  {
    id: "ACC-01",
    quest: 5,
    questLabel: "Your team & proof",
    title: "Who shares *this desk*",
    body: "**Access** is your staff home. **Desk** manages accounts; **Insight** clarifies national versus parish powers so invitations stay wise.",
    href: "/admin/access",
    target: '[data-tour="access-tabs"]',
    cta: "Keep going",
  },
  {
    id: "ACC-02",
    quest: 5,
    questLabel: "Your team & proof",
    title: "Invite someone *you trust*",
    body: "Search the directory, or **Invite admin** when a colleague should join this desk. The team grows *one careful welcome* at a time.",
    href: "/admin/access",
    target: '[data-tour="access-invite"]',
    cta: "Show Directory",
  },
  {
    id: "ACC-03",
    quest: 5,
    questLabel: "Your team & proof",
    title: "Roles, access, *your password*",
    body: "**Directory** sets desk role and access. **My password** is for your own credentials — keep it close; *you're the steward of this seat*.",
    href: "/admin/access",
    target: '[data-tour="access-desk"]',
    cta: "Home for the finish",
  },

  {
    id: "OV-PULSE",
    quest: 5,
    questLabel: "Your team & proof",
    title: "Feel the cohort *move*",
    body: "Back on Overview, **Pulse** shows the funnel and fees in motion. Tap a stage or fee when you want to look closer — *curiosity welcome*.",
    href: "/admin",
    target: '[data-tour="overview-pulse"]',
    tab: "pulse",
    cta: "Keep going",
  },
  {
    id: "OV-LEARN",
    quest: 5,
    questLabel: "Your team & proof",
    title: "Learning, *one glance* away",
    body: "**Classes**, **Exams**, and **Records** sit here in a compact list so live sessions don't hide. Jump in when something's happening now.",
    href: "/admin",
    target: '[data-tour="overview-learning"]',
    tab: "learning",
    cta: "Show Statement",
  },
  {
    id: "OV-STMT",
    quest: 5,
    questLabel: "Your team & proof",
    title: "Proof you can *hand over*",
    body: "Scope by cohort, batch, parish, and status — then preview and download **PDF**, **Excel**, Word, or JPG. Official lists, *ready when you are*.",
    href: "/admin",
    target: '[data-tour="overview-statement"]',
    tab: "statement",
    cta: "Almost done",
  },
  {
    id: "DONE",
    quest: 5,
    questLabel: "Your team & proof",
    title: "You're ready — and I'm *still here*",
    body: "That's **Command** with you from end to end. Come back to **Portal tour** anytime from Overview. When work gets noisy, start with **Today** — I'll meet you there.",
    href: "/admin",
    tab: "today",
    cta: "Finish · Open Today",
  },
];

export const SOD_ADMIN_TOUR_EXPAND_EVENT = "sod-admin-tour-expand";
export const SOD_ADMIN_TOUR_TAB_EVENT = "sod-admin-tour-tab";
export const ADMIN_TOUR_REQUIRED_PAGES = [
  "/admin",
  "/admin/students",
  "/admin/alumni",
  "/admin/payments",
  "/admin/parishes",
  "/admin/classes",
  "/admin/exams",
  "/admin/records",
  "/admin/gallery",
  "/admin/tickets",
  "/admin/community",
  "/admin/announcements",
  "/admin/campaigns",
  "/admin/email-templates",
  "/admin/access",
] as const;

export function tourStepPath(step: OverviewTourStep): string {
  return step.href ?? "/admin";
}

/** Match soft paths (/admin/exams?tab=queue → /admin/exams). */
export function tourPathMatches(pathname: string, href: string): boolean {
  const pathOnly = href.split("?")[0] || "/admin";
  if (pathOnly === "/admin") return pathname === "/admin";
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

/**
 * True when pathname matches and any required query params in `href` are present.
 * Example: href `/admin/exams?tab=queue` needs tab=queue on the current URL.
 */
export function tourHrefReady(
  pathname: string,
  search: string,
  href: string,
): boolean {
  if (!tourPathMatches(pathname, href)) return false;
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

function tourStepPageKey(step: OverviewTourStep): string {
  return tourStepPath(step).split("?")[0] || "/admin";
}

/**
 * Spotlight stops per desk page (welcome / DONE / sidebar connectors excluded
 * from the per-page minimum when they lack a page-specific target).
 */
export function countTourStopsByPage(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const step of OVERVIEW_TOUR_STEPS) {
    if (!step.target) continue;
    const key = tourStepPageKey(step);
    // Sidebar connectors live on /admin but are not Overview desk content.
    if (
      key === "/admin" &&
      (step.target.includes("nav-group-") || step.target.includes("nav-overview"))
    ) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Returns pages with fewer than `min` spotlight stops. Empty = coverage OK. */
export function assertTourCoverage(min = 3): string[] {
  const counts = countTourStopsByPage();
  return ADMIN_TOUR_REQUIRED_PAGES.filter((page) => (counts[page] ?? 0) < min);
}
