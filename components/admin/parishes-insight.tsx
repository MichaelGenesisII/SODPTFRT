import Link from "next/link";

export function ParishesInsight({ national }: { national: boolean }) {
  return (
    <div className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-3 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Local placement
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          Insight
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
          How parishes and batches fit under programme cohorts — and what each
          desk controls.
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
              hint: "Students · intakes",
              example: "Cohort 1 · November",
              tone: "pine",
            },
            {
              step: "2",
              title: "Parish batch",
              hint: "Parishes · this desk",
              example: "Year 1 · Dagenham",
              tone: "celadon",
            },
            {
              step: "3",
              title: "Student enrolment",
              hint: "Enrol form picks parish + Saturday",
              example: "Auto-linked batch",
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
      </div>

      <div className="grid gap-px border-b border-stone bg-stone sm:grid-cols-2">
        <article className="bg-mist/90 px-4 py-4 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-pine">
            Parishes desk
          </p>
          <h3 className="mt-1 font-display text-lg text-pine">Church &amp; batch</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            {national
              ? "Maintain the UK church directory and each parish’s year groups. Open or close enrolment from the Desk; create parishes and edit batches under Manage."
              : "Your parish’s course runs live here. Open or close enrolment on the Desk; add or retire batches under Manage."}
          </p>
        </article>
        <article className="bg-white/60 px-4 py-4 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Students
          </p>
          <h3 className="mt-1 font-display text-lg text-pine">Programme intakes</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            November, January, and February intakes are filtered on the Students
            desk. Parish batches here are local placement only.
          </p>
          <Link
            href="/admin/students"
            className="mt-3 inline-block text-xs font-medium text-pine underline decoration-pine/25"
          >
            Open Students →
          </Link>
        </article>
      </div>

      <ol className="divide-y divide-stone">
        {[
          {
            title: national ? "National directory" : "Your parish",
            body: national
              ? "Import or add churches so applicants can pick a parish on enrol. Retiring a parish hides it from the form — enrolled students keep access."
              : "Name and region are set nationally. You manage batches for your own church.",
          },
          {
            title: "Enrolment open vs listed",
            body: "Open/closed (lock on Desk) controls whether applicants can join a batch now. Listed/retired (Manage) controls whether the batch can appear on the form at all.",
          },
          {
            title: "Retire, then delete",
            body: "Retire finished course runs. Delete only empty batches or parishes with no enrolments, batches, or desk admins.",
          },
          {
            title: "Desk vs Manage",
            body: "Desk is for scanning parishes and flipping enrolment open. Manage holds parish settings, batch create/edit, and the UK master import.",
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
