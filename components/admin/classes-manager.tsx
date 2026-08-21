"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  createZoomClass,
  deleteZoomClass,
  getClassAttendance,
  markManualAttendance,
  previewClassInvite,
  regenerateClassAttendanceCode,
  searchClassStudents,
  setZoomClassStatus,
  syncZoomClassAttendance,
  type ClassActionResult,
  type ClassInvitePreview,
} from "@/app/admin/classes/actions";
import { ClassWorkspace, ClassesInsight } from "@/components/admin/class-workspace";
import { useToast } from "@/components/ui/toast";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import {
  audienceLabel,
  type ClassAudience,
  type ZoomClass,
  type ZoomClassAttendance,
} from "@/lib/classes/types";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";
import { formatCohortLabel, type Cohort } from "@/lib/cohorts";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const fieldClass =
  "w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

const PAGE_SIZE = 8;

type MobileSurface = "directory" | "workspace";

type Props = {
  profile: AdminProfile;
  classes: ZoomClass[];
  parishes: Pick<Parish, "id" | "name">[];
  batches: Batch[];
  cohorts: Cohort[];
  zoomReady: boolean;
  meetingSdkReady: boolean;
};

export function ClassesManager({
  profile,
  classes,
  parishes,
  batches,
  cohorts,
  zoomReady,
  meetingSdkReady,
}: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const national = isNationalAdmin(profile);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    classes[0]?.id ?? null,
  );
  const [mobileSurface, setMobileSurface] =
    useState<MobileSurface>("directory");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [roster, setRoster] = useState<ZoomClassAttendance[]>([]);
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

  const directoryClass =
    mobileSurface === "directory" ? "block" : "hidden lg:block";
  const workspaceClass =
    mobileSurface === "workspace" ? "block" : "hidden lg:block";

  useEffect(() => {
    setPage(1);
    setMobileSurface("directory");
  }, [query]);

  useEffect(() => {
    if (selectedId && filtered.some((c) => c.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  const selected =
    filtered.find((c) => c.id === selectedId) ??
    classes.find((c) => c.id === selectedId) ??
    null;

  function reloadRoster(id: string) {
    void getClassAttendance(id).then(setRoster);
  }

  useEffect(() => {
    if (!selectedId || creating) {
      setRoster([]);
      return;
    }
    let cancelled = false;
    void getClassAttendance(selectedId).then((rows) => {
      if (!cancelled) setRoster(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, creating, classes]);

  function run(action: () => Promise<ClassActionResult>, then?: () => void) {
    startTransition(async () => {
      const next = await action();
      if (next.ok) {
        success(next.message, "Classes");
        then?.();
        router.refresh();
        if (next.classId) {
          setSelectedId(next.classId);
          setCreating(false);
          setMobileSurface("workspace");
        }
      } else {
        error(next.message, "Classes");
      }
    });
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
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

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Stat label="Classes" value={classes.length} hint="On the books" />
            <Stat
              label="Upcoming"
              value={classes.filter((c) => c.status === "scheduled").length}
              hint="Not yet ended"
            />
            <Stat
              label="With codes"
              value={classes.filter((c) => c.attendance_code).length}
              hint="Physical check-in"
            />
            <Stat
              label="Present marks"
              short="Present"
              value={classes.reduce((n, c) => n + (c.present_count ?? 0), 0)}
              hint="On roster / Records"
            />
          </section>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <aside className={`${directoryClass} border border-stone bg-mist/50`}>
              <div className="space-y-2 border-b border-stone px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.55rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                    Hall directory
                  </p>
                  <p className="text-[0.65rem] tabular-nums text-ink/40">
                    {filtered.length
                      ? `${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filtered.length)}/${filtered.length}`
                      : "0"}
                  </p>
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search classes…"
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCreating(true);
                    setSelectedId(null);
                    setMobileSurface("workspace");
                  }}
                  className="w-full border border-pine/30 px-2 py-1.5 text-sm font-medium text-pine hover:border-pine"
                >
                  + Schedule class
                </button>
              </div>
              <ul className="max-h-[min(62vh,36rem)] divide-y divide-stone overflow-y-auto lg:max-h-[min(70vh,40rem)]">
                {pageClasses.length === 0 ? (
                  <li className="px-3 py-8 text-center text-sm text-ink/50">
                    No classes yet.
                  </li>
                ) : (
                  pageClasses.map((item) => {
                    const active = item.id === selectedId && !creating;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setCreating(false);
                            setSelectedId(item.id);
                            setMobileSurface("workspace");
                          }}
                          className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left ${
                            active ? "bg-pine text-mist" : "hover:bg-white/60"
                          }`}
                        >
                          <span className="truncate text-sm font-medium">
                            {item.title}
                          </span>
                          <span
                            className={`text-[0.65rem] uppercase tracking-[0.1em] ${
                              active ? "text-mist/65" : "text-ink/45"
                            }`}
                          >
                            {item.status} ·{" "}
                            {audienceLabel(
                              item.audience,
                              item.parish_name,
                              item.batch_name,
                              item.cohort_name,
                              item.year,
                            )}
                            {item.present_count != null
                              ? ` · ${item.present_count} present`
                              : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <DeskPagination
                page={currentPage}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                className="px-2 pb-2"
                itemLabel="classes"
              />
            </aside>

            <section
              className={`${workspaceClass} min-h-[16rem] border border-stone bg-mist sm:min-h-[22rem]`}
            >
              {creating ? (
                <CreateClassForm
                  profile={profile}
                  parishes={parishes}
                  batches={batches}
                  cohorts={cohorts}
                  national={national}
                  zoomReady={zoomReady}
                  pending={pending}
                  onBack={() => {
                    setCreating(false);
                    setMobileSurface("directory");
                  }}
                  onSubmit={(values) => run(() => createZoomClass(values))}
                />
              ) : !selected ? (
                <div className="flex min-h-[16rem] flex-col items-center justify-center px-5 py-12 text-center sm:min-h-[22rem]">
                  <p className="font-display text-xl text-pine">Open the hall</p>
                  <p className="mt-2 max-w-sm text-sm text-ink/55">
                    Schedule for everyone, a parish, or a batch. Share a check-in
                    code, host Zoom in the portal, or sync after the meeting.
                  </p>
                </div>
              ) : (
                <ClassWorkspace
                  item={selected}
                  roster={roster}
                  pending={pending}
                  zoomReady={zoomReady}
                  meetingSdkReady={meetingSdkReady}
                  onBack={() => setMobileSurface("directory")}
                  onSync={() =>
                    run(() => syncZoomClassAttendance(selected.id), () => {
                      reloadRoster(selected.id);
                    })
                  }
                  onRegenCode={() =>
                    run(() => regenerateClassAttendanceCode(selected.id))
                  }
                  onManual={(userId, present) =>
                    run(
                      () =>
                        markManualAttendance({
                          classId: selected.id,
                          userId,
                          present,
                        }),
                      () => reloadRoster(selected.id),
                    )
                  }
                  onSearchStudents={(q) => searchClassStudents(selected.id, q)}
                  onStatus={(status) =>
                    run(() => setZoomClassStatus(selected.id, status))
                  }
                  onDelete={() => {
                    if (
                      !window.confirm(
                        "Remove this class and its attendance rows?",
                      )
                    ) {
                      return;
                    }
                    run(() => deleteZoomClass(selected.id), () => {
                      setSelectedId(null);
                      setMobileSurface("directory");
                    });
                  }}
                />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  short,
  value,
  hint,
}: {
  label: string;
  short?: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-stone/50 bg-white px-2 py-2.5 text-center sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-3 sm:text-left">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine sm:h-11 sm:w-11">
        <span className="font-display text-xl text-mist tabular-nums">{value}</span>
      </div>
      <div className="min-w-0 sm:border-l sm:border-stone/70 sm:pl-3">
        <p className="truncate text-[0.7rem] font-medium text-pine sm:text-sm">
          <span className="sm:hidden">{short ?? label}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="mt-0.5 hidden truncate text-xs text-ink/50 sm:block">
          {hint}
        </p>
      </div>
    </div>
  );
}

function CreateClassForm({
  profile,
  parishes,
  batches,
  cohorts,
  national,
  zoomReady,
  pending,
  onBack,
  onSubmit,
}: {
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Batch[];
  cohorts: Cohort[];
  national: boolean;
  zoomReady: boolean;
  pending: boolean;
  onBack: () => void;
  onSubmit: (values: {
    title: string;
    description?: string;
    audience: ClassAudience;
    parish_id: string | null;
    batch_id: string | null;
    cohort_id?: string | null;
    year?: number | null;
    scheduled_start: string;
    scheduled_end: string;
    duration_minutes: number;
    create_zoom_meeting: boolean;
    zoom_meeting_id?: string;
    zoom_join_url?: string;
    zoom_passcode?: string;
    generate_code?: boolean;
    send_email?: boolean;
    email_notes?: string;
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
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [duration, setDuration] = useState(90);
  const [createZoom, setCreateZoom] = useState(false);
  const [meetingId, setMeetingId] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [passcode, setPasscode] = useState("");
  const [generateCode, setGenerateCode] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [emailNotes, setEmailNotes] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [preview, setPreview] = useState<ClassInvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const parishBatches = batches.filter((b) =>
    parishId ? b.parish_id === parishId : true,
  );
  const programmeYears = [
    ...new Set(cohorts.map((cohort) => cohort.year_start)),
  ].sort((a, b) => b - a);

  function buildPayload() {
    return {
      title,
      description,
      audience,
      parish_id: parishId || null,
      batch_id: batchId || null,
      cohort_id: cohortId || null,
      year: programmeYear ? Number(programmeYear) : null,
      scheduled_start: new Date(startLocal).toISOString(),
      scheduled_end: new Date(endLocal).toISOString(),
      duration_minutes: duration,
      create_zoom_meeting: createZoom && zoomReady,
      zoom_meeting_id: meetingId || undefined,
      zoom_join_url: joinUrl || undefined,
      zoom_passcode: passcode || undefined,
      generate_code: generateCode,
      send_email: sendEmail,
      email_notes: emailNotes.trim() || undefined,
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!startLocal || !endLocal) return;
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
            onChange={(e) => setCohortId(e.target.value)}
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
            onChange={(e) => setProgrammeYear(e.target.value)}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Starts
          <input
            required
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
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
          onChange={(e) => setDuration(Number(e.target.value) || 90)}
          className={`mt-1 ${fieldClass}`}
        />
        <span className="mt-1 block text-xs text-ink/45">
          Zoom present rule: ≥ {Math.ceil(duration * 0.75)} minutes (75%).
          Code / manual marks write present directly to Records.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={generateCode}
          onChange={(e) => setGenerateCode(e.target.checked)}
          className="mt-1"
        />
        <span>
          Generate check-in code
          <span className="mt-0.5 block text-xs text-ink/50">
            Students enter the code to mark themselves present (physical or
            hybrid).
          </span>
        </span>
      </label>

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
              Optional — skip for in-person-only classes.
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
          className="bg-pine px-4 py-2.5 text-sm font-medium text-mist disabled:opacity-60"
        >
          {pending ? "Saving…" : sendEmail ? "Review & save" : "Save class"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="border border-stone px-4 py-2.5 text-sm text-ink/70"
        >
          Cancel
        </button>
      </div>
    </form>

    {verifyOpen ? (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="class-email-verify-title"
      >
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-stone bg-mist shadow-lg">
          <div className="border-b border-stone px-4 py-3 sm:px-5">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Confirm before send
            </p>
            <h3
              id="class-email-verify-title"
              className="mt-1 font-display text-xl text-pine"
            >
              Verify class email
            </h3>
            <p className="mt-1 text-sm text-ink/60">
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
                portal. Share the check-in code in the room if you generated one.
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
          <div className="flex flex-wrap gap-2 border-t border-stone px-4 py-3 sm:px-5">
            <button
              type="button"
              disabled={pending || previewLoading}
              onClick={() => {
                setVerifyOpen(false);
                onSubmit(buildPayload());
              }}
              className="bg-pine px-4 py-2.5 text-sm font-medium text-mist disabled:opacity-60"
            >
              {pending ? "Sending…" : "Confirm & send emails"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setVerifyOpen(false)}
              className="border border-stone px-4 py-2.5 text-sm text-ink/70"
            >
              Back to edit
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
