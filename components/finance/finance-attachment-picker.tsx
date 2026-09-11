"use client";

import { useRef, useState, useTransition } from "react";
import {
  deleteFinanceAttachment,
  uploadFinanceAttachment,
} from "@/app/finance/attachments/actions";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { deskError } from "@/lib/ui/desk-alert";
import {
  FINANCE_ATTACHMENT_MAX_PER_ENTRY,
  formatAttachmentSize,
  validateDeskAttachmentFile,
  type FinanceAttachmentRecord,
} from "@/lib/finance/attachments";

export type PendingFinanceAttachment = Pick<
  FinanceAttachmentRecord,
  "id" | "original_name" | "byte_size" | "mime"
>;

type FinanceAttachmentPickerProps = {
  value: PendingFinanceAttachment[];
  onChange: (next: PendingFinanceAttachment[]) => void;
  disabled?: boolean;
  maxFiles?: number;
};

export function FinanceAttachmentPicker({
  value,
  onChange,
  disabled,
  maxFiles = FINANCE_ATTACHMENT_MAX_PER_ENTRY,
}: FinanceAttachmentPickerProps) {
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = pending || Boolean(busyLabel);
  const atCap = value.length >= maxFiles;

  function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;

    setBusyLabel("Uploading file…");
    startTransition(async () => {
      try {
        let next = value;
        for (const file of list) {
          if (next.length >= maxFiles) {
            await deskError({
              text: `You can attach at most ${maxFiles} files.`,
            });
            break;
          }

          const invalid = validateDeskAttachmentFile(file);
          if (invalid) {
            await deskError({ text: `${file.name}: ${invalid}` });
            continue;
          }

          const formData = new FormData();
          formData.set("file", file);
          const result = await uploadFinanceAttachment(formData);
          if (result.ok && result.attachment) {
            next = [
              ...next,
              {
                id: result.attachment.id,
                original_name: result.attachment.original_name,
                byte_size: result.attachment.byte_size,
                mime: result.attachment.mime,
              },
            ];
            onChange(next);
          } else {
            await deskError({ text: result.message });
          }
        }
      } finally {
        setBusyLabel(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function removeItem(id: string) {
    const previous = value;
    onChange(previous.filter((item) => item.id !== id));
    setBusyLabel("Removing file…");
    startTransition(async () => {
      try {
        const result = await deleteFinanceAttachment(id);
        if (!result.ok) {
          onChange(previous);
          await deskError({ text: result.message });
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="relative space-y-3">
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />

      <div
        className={`border border-dashed px-4 py-5 transition-colors ${
          dragOver
            ? "border-pine bg-pine/5"
            : "border-stone bg-white/40"
        } ${atCap || disabled ? "opacity-60" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !atCap) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (disabled || atCap) return;
          uploadFiles(event.dataTransfer.files);
        }}
      >
        <p className="text-sm text-ink/70">
          Proof — PDF or image, up to 10 MB each. Optional, but entries without
          proof are flagged.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || atCap || busy}
            onClick={() => inputRef.current?.click()}
            className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
          >
            Choose files
          </button>
          <span className="text-xs text-ink/45">
            {value.length}/{maxFiles} attached
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          disabled={disabled || atCap || busy}
          onChange={(event) => {
            if (event.target.files) uploadFiles(event.target.files);
          }}
        />
      </div>

      {value.length ? (
        <ul className="divide-y divide-stone/70 border border-stone/80 bg-white/55">
          {value.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{item.original_name}</p>
                <p className="text-xs text-ink/45">
                  {formatAttachmentSize(item.byte_size)}
                </p>
              </div>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => removeItem(item.id)}
                className="shrink-0 text-sm font-medium text-red-800 hover:underline disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
