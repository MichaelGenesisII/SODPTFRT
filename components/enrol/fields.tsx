"use client";

import type { HTMLAttributes, ReactNode } from "react";

export function FieldLabel({
  htmlFor,
  children,
  required,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-2.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium tracking-wide text-ink"
      >
        {children}
        {required ? (
          <span className="ml-1 text-red-700" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p className="mt-1 text-sm leading-relaxed text-ink/55">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-sm text-red-800" role="alert">
      {message}
    </p>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        className={`w-full border bg-mist/60 px-4 py-3 text-[0.95rem] text-ink outline-none transition-[border-color,background-color] duration-300 placeholder:text-ink/35 focus:bg-mist ${
          error
            ? "border-red-700/50 focus:border-red-700"
            : "border-stone focus:border-pine"
        }`}
      />
      <FieldError message={error} />
    </div>
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  error?: string;
}) {
  return (
    <div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={Boolean(error)}
        className={`w-full resize-y border bg-mist/60 px-4 py-3 text-[0.95rem] text-ink outline-none transition-[border-color,background-color] duration-300 placeholder:text-ink/35 focus:bg-mist ${
          error
            ? "border-red-700/50 focus:border-red-700"
            : "border-stone focus:border-pine"
        }`}
      />
      <FieldError message={error} />
    </div>
  );
}

export function SelectInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[] | readonly { value: string; label: string }[];
  placeholder: string;
  error?: string;
}) {
  const normalized = options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : option,
  );

  return (
    <div>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className={`w-full appearance-none border bg-mist/60 px-4 py-3 text-[0.95rem] text-ink outline-none transition-[border-color,background-color] duration-300 focus:bg-mist ${
          error
            ? "border-red-700/50 focus:border-red-700"
            : "border-stone focus:border-pine"
        } ${value ? "" : "text-ink/35"}`}
      >
        <option value="">{placeholder}</option>
        {normalized.map((option) => (
          <option key={option.value} value={option.value} className="text-ink">
            {option.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

export function ChoiceCards({
  name,
  value,
  onChange,
  options,
  error,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string; hint?: string }[];
  error?: string;
}) {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`group relative cursor-pointer border px-5 py-4 transition-[border-color,background-color,transform] duration-300 ${
                selected
                  ? "border-pine bg-pine text-mist"
                  : "border-stone bg-mist/50 text-ink hover:border-pine/40 hover:bg-mist"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="block font-medium tracking-wide">
                {option.label}
              </span>
              {option.hint ? (
                <span
                  className={`mt-1 block text-sm ${
                    selected ? "text-mist/75" : "text-ink/55"
                  }`}
                >
                  {option.hint}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export function ChipGroup({
  options,
  value,
  onChange,
  multiple = false,
  error,
}: {
  options: readonly string[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  error?: string;
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  function toggle(option: string) {
    if (multiple) {
      const next = selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option];
      onChange(next);
      return;
    }
    onChange(option);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isOn = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={isOn}
              className={`border px-4 py-2 text-sm font-medium tracking-wide transition-[border-color,background-color,color] duration-300 ${
                isOn
                  ? "border-pine bg-pine text-mist"
                  : "border-stone bg-mist/50 text-ink hover:border-pine/40"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export function Reveal({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  if (!show) return null;
  return (
    <div className="animate-fade-rise space-y-5 border-l-2 border-celadon/50 pl-4 sm:pl-5">
      {children}
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" strokeLinecap="round" />
      <path d="M8 14h2.5M13.5 14H16M8 17.5h2.5M13.5 17.5H16" strokeLinecap="round" />
    </svg>
  );
}

function formatDisplayDate(iso: string) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function DateField({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <div
        className={`relative overflow-hidden border bg-mist/60 transition-[border-color,background-color,box-shadow] duration-300 focus-within:bg-mist focus-within:shadow-[inset_3px_0_0_0_var(--pine)] ${
          error
            ? "border-red-700/50 focus-within:border-red-700"
            : "border-stone focus-within:border-pine"
        }`}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-celadon">
          <CalendarIcon className="size-5" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-12 flex items-center">
          <span
            className={`text-[0.95rem] ${
              value ? "text-ink" : "text-ink/35"
            }`}
          >
            {value ? formatDisplayDate(value) : "Select a date"}
          </span>
        </div>
        <input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          className="date-field-input relative z-10 w-full cursor-pointer bg-transparent px-4 py-3 pl-12 text-[0.95rem] text-transparent outline-none"
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}
