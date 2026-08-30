import Link from "next/link";

export function PaymentsInsight({ national }: { national: boolean }) {
  return (
    <div className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-3 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Fee desk
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          Insight
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
          How bank proofs, card payments, and student placement fit together —
          and what this desk does not handle.
        </p>
      </div>

      <div className="grid gap-px border-b border-stone bg-stone sm:grid-cols-2">
        <article className="bg-mist/90 px-4 py-4 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-pine">
            This desk
          </p>
          <h3 className="mt-1 font-display text-lg text-pine">Bank proofs</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Students upload a screenshot after a bank transfer. You preview the
            proof, approve it, or return it so they can upload again. Approval
            marks the fee paid and emails the student.
          </p>
        </article>
        <article className="bg-white/60 px-4 py-4 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Not here
          </p>
          <h3 className="mt-1 font-display text-lg text-pine">Card &amp; status</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Stripe card payments settle automatically — they do not appear in
            this queue. Enrolment status, fee overrides, and placement changes
            live on the student file under Students.
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
            title: "Two fees per student",
            body: "Tuition (application) and graduation are separate rows. Filter the queue by fee type when you only want one lane.",
          },
          {
            title: "Reference on the proof",
            body: "Each student has an application reference and a compact bank lookup code. Match these on the transfer screenshot before approving.",
          },
          {
            title: "Approve vs return",
            body: "Approve when the amount and reference look correct — the fee moves to paid and the student is notified. Return when the image is unclear or wrong; they can re-upload from their Payments page.",
          },
          {
            title: "Placement context",
            body: national
              ? "The queue shows parish, batch, and programme cohort when enrolment is linked. Open the student file for full placement or to fix an unlisted parish."
              : "You only see proofs for students in your parish. Open the student file for the full dossier.",
          },
          {
            title: "Students desk link",
            body: "Students surfaces a banner when proofs are waiting here. This desk is the only place to review uploads — do not change payment flags manually on the student file unless you are correcting an edge case.",
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
