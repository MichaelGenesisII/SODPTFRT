"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createZoomClass,
  previewClassInvite,
  type ClassActionResult,
  type ClassInvitePreview,
} from "@/app/admin/classes/actions";
import { ClassesInsight } from "@/components/admin/class-workspace";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import {
  audienceLabel,
  DEFAULT_ATTENDANCE_THRESHOLD,
  DEFAULT_CLASS_DURATION_MINUTES,
  formatClassScheduleRange,
  type ClassAudience,
  type ZoomClass,
} from "@/lib/classes/types";
import {
  buildProgrammeMonthOptions,
  programmeMonthFieldCopy,
} from "@/lib/classes/programme-month-options";
import type { IntakeKey } from "@/lib/cohorts/intake";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";
import { formatCohortLabel, type Cohort } from "@/lib/cohorts";
import { DeskPagination } from "@/lib/ui/desk-pagination";
import type { TeacherProfile } from "@/lib/teacher/types";
import { teacherDisplayName } from "@/lib/teacher/types";

const fieldClass =
  "w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

const PAGE_SIZE = 12;

type Props = {
  profile: AdminProfile;
  classes: ZoomClass[];
  parishes: Pick<Parish, "id" | "name">[];
  batches: Batch[];
  cohorts: Cohort[];
  teachers: Pick<TeacherProfile, "id" | "email" | "full_name">[];
  zoomReady: boolean;
};

