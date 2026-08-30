import Link from "next/link";

export function CohortsInsight() {
  return (
    <div className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-3 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Programme structure
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          Insight
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
          How programme cohorts, parish batches, and Saturday slots fit
          together — and how that differs from the Students desk filter.
        </p>
      </div>

      <div className="border-b border-stone bg-white/40 px-3 py-5 sm:px-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          The placement ladder
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
          {[
            {
              step: "1",
              title: "Programme cohort",
              hint: "Cohorts desk · UK-wide intake",
              example: "SP 2022/23",
              tone: "pine",
            },
            {
              step: "2",
              title: "Parish batch",
              hint: "Parishes desk · local year group",
              example: "Year 1 · Dagenham",
              tone: "celadon",
            },
            {
              step: "3",
              title: "Saturday slot",
              hint: "Enrolment · monthly class day",
              example: "2nd Saturday",
              tone: "mist",
            },
          ].map((item, index) => (
            <li key={item.step} className="contents">
              <div
                className={`border px-4 py-3 ${
                  item.tone === "pine"
                    ? "border-pine/30 bg-pine/5"
                    : item.tone === "celadon"
                      ? "border-celadon/40 bg-celadon/10"
                      : "border-stone bg-mist/80"
                }`}
              >
                <p className="font-display text-lg tabular-nums text-celadon/80">
                  {item.step}
                </p>
                <p className="mt-1 text-sm font-medium text-pine">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/55">
                  {item.hint}
                </p>
                <p className="mt-2 text-xs font-medium text-ink/70">
                  e.g. {item.example}
                </p>
              </div>
              {index < 2 ? (
                <div
                  className="hidden items-center justify-center text-pine/35 sm:flex"
                  aria-hidden
                >
                  →
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm leading-relaxed text-ink/60">
          Creating a programme cohort under Manage also opens{" "}
          <span className="font-medium text-pine">four Saturday slots</span>{" "}
          (1st–4th Saturday). Students pick one at enrolment; admins can
          reassign on the student file.
        </p>
      </div>

      <div className="grid gap-px border-b border-stone bg-stone sm:grid-cols-2">
        <article className="bg-mist/90 px-4 py-4 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-pine">
            Cohorts desk
          </p>
          <h3 className="mt-1 font-display text-lg text-pine">Programme cohort</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            The national programme cycle everyone on the same School of
            Disciples track belongs to — across all parishes. Create and link
            batches under Manage, browse the roster on Desk, and schedule
            cohort-wide classes.
          </p>
        </article>
        <article className="bg-white/60 px-4 py-4 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Students desk · Refine list
          </p>
          <h3 className="mt-1 font-display text-lg text-pine">
            Saturday cohort filter
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Filters by{" "}
            <span className="font-medium text-ink/80">
              which Saturday of the month
            </span>{" "}
            a student attends class — not the programme intake year. One
            programme cohort holds all four Saturday slots.
          </p>
          <Link
            href="/admin/students"
            className="mt-3 inline-block text-xs font-medium text-pine underline decoration-pine/25"
          >
            Open Students desk →
          </Link>
        </article>
      </div>

      <ol className="divide-y divide-stone">
        {[
          {
            title: "Year → cohort → batch",
            body: "On Manage, link batches from Parishes to a programme cohort so new enrolments inherit the right programme year and Saturday pool.",
          },
          {
            title: "Desk roster",
            body: "On Desk, pick a programme cohort to see every student on that intake — filter by Saturday slot or search by name. Open any row for the full student file.",
          },
          {
            title: "Classes & gallery",
            body: "Schedule cohort-wide sessions from Classes (audience: Cohort). The student gallery can show classmates across parishes in the same programme year.",
          },
          {
            title: "Students filter ≠ programme cohort",
            body: "Parish and batch filters on Students narrow local placement. The Saturday filter is only the monthly class slot — use the Cohorts Desk roster to see everyone on a programme intake regardless of Saturday.",
          },
        ].map((section, index) => (
          <li
            key={section.title}
            className="grid gap-1.5 px-3 py-3.5 sm:grid-cols-[2rem_1fr] sm:gap-4 sm:px-5"
          >
            <p className="font-display text-lg tabular-nums text-celadon/80">
              {String(index + 1).padStart(2, "0")}
            </p>
            <div>
              <h3 className="text-sm font-medium text-ink">{section.title}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink/65">
                {section.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
