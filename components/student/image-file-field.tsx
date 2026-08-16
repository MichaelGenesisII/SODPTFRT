"use client";

import { useId, useState, type ChangeEvent } from "react";

type ImageFileFieldProps = {
  name: string;
  accept?: string;
  required?: boolean;
  hint?: string;
  chooseLabel?: string;
  onFileChange?: (file: File | null) => void;
};

export function ImageFileField({
  name,
  accept = "image/jpeg,image/png,image/webp",
  required = false,
  hint = "JPG, PNG, or WEBP",
  chooseLabel = "Choose image",
  onFileChange,
}: ImageFileFieldProps) {
  const inputId = useId();
  const [fileName, setFileName] = useState<string | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFileName(file?.name ?? null);
    onFileChange?.(file);
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-4 py-6 text-center transition-colors ${
          fileName
            ? "border-pine/40 bg-pine/5"
            : "border-pine/30 bg-white/70 hover:border-pine hover:bg-pine/[0.04]"
        }`}
      >
        <span
          className="flex size-12 items-center justify-center border border-pine/25 bg-mist text-pine"
          aria-hidden
        >
          <ImagePickIcon className="h-6 w-6" />
        </span>
        <span className="space-y-1">
          <span className="block text-sm font-semibold text-pine">
            {fileName ? "Change image" : chooseLabel}
          </span>
          <span className="block text-xs text-ink/55">{hint}</span>
        </span>
        {fileName ? (
          <span className="max-w-full truncate rounded-none border border-pine/20 bg-mist px-2.5 py-1 text-xs font-medium text-pine">
            {fileName}
          </span>
        ) : (
          <span className="border border-pine/30 bg-pine px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-mist">
            Browse files
          </span>
        )}
        <input
          id={inputId}
          type="file"
          name={name}
          accept={accept}
          required={required}
          className="sr-only"
          onChange={handleChange}
        />
      </label>
    </div>
  );
}

function ImagePickIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5h16v11H4v-11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m4 15.5 4.2-3.5 3.1 2.5 3.4-4 5.3 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="10.5" r="1.25" fill="currentColor" />
    </svg>
  );
}