export function ClassesManager({
  profile,
  classes,
  parishes,
  batches,
  cohorts,
  teachers,
  zoomReady,
}: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const national = isNationalAdmin(profile);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [pageView, setPageView] = useState<"desk" | "insight">("desk");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter((c) =>
      [
        c.title,
        c.parish_name,
        c.batch_name,
        c.zoom_meeting_id,
        c.status,
        c.attendance_code,
        c.audience,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [classes, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageClasses = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query]);

  function classDetailHref(classId: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", String(page));
    const from = params.toString();
    return from
      ? `/admin/classes/${classId}?from=${encodeURIComponent(from)}`
      : `/admin/classes/${classId}`;
  }

  function run(
    action: () => Promise<ClassActionResult>,
    then?: () => void,
    label = "Working…",
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          success(next.message, "Classes");
          then?.();
          router.refresh();
          if (next.classId) {
            setCreating(false);
            router.push(classDetailHref(next.classId));
          }
        } else {
          error(next.message, "Classes");
        }
      } catch (err) {
        console.error("[classes/ui]", err);
        error(
          err instanceof Error && err.message
            ? err.message
            : "Could not save the class. Please try again.",
          "Classes",
        );
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        data-tour="classes-tabs"
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Classes page"
      >
        {(
          [
            { id: "desk" as const, label: "Desk" },
            { id: "insight" as const, label: "Insight" },
          ] as const
        ).map((tab) => {
          const active = pageView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPageView(tab.id)}
              className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                active ? "text-pine" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              {tab.label}
              <span
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      {pageView === "insight" ? (
        <ClassesInsight zoomReady={zoomReady} national={national} />
      ) : (
        <>
          {!zoomReady ? (
            <p className="border border-amber-800/25 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              Zoom API env vars are missing — schedule in-person or Zoom classes
              with a pasted link. Auto-create meeting and Zoom sync need
              configuration (see Insight). Check-in codes and manual marks work
              without Zoom.
            </p>
          ) : null}

          <section
            data-tour="classes-stats"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3.5"
          >
            <ClassStatTile
              label="Classes"
              value={classes.length}
              hint="On the books"
            />
            <ClassStatTile
              label="Upcoming"
              value={classes.filter((c) => c.status === "scheduled").length}
              hint="Not yet ended"
            />
            <ClassStatTile
              label="Needs teacher"
              shortLabel="No teacher"
              value={classes.filter((c) => !c.primary_teacher_id).length}
              hint="Unassigned"
            />
            <ClassStatTile
              label="With codes"
              shortLabel="Codes"
              value={classes.filter((c) => c.attendance_code).length}
              hint="Physical check-in"
            />
          </section>

          {creating ? (
            <section className="relative border border-stone bg-mist/30">
              <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
              <CreateClassForm
                profile={profile}
                parishes={parishes}
                batches={batches}
                cohorts={cohorts}
                teachers={teachers}
                national={national}
                zoomReady={zoomReady}
                pending={busy}
                busyLabel={busyLabel}
                onBack={() => setCreating(false)}
                onSubmit={(values) =>
                  run(
                    () => createZoomClass(values),
                    undefined,
                    values.send_email
                      ? "Saving class & sending…"
                      : "Saving class…",
                  )
                }
              />
            </section>
          ) : (
            <>
              <div
                data-tour="classes-schedule"
                className="border border-stone bg-mist/40 px-3 py-3 sm:px-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                      Hall directory
                    </p>
                    <p className="mt-1 text-sm text-ink/60">
                      View only — open a row for the class file
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:max-w-md">
                    <label className="block min-w-0 flex-1 text-sm">
                      <span className="sr-only">Search classes</span>
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search title, audience, status…"
                        className={fieldClass}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setCreating(true)}
                      className="shrink-0 border border-pine/35 px-3 py-2 text-sm font-medium text-pine hover:border-pine"
                    >
                      + Schedule
                    </button>
                  </div>
                </div>
              </div>

              <section className="border border-stone bg-mist/30">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4 sm:py-3">
                  <p>
                    {filtered.length === 0
                      ? "No classes match."
                      : `Showing ${rangeFrom}–${rangeTo} of ${filtered.length}`}
                  </p>
                </div>

                <div className="hidden border-b border-stone bg-white/50 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_5rem_2rem] md:gap-3">
                  <span>Class</span>
                  <span>When · audience</span>
                  <span>Status</span>
                  <span>Present</span>
                  <span />
                </div>

                <ul className="divide-y divide-stone">
                  {pageClasses.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={classDetailHref(item.id)}
                        className="group grid items-center gap-3 px-3 py-3 transition-colors hover:bg-white/70 sm:px-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_5rem_2rem]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink group-hover:text-pine">
                            {item.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink/45">
                            {item.primary_teacher_name
                              ? `Teacher · ${item.primary_teacher_name}`
                              : "Needs teacher"}
                          </span>
                          {item.attendance_code ? (
                            <span className="mt-0.5 block font-mono text-xs text-ink/45">
                              Code {item.attendance_code}
                            </span>
                          ) : null}
                        </span>
                        <span className="hidden min-w-0 md:block">
                          <span className="block truncate text-sm text-ink/70">
                            {formatClassScheduleRange(
                              item.scheduled_start,
                              item.scheduled_end,
                            )}
                          </span>
                          <span className="block truncate text-xs text-ink/45">
                            {audienceLabel(
                              item.audience,
                              item.parish_name,
                              item.batch_name,
                              item.cohort_name,
                              item.year,
                            )}
                          </span>
                        </span>
                        <span className="hidden text-xs uppercase tracking-[0.08em] text-ink/55 md:block">
                          {item.status}
                        </span>
                        <span className="hidden tabular-nums text-sm text-ink/60 md:block">
                          {item.present_count ?? 0}
                        </span>
                        <span className="hidden justify-self-end text-pine/40 group-hover:text-pine md:flex">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                {pageClasses.length === 0 ? (
                  <div className="px-4 py-16 text-center">
                    <p className="font-display text-lg text-pine">
                      {classes.length === 0
                        ? "Schedule the first class"
                        : "No classes match"}
                    </p>
                    <p className="mt-2 text-sm text-ink/55">
                      {classes.length === 0
                        ? "Create a session, share the check-in code, and track attendance on the class file."
                        : "Try a different search."}
                    </p>
                  </div>
                ) : null}

                <DeskPagination
                  page={currentPage}
                  totalItems={filtered.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  className="px-3 pb-2.5 sm:px-4 sm:pb-3"
                  itemLabel="classes"
                />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ClassStatTile({
  label,
  shortLabel,
  value,
  hint,
}: {
  label: string;
  shortLabel?: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="border border-stone bg-mist/90 px-3 py-3.5 sm:px-4 sm:py-4">
      <p className="truncate text-[0.58rem] font-medium uppercase tracking-[0.12em] text-ink/40 sm:text-[0.65rem] sm:tracking-[0.16em]">
        <span className="sm:hidden">{shortLabel ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </p>
      <p className="mt-1 font-display text-2xl tabular-nums text-pine sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 truncate text-[0.65rem] text-ink/45">{hint}</p>
    </div>
  );
}

function CreateClassForm({
  profile,
  parishes,
  batches,
  cohorts,
  teachers,
  national,
  zoomReady,
  pending,
  busyLabel,
  onBack,
  onSubmit,
}: {
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Batch[];
  cohorts: Cohort[];
  teachers: Pick<TeacherProfile, "id" | "email" | "full_name">[];
  national: boolean;
  zoomReady: boolean;
  pending: boolean;
  busyLabel: string | null;
  onBack: () => void;
  onSubmit: (values: {
    title: string;
    description?: string;
    audience: ClassAudience;
    parish_id: string | null;
    batch_id: string | null;
    cohort_id?: string | null;
    year?: number | null;
    programme_month?: number | null;
    scheduled_start: string;
    scheduled_end: string;
    duration_minutes: number;
    create_zoom_meeting: boolean;
    zoom_meeting_id?: string;
    zoom_join_url?: string;
    zoom_passcode?: string;
    generate_code?: boolean;
    show_checkin_code_to_students?: boolean;
    send_email?: boolean;
    email_notes?: string;
    primary_teacher_id?: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<ClassAudience>(
    national ? "everyone" : "parish",
  );
  const [parishId, setParishId] = useState(profile.parish_id ?? "");
  const [batchId, setBatchId] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [programmeYear, setProgrammeYear] = useState("");
  const [programmeMonth, setProgrammeMonth] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [duration, setDuration] = useState(DEFAULT_CLASS_DURATION_MINUTES);
  const [createZoom, setCreateZoom] = useState(zoomReady);
  const [meetingId, setMeetingId] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [passcode, setPasscode] = useState("");
  const [generateCode, setGenerateCode] = useState(true);
  const [showCodeOnPortal, setShowCodeOnPortal] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [emailNotes, setEmailNotes] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [preview, setPreview] = useState<ClassInvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { error: toastError } = useToast();

  useEffect(() => {
    if (!verifyOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) setVerifyOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [verifyOpen, pending]);

  const parishBatches = batches.filter((b) =>
    parishId ? b.parish_id === parishId : true,
  );
  const programmeYears = [
    ...new Set(cohorts.map((cohort) => cohort.year_start)),
  ].sort((a, b) => b - a);
  const selectedCohort = cohorts.find((cohort) => cohort.id === cohortId);
  const scheduleDate = useMemo(() => {
    if (!startLocal) return new Date();
    const parsed = new Date(startLocal);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [startLocal]);
  const programmeMonthOptions = useMemo(
    () =>
      buildProgrammeMonthOptions({
        audience,
        intakeKey: selectedCohort?.intake_key as IntakeKey | null | undefined,
        programmeYear: programmeYear ? Number(programmeYear) : null,
        scheduleDate,
      }),
    [
      audience,
      selectedCohort?.intake_key,
      programmeYear,
      scheduleDate,
    ],
  );
  const programmeMonthHelp = programmeMonthFieldCopy({
    audience,
    intakeKey: selectedCohort?.intake_key as IntakeKey | null | undefined,
    scheduleDate,
    optionCount: programmeMonthOptions.length,
  });

  useEffect(() => {
    if (!programmeMonth) return;
    if (
      !programmeMonthOptions.some(
        (option) => String(option.value) === programmeMonth,
      )
    ) {
      setProgrammeMonth("");
    }
  }, [programmeMonth, programmeMonthOptions]);

  function toLocalInputValue(date: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function syncEndFromStart(nextStart: string, minutes = duration) {
    if (!nextStart) return;
    const start = new Date(nextStart);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + Math.max(15, minutes) * 60_000);
    setEndLocal(toLocalInputValue(end));
  }

  function buildPayload() {
    return {
      title,
      description,
      audience,
      parish_id: parishId || null,
      batch_id: batchId || null,
      cohort_id: cohortId || null,
      year: programmeYear ? Number(programmeYear) : null,
      programme_month: programmeMonth ? Number(programmeMonth) : null,
      scheduled_start: new Date(startLocal).toISOString(),
      scheduled_end: new Date(endLocal).toISOString(),
      duration_minutes: duration,
      create_zoom_meeting: createZoom && zoomReady,
      zoom_meeting_id: meetingId || undefined,
      zoom_join_url: joinUrl || undefined,
      zoom_passcode: passcode || undefined,
      generate_code: generateCode,
      show_checkin_code_to_students: generateCode && showCodeOnPortal,
      send_email: sendEmail,
      email_notes: emailNotes.trim() || undefined,
      primary_teacher_id: teacherId || null,
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!startLocal || !endLocal) {
      toastError("Choose start and end times for the class.", "Classes");
      return;
    }
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toastError("Those schedule times are not valid.", "Classes");
      return;
    }
    if (end <= start) {
      toastError("End must be after start.", "Classes");
      return;
    }
    if (audience === "parish" && !parishId && national) {
      toastError("Choose a parish for this class.", "Classes");
      return;
    }
    if (audience === "batch" && !batchId) {
      toastError("Choose a batch for this class.", "Classes");
      return;
    }
    if (audience === "cohort" && !cohortId) {
      toastError("Choose a cohort for this class.", "Classes");
      return;
    }
    if (audience === "year" && !programmeYear) {
      toastError("Choose a programme year for this class.", "Classes");
      return;
    }
    if (!sendEmail) {
      onSubmit(buildPayload());
      return;
    }
    setVerifyOpen(true);
    setPreviewLoading(true);
    void previewClassInvite({
      audience,
      parish_id: parishId || null,
      batch_id: batchId || null,
      cohort_id: cohortId || null,
      year: programmeYear ? Number(programmeYear) : null,
    }).then((next) => {
      setPreview(next);
      setPreviewLoading(false);
    });
  }

  return (
    <>
    <form onSubmit={submit} className="space-y-4 px-3 py-4 sm:px-6 sm:py-5">
      <header>
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
        >
          <span aria-hidden>←</span> Directory
        </button>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Live hall
        </p>
        <h2 className="mt-1 font-display text-xl text-pine sm:text-2xl">
          Schedule a class
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          Attendance writes straight into each student’s Records. Use a check-in
          code for physical seats, Zoom sync for online, or mark manually.
        </p>
      </header>

      <label className="block text-sm">
        Title
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`mt-1 ${fieldClass}`}
          placeholder="e.g. Week 4 — Discipleship & Witness"
        />
      </label>
      <label className="block text-sm">
        Notes for students
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`mt-1 ${fieldClass}`}
        />
      </label>

      <label className="block text-sm">
        Assigned teacher
        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          className={`mt-1 ${fieldClass}`}
        >
          <option value="">Assign later</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacherDisplayName(teacher)} ({teacher.email})
            </option>
          ))}
        </select>
        {teachers.length === 0 ? (
          <span className="mt-1 block text-xs text-ink/45">
            No active teachers yet. National desk can invite them under Finance
            → Teachers.
          </span>
        ) : null}
      </label>

      <fieldset>
        <legend className="text-sm">Who is this for?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(
            [
              ...(national
                ? ([
                    {
                      id: "everyone" as const,
                      label: "Everyone",
                      hint: "All students",
                    },
                    {
                      id: "cohort" as const,
                      label: "Cohort",
                      hint: "Programme cohort",
                    },
                    {
                      id: "year" as const,
                      label: "Year",
                      hint: "Programme year",
                    },
                  ] as const)
                : []),
              {
                id: "parish" as const,
                label: "Parish",
                hint: national ? "One parish" : "Your parish",
              },
              {
                id: "batch" as const,
                label: "Batch",
                hint: "One class / batch",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.id}
              className={`cursor-pointer border px-3 py-2 text-sm ${
                audience === opt.id
                  ? "border-pine bg-white"
                  : "border-stone bg-white/40"
              }`}
            >
              <input
                type="radio"
                name="audience"
                className="sr-only"
                checked={audience === opt.id}
                onChange={() => {
                  setAudience(opt.id);
                  setProgrammeMonth("");
                  if (opt.id === "everyone") {
                    setParishId("");
                    setBatchId("");
                    setCohortId("");
                    setProgrammeYear("");
                  } else if (opt.id === "parish") {
                    setBatchId("");
                    setCohortId("");
                    setProgrammeYear("");
                    if (!national) setParishId(profile.parish_id ?? "");
                  } else if (opt.id === "cohort" || opt.id === "year") {
                    setParishId("");
                    setBatchId("");
                    setCohortId("");
                    setProgrammeYear("");
                  }
                }}
              />
              <span className="font-medium text-pine">{opt.label}</span>
              <span className="mt-0.5 block text-xs text-ink/50">{opt.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {audience !== "everyone" &&
      audience !== "cohort" &&
      audience !== "year" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(national || audience === "parish") && audience !== "batch" ? (
            <label className="block text-sm">
              Parish
              <select
                required={audience === "parish"}
                value={parishId}
                disabled={!national}
                onChange={(e) => {
                  setParishId(e.target.value);
                  setBatchId("");
                }}
                className={`mt-1 ${fieldClass}`}
              >
                <option value="">Select parish</option>
                {parishes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {audience === "batch" ? (
            <>
              {national ? (
                <label className="block text-sm">
                  Parish
                  <select
                    value={parishId}
                    onChange={(e) => {
                      setParishId(e.target.value);
                      setBatchId("");
                    }}
                    className={`mt-1 ${fieldClass}`}
                  >
                    <option value="">All parishes</option>
                    {parishes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block text-sm">
                Batch / class
                <select
                  required
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="">Select batch</option>
                  {parishBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {formatBatchLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </div>
      ) : null}

      {audience === "cohort" ? (
        <label className="block text-sm">
          Cohort
          <select
            required
            value={cohortId}
            onChange={(e) => {
              setCohortId(e.target.value);
              setProgrammeMonth("");
            }}
            className={`mt-1 ${fieldClass}`}
          >
            <option value="">Select cohort</option>
            {cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {formatCohortLabel(cohort)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {audience === "year" ? (
        <label className="block text-sm">
          Programme year
          <select
            required
            value={programmeYear}
            onChange={(e) => {
              setProgrammeYear(e.target.value);
              setProgrammeMonth(e.target.value);
            }}
            className={`mt-1 ${fieldClass}`}
          >
            <option value="">Select year</option>
            {programmeYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block text-sm">
        Programme month (exam unlock)
        <select
          value={programmeMonth}
          onChange={(e) => setProgrammeMonth(e.target.value)}
          className={`mt-1 ${fieldClass}`}
        >
          <option value="">None — no year-exam unlock</option>
          {programmeMonthOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.hint ? ` · ${option.hint}` : ""}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink/50">{programmeMonthHelp}</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Starts
          <input
            required
            type="datetime-local"
            value={startLocal}
            onChange={(e) => {
              const next = e.target.value;
              setStartLocal(next);
              setProgrammeMonth("");
              syncEndFromStart(next);
            }}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-sm">
          Ends
          <input
            required
            type="datetime-local"
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>

      <label className="block text-sm">
        Expected length (minutes)
        <input
          type="number"
          min={15}
          max={480}
          value={duration}
          onChange={(e) => {
            const next = Number(e.target.value) || DEFAULT_CLASS_DURATION_MINUTES;
            setDuration(next);
            if (startLocal) syncEndFromStart(startLocal, next);
          }}
          className={`mt-1 ${fieldClass}`}
        />
        <span className="mt-1 block text-xs text-ink/45">
          Zoom present rule: ≥{" "}
          {Math.ceil(duration * (DEFAULT_ATTENDANCE_THRESHOLD / 100))} minutes (
          {DEFAULT_ATTENDANCE_THRESHOLD}%).
          Code / manual marks write present directly to Records.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={generateCode}
          onChange={(e) => {
            setGenerateCode(e.target.checked);
            if (!e.target.checked) setShowCodeOnPortal(false);
          }}
          className="mt-1"
        />
        <span>
          Generate check-in code
          <span className="mt-0.5 block text-xs text-ink/50">
            Students enter the code under Classes to mark present (physical or
            hybrid). Share in the room by default — not on the portal.
          </span>
        </span>
      </label>

      {generateCode ? (
        <label className="ml-6 flex items-start gap-2 text-sm text-ink/75">
          <input
            type="checkbox"
            checked={showCodeOnPortal}
            onChange={(e) => setShowCodeOnPortal(e.target.checked)}
            className="mt-1"
          />
          <span>
            Show check-in code on student portal
            <span className="mt-0.5 block text-xs text-ink/50">
              Off by default. Only enable if you accept students may check in
              without attending in person.
            </span>
          </span>
        </label>
      ) : null}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.target.checked)}
          className="mt-1"
        />
        <span>
          Send students an email about this class
          <span className="mt-0.5 block text-xs text-ink/50">
            You’ll review the details in a confirmation modal before anything is
            sent.
          </span>
        </span>
      </label>

      {sendEmail ? (
        <label className="block text-sm">
          Extra note in the email (optional)
          <textarea
            rows={2}
            value={emailNotes}
            onChange={(e) => setEmailNotes(e.target.value)}
            className={`mt-1 ${fieldClass}`}
            placeholder="e.g. Bring your journal · join 5 minutes early"
          />
        </label>
      ) : null}

      {zoomReady ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={createZoom}
            onChange={(e) => setCreateZoom(e.target.checked)}
            className="mt-1"
          />
          <span>
            Create Zoom meeting via API
            <span className="mt-0.5 block text-xs text-ink/50">
              On by default when Zoom is configured. Untick for in-person-only
              or if you will paste a join link below.
            </span>
          </span>
        </label>
      ) : null}

      {!createZoom ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            Zoom join URL (optional)
            <input
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
              className={`mt-1 ${fieldClass}`}
              placeholder="https://zoom.us/j/…"
            />
          </label>
          <label className="block text-sm">
            Meeting ID
            <input
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              className={`mt-1 ${fieldClass}`}
              placeholder="For attendance sync"
            />
          </label>
          <label className="block text-sm">
            Passcode
            <input
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[2.5rem] min-w-[8.5rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist disabled:opacity-60"
        >
          {pending && !sendEmail ? (
            <DeskLoader
              label={busyLabel ?? "Saving…"}
              tone="mist"
            />
          ) : sendEmail ? (
            "Review & save"
          ) : (
            "Save class"
          )}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onBack}
          className="border border-stone px-4 py-2.5 text-sm text-ink/70 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>

    {verifyOpen ? (
      <div
        className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
        role="presentation"
        onClick={() => !pending && setVerifyOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="class-email-verify-title"
          className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto border border-stone bg-mist text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)]"
          onClick={(event) => event.stopPropagation()}
        >
          <DeskLoaderOverlay
            active={pending}
            label={busyLabel ?? "Sending…"}
          />
          <div className="border-b border-stone px-4 py-4 sm:px-5">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Confirm before send
            </p>
            <h3
              id="class-email-verify-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              Verify class email
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Check these details. Emails go out only after you confirm.
            </p>
          </div>
          <div className="space-y-3 px-4 py-4 text-sm sm:px-5">
            <p>
              <span className="text-ink/45">Title · </span>
              <span className="font-medium text-ink">{title || "—"}</span>
            </p>
            <p>
              <span className="text-ink/45">When · </span>
              {startLocal
                ? new Date(startLocal).toLocaleString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}{" "}
              · {duration} min
            </p>
            <p>
              <span className="text-ink/45">Audience · </span>
              {previewLoading
                ? "Counting recipients…"
                : preview?.audienceLabel ?? audience}
            </p>
            <p>
              <span className="text-ink/45">Recipients · </span>
              {previewLoading
                ? "…"
                : `${preview?.recipientCount ?? 0} student${
                    (preview?.recipientCount ?? 0) === 1 ? "" : "s"
                  }`}
            </p>
            {preview?.sampleEmails?.length ? (
              <p className="text-xs text-ink/50">
                Sample: {preview.sampleEmails.join(", ")}
                {(preview.recipientCount ?? 0) > preview.sampleEmails.length
                  ? "…"
                  : ""}
              </p>
            ) : null}
            {(createZoom && zoomReady) || joinUrl || meetingId ? (
              <p className="text-xs text-ink/55">
                Zoom details will be included when available after the meeting is
                created.
              </p>
            ) : (
              <p className="text-xs text-ink/55">
                No Zoom link yet — email will point students to Classes in the
                portal. Share the check-in code in the room unless you enable portal
                visibility on the class file.
              </p>
            )}
            {emailNotes.trim() || description.trim() ? (
              <div className="border border-stone bg-white/70 px-3 py-2 text-xs text-ink/65 whitespace-pre-wrap">
                {[description.trim(), emailNotes.trim()]
                  .filter(Boolean)
                  .join("\n\n")}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-stone px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
            <button
              type="button"
              disabled={pending}
              onClick={() => setVerifyOpen(false)}
              className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
            >
              Back to edit
            </button>
            <button
              type="button"
              disabled={pending || previewLoading}
              onClick={() => {
                onSubmit(buildPayload());
              }}
              className="inline-flex min-h-[2.5rem] min-w-[11rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
            >
              {pending ? (
                <DeskLoader
                  label={busyLabel ?? "Sending…"}
                  tone="mist"
                />
              ) : (
                "Confirm & send emails"
              )}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
