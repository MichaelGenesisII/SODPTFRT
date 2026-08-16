"use client";

import {
  FULL_EXAM_PACKS,
  TEMPLATE_PACKS,
  downloadTemplatePack,
  type TemplatePack,
} from "@/lib/exams/templates";

type Props = {
  onOpenUpload?: () => void;
};

function FormatBadge({ format }: { format: TemplatePack["format"] }) {
  const label =
    format === "xlsx"
      ? "XLSX"
      : format === "csv"
        ? "CSV"
        : format === "json"
          ? "JSON"
          : "TXT";
  return (
    <span className="border border-stone/80 bg-white/70 px-1.5 py-0.5 text-[0.58rem] font-medium uppercase tracking-[0.12em] text-ink/55">
      {label}
    </span>
  );
}

export function ExamSamples({ onOpenUpload }: Props) {
  const blanks = TEMPLATE_PACKS.filter((p) => p.kind === "blank");
  const samples = TEMPLATE_PACKS.filter((p) => p.kind === "sample");
  const fullExams = FULL_EXAM_PACKS;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="border border-stone bg-mist">
        <div className="border-b border-stone px-3 py-4 sm:px-5">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
            Offline authoring
          </p>
          <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
            Samples
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
            Download a ready-made test or a blank template, fill it offline,
            then bring it back on the{" "}
            {onOpenUpload ? (
              <button
                type="button"
                onClick={onOpenUpload}
                className="font-medium text-pine underline"
              >
                Upload
              </button>
            ) : (
              "Upload"
            )}{" "}
            tab. Files are never stored on the server.
          </p>
        </div>

        <ol className="grid gap-0 sm:grid-cols-3">
          {[
            {
              n: "01",
              title: "Download",
              body: "Grab a full test file, or a blank / pattern kit in XLSX, CSV, JSON, or text.",
            },
            {
              n: "02",
              title: "Populate",
              body: "Ready-made tests can stay as-is. Blank kits: one question per row or block.",
            },
            {
              n: "03",
              title: "Upload",
              body: "Switch to Upload, drop the file, and a draft opens in Compose.",
            },
          ].map((step) => (
            <li
              key={step.n}
              className="border-t border-stone px-3 py-4 sm:border-t-0 sm:border-l sm:border-stone sm:px-4 sm:first:border-l-0"
            >
              <p className="font-display text-lg tabular-nums text-celadon/80">
                {step.n}
              </p>
              <h3 className="mt-1 text-sm font-medium text-pine">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink/60">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        {onOpenUpload ? (
          <div className="border-t border-stone px-3 py-3 sm:px-5">
            <button
              type="button"
              onClick={onOpenUpload}
              className="bg-pine px-4 py-2.5 text-sm font-medium text-mist transition hover:bg-celadon"
            >
              Go to Upload →
            </button>
          </div>
        ) : null}
      </section>

      <section>
        <div className="mb-2">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
            Ready-made tests
          </p>
          <h3 className="font-display text-lg text-pine">Full exam files</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink/55">
            Complete papers with questions and answer keys. Download, then
            upload unchanged on Upload.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {fullExams.map((pack) => (
            <TemplateCard key={pack.id} pack={pack} emphasize />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
            Blank kits
          </p>
          <h3 className="font-display text-lg text-pine">Start empty</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {blanks.map((pack) => (
            <TemplateCard key={pack.id} pack={pack} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-ink/45">
            Pattern demos
          </p>
          <h3 className="font-display text-lg text-pine">Study the columns</h3>
          <p className="mt-1 text-sm text-ink/55">
            Five-question demos covering every type — useful while you draft
            your own bank.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {samples.map((pack) => (
            <TemplateCard key={pack.id} pack={pack} />
          ))}
        </div>
      </section>
    </div>
  );
}

function TemplateCard({
  pack,
  emphasize,
}: {
  pack: TemplatePack;
  emphasize?: boolean;
}) {
  const count = pack.rows?.length;
  return (
    <article
      className={`flex flex-col gap-3 px-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${
        emphasize
          ? "border border-pine/25 bg-white shadow-[0_10px_24px_-16px_rgba(20,53,44,0.35)]"
          : "border border-stone bg-white/60"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-medium text-pine">{pack.title}</h4>
          <FormatBadge format={pack.format} />
          {pack.kind === "exam" ? (
            <span className="text-[0.58rem] uppercase tracking-[0.12em] text-celadon">
              Full test{count ? ` · ${count}q` : ""}
            </span>
          ) : pack.kind === "sample" ? (
            <span className="text-[0.58rem] uppercase tracking-[0.12em] text-celadon">
              Demo
            </span>
          ) : (
            <span className="text-[0.58rem] uppercase tracking-[0.12em] text-ink/40">
              Blank
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink/50">{pack.tagline}</p>
        <p className="mt-1 text-sm leading-snug text-ink/65">{pack.useWhen}</p>
        <p className="mt-1 truncate font-mono text-[0.65rem] text-ink/35">
          {pack.filename}
        </p>
      </div>
      <button
        type="button"
        onClick={() => downloadTemplatePack(pack)}
        className={`shrink-0 px-3 py-2 text-sm font-medium transition ${
          emphasize
            ? "bg-pine text-mist hover:bg-celadon"
            : "border border-pine/30 text-pine hover:border-pine hover:bg-pine/5"
        }`}
      >
        Download
      </button>
    </article>
  );
}
