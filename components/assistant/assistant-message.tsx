import Link from "next/link";
import type { ReactNode } from "react";

const INLINE_TOKEN =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\/[a-z0-9][a-z0-9/-]*)/gi;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE_TOKEN);

  return parts.map((part, index) => {
    if (!part) return null;
    const key = `${keyPrefix}-${index}`;

    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return (
        <strong key={key} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return (
        <em key={key} className="italic text-ink/90">
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <span
          key={key}
          className="rounded-sm bg-stone/40 px-1 py-0.5 font-sans text-[0.8em] text-ink"
        >
          {part.slice(1, -1)}
        </span>
      );
    }

    if (/^\/[a-z0-9][a-z0-9/-]*$/i.test(part)) {
      return (
        <Link
          key={key}
          href={part}
          className="font-medium text-celadon underline decoration-celadon/40 underline-offset-2 hover:text-pine"
        >
          {part}
        </Link>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

/** Render assistant replies with light markdown + portal path links. */
export function AssistantMessageBody({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);

  return (
    <div className="space-y-2.5 text-[0.875rem] leading-relaxed text-ink">
      {paragraphs.map((paragraph, pIndex) => {
        const lines = paragraph.split("\n");
        return (
          <p key={pIndex} className="whitespace-pre-wrap">
            {lines.map((line, lineIndex) => (
              <span key={`${pIndex}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line, `${pIndex}-${lineIndex}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
