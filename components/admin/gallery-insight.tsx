import Link from "next/link";

export function GalleryInsight({ national }: { national: boolean }) {
  return (
    <div className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-3 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Portraits
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          Insight
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
          How graduation selfies reach the gallery, what each moderation action
          does, and where Records, Payments, and the student file fit in.
        </p>
      </div>

      <div className="grid gap-px border-b border-stone bg-stone sm:grid-cols-2">
        <article className="bg-mist/90 px-4 py-4 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-pine">
            This desk
          </p>
          <h3 className="mt-1 font-display text-lg text-pine">Moderation</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Review graduation selfies after students upload them. Flag hides a
            portrait from classmates while you investigate. Take down removes it
            from the gallery and lets the student upload again. Delete removes
            the file from storage.
          </p>
        </article>
        <article className="bg-white/60 px-4 py-4 sm:px-5">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Not here
          </p>
          <h3 className="mt-1 font-display text-lg text-pine">Upload &amp; fees</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Students upload from their Payments page after the graduation fee is
            paid. Fee proofs and overrides live on Payments and the student
            file — not on this desk.
          </p>
          <Link
            href="/admin/payments"
            className="mt-3 inline-block text-xs font-medium text-pine underline decoration-pine/25"
          >
            Open Payments desk →
          </Link>
        </article>
      </div>

      <ol className="divide-y divide-stone">
        {[
          {
            title: "Who appears here",
            body: national
              ? "Every enrolled student with a graduation selfie on file, across parishes. Filter by parish context on each thumbnail when reviewing."
              : "Students in your parish who have uploaded a graduation selfie.",
          },
          {
            title: "Graduation gate",
            body: "Normally a student must pay the graduation fee, meet attendance (75%+), and hold a 50%+ exam average before the student portal unlocks selfie upload. Records holds the scorecard; early portrait access can be granted there.",
          },
          {
            title: "Flag",
            body: "Hides the portrait from the student gallery immediately. The file stays on the server. Use while you check placement, fees, or image quality. Restore when ready.",
          },
          {
            title: "Take down",
            body: "Hides the portrait and tells the student they may upload a replacement. Always add a short reason — it can surface on their side.",
          },
          {
            title: "Delete",
            body: "Removes the image from storage and clears the upload. Use for policy violations or irreparable files. The student can upload again when eligible.",
          },
          {
            title: "Restore",
            body: "Returns a flagged or taken-down portrait to the visible gallery. Clears the moderation note on restore.",
          },
          {
            title: "Student file & scorecard",
            body: "Open the student file for application, placement, and account controls. Open the scorecard for attendance and exam averages that feed the graduation gate.",
          },
          {
            title: "Who sees what",
            body: national
              ? "National desks moderate every parish. Parish admins only see portraits for their parish."
              : "You only see portraits for students enrolled in your parish.",
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
