"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { FieldError, FieldLabel } from "@/components/enrol/fields";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { enrolFieldDomId } from "@/lib/enrol/schema";
import {
  resolveAddressPlace,
  searchAddressSuggestions,
  type AddressSuggestion,
  type AddressSuggestionPreview,
} from "@/lib/address/lookup";

type AddressFields = {
  line1: string;
  line2: string;
  townCity: string;
  county: string;
  postcode: string;
  country: string;
};

type Props = {
  placeId: string;
  formatted: AddressFields;
  houseNumber: string;
  onHouseNumberChange: (value: string) => void;
  onConfirm: (address: AddressSuggestion) => void;
  onClear: () => void;
  error?: string;
};

/** Loose UK postcode shape — enough to reveal house number early. */
function looksLikeUkPostcode(value: string): boolean {
  const compact = value.trim().replace(/\s+/g, " ").toUpperCase();
  if (compact.length < 5) return false;
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d?[A-Z]{0,2}$/.test(compact);
}

function formatConfirmedAddress(fields: AddressFields): string[] {
  const lines: string[] = [];
  if (fields.line1.trim()) lines.push(fields.line1.trim());
  const locality = [fields.townCity, fields.county].filter(Boolean).join(", ");
  if (locality) lines.push(locality);
  if (fields.postcode.trim()) lines.push(fields.postcode.trim());
  if (fields.country.trim()) lines.push(fields.country.trim());
  return lines;
}

function HouseNumberField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = enrolFieldDomId("houseNumber");
  return (
    <div className="mt-4">
      <FieldLabel
        htmlFor={id}
        hint="Optional — flat, unit, or house number if it is not already in the address."
      >
        House / flat number
      </FieldLabel>
      <input
        id={id}
        type="text"
        value={value}
        autoComplete="address-line1"
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. 12, Flat 3, or Unit B"
        className="w-full border border-stone bg-mist/60 px-4 py-3 text-[0.95rem] text-ink outline-none transition-[border-color,background-color] duration-300 placeholder:text-ink/35 focus:border-pine focus:bg-mist"
      />
    </div>
  );
}

export function AddressSearchField({
  placeId,
  formatted,
  houseNumber,
  onHouseNumberChange,
  onConfirm,
  onClear,
  error,
}: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestionPreview[]>(
    [],
  );
  const [searchPending, startSearch] = useTransition();
  const [resolvePending, startResolve] = useTransition();

  const confirmed = Boolean(placeId);
  const showHouseNumber = confirmed || looksLikeUkPostcode(query);

  useEffect(() => {
    if (confirmed) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setMessage(trimmed.length > 0 ? "Keep typing to search." : "");
      setOpen(false);
      return;
    }

    const timer = window.setTimeout(() => {
      startSearch(async () => {
        const result = await searchAddressSuggestions(trimmed);
        setSuggestions(result.suggestions);
        setMessage(result.message);
        setOpen(result.suggestions.length > 0);
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query, confirmed]);

  function pick(item: AddressSuggestionPreview) {
    startResolve(async () => {
      const result = await resolveAddressPlace(item.placeId);
      if (!result.ok || !result.address) {
        setMessage(result.message);
        setOpen(false);
        return;
      }
      setQuery("");
      setSuggestions([]);
      setMessage("");
      setOpen(false);
      onConfirm(result.address);
    });
  }

  function startOver() {
    onClear();
    setQuery("");
    setSuggestions([]);
    setMessage("");
    setOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (confirmed) {
    const lines = formatConfirmedAddress(formatted);
    return (
      <div>
        <FieldLabel htmlFor={enrolFieldDomId("addressPlaceId")} required>
          Your address
        </FieldLabel>
        <div className="border border-pine/25 bg-mist/50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5 text-sm leading-relaxed text-ink">
              {houseNumber.trim() ? (
                <p className="font-medium">{houseNumber.trim()}</p>
              ) : null}
              {lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <button
              type="button"
              onClick={startOver}
              className="shrink-0 text-sm font-medium text-pine underline decoration-pine/30 underline-offset-4"
            >
              Change
            </button>
          </div>
          <p className="mt-2 text-xs text-ink/50">
            Address confirmed. Use Change only if you picked the wrong one.
          </p>
        </div>
        <HouseNumberField value={houseNumber} onChange={onHouseNumberChange} />
        <FieldError message={error} />
      </div>
    );
  }

  return (
    <div className="relative" aria-busy={resolvePending}>
      <DeskLoaderOverlay
        active={resolvePending}
        label="Confirming address…"
      />
      <FieldLabel
        htmlFor={enrolFieldDomId("addressPlaceId")}
        required
        hint="Search postcode or street; after selecting, enter house number if needed."
      >
        Your address
      </FieldLabel>
      <input
        ref={inputRef}
        id={enrolFieldDomId("addressPlaceId")}
        type="search"
        value={query}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={Boolean(error)}
        autoComplete="off"
        disabled={resolvePending}
        placeholder="Search by postcode or street"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
        className={`w-full border bg-mist/60 px-4 py-3 text-[0.95rem] text-ink outline-none transition-[border-color,background-color] duration-300 placeholder:text-ink/35 focus:bg-mist disabled:opacity-60 ${
          error
            ? "border-red-700/50 focus:border-red-700"
            : "border-stone focus:border-pine"
        }`}
      />
      {searchPending ? (
        <p className="mt-2 text-sm text-ink/50">Searching…</p>
      ) : message ? (
        <p className="mt-2 text-sm text-ink/50">{message}</p>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto border border-stone bg-mist shadow-sm"
        >
          {suggestions.map((item) => (
            <li key={item.placeId} role="option">
              <button
                type="button"
                disabled={resolvePending}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(item)}
                className="w-full px-4 py-3 text-left text-sm leading-snug text-ink hover:bg-white/70 disabled:opacity-60"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showHouseNumber ? (
        <HouseNumberField value={houseNumber} onChange={onHouseNumberChange} />
      ) : null}
      <FieldError message={error} />
    </div>
  );
}
