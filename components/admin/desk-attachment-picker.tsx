"use client";

import { useRef, useState, useTransition } from "react";
import {
  deleteDeskAttachment,
  uploadDeskAttachment,
} from "@/app/admin/desk-attachments/actions";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  formatAttachmentSize,
  validateDeskAttachmentFile,
  type DeskAttachmentRecord,
  type NoticeAttachmentAccess,
} from "@/lib/desk-attachments";

export type PendingAttachment = Pick<
  DeskAttachmentRecord,
  "id" | "original_name" | "byte_size" | "mime"
> & {
  access?: NoticeAttachmentAccess;
};

type DeskAttachmentPickerProps = {
  value: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  disabled?: boolean;
  /** When true, admin picks view / download / both per file (notices). */
  enableAccessMode?: boolean;
  /** Cap uploads (e.g. campaigns match the email backend limit of 5). */
  maxFiles?: number;
};

const ACCESS_OPTIONS: {
  id: NoticeAttachmentAccess;
  label: string;
  hint: string;
}[] = [
  { id: "view", label: "View", hint: "Open in browser" },
  { id: "download", label: "Download", hint: "Save to device" },
  { id: "both", label: "Both", hint: "View and download" },
];

export function DeskAttachmentPicker({
  value,
  onChange,
  disabled,
  enableAccessMode = false,
  maxFiles,
}: DeskAttachmentPickerProps) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = pending || Boolean(busyLabel);
  const atCap = maxFiles != null && value.length >= maxFiles;

  function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;

    setBusyLabel("Uploading file…");
    startTransition(async () => {
      try {
        let next = value;
        for (const file of list) {
          if (maxFiles != null && next.length >= maxFiles) {
            error(`You can attach at most ${maxFiles} files.`);
            break;
          }

          const invalid = validateDeskAttachmentFile(file);
          if (invalid) {
            error(`${file.name}: ${invalid}`);
            continue;
          }

          const formData = new FormData();
          formData.set("file", file);
          const result = await uploadDeskAttachment(formData);
          if (result.ok && result.attachment) {
            next = [
              ...next,
              {
                id: result.attachment.id,
                original_name: result.attachment.original_name,
                byte_size: result.attachment.byte_size,
                mime: result.attachment.mime,
                access: enableAccessMode ? "both" : undefined,
              },
            ];
            onChange(next);
            success(`${file.name} attached.`);
          } else {
            error(result.message);
          }
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function removeItem(id: string) {
    const previous = value;
    onChange(previous.filter((entry) => entry.id !== id));
    setBusyLabel("Removing file…");
    startTransition(async () => {
      try {
        const result = await deleteDeskAttachment(id);
        if (!result.ok) {
          onChange(previous);
          error(result.message);
          return;
        }
        success("Attachment removed.");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function setAccess(id: string, access: NoticeAttachmentAccess) {
    onChange(
      value.map((entry) => (entry.id === id ? { ...entry, access } : entry)),
    );
  }

  return (
    <div className="relative space-y-2" aria-busy={busy}>
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (disabled || busy || atCap) return;
          uploadFiles(event.dataTransfer.files);
        }}
        className={`border border-dashed px-4 py-5 text-center transition-colors ${
          dragOver
            ? "border-pine bg-mist/60"
            : "border-stone bg-white/40 hover:border-pine/40"
        } ${disabled || atCap ? "opacity-50" : ""}`}
      >
        <p className="text-sm text-ink/70">
          Drag PDF or images here, or{" "}
          <button
            type="button"
            disabled={disabled || busy || atCap}
            onClick={() => inputRef.current?.click()}
            className="font-medium text-pine underline-offset-2 hover:underline disabled:opacity-50"
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-ink/45">
          PDF, JPEG, PNG, WebP · 10 MB per file
          {maxFiles != null ? ` · up to ${maxFiles} files` : ""}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple={maxFiles == null || maxFiles > 1}
          className="sr-only"
          disabled={disabled || busy || atCap}
          onChange={(event) => {
            if (event.target.files) uploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {value.length > 0 ? (
        <ul className="divide-y divide-stone border border-stone/80">
          {value.map((item) => (
            <li key={item.id} className="space-y-2 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-ink">
                  {item.original_name}
                </span>
                <span className="shrink-0 text-xs text-ink/45">
                  {formatAttachmentSize(item.byte_size)}
                </span>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 text-xs text-red-900/70 hover:text-red-900 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
              {enableAccessMode ? (
                <fieldset
                  disabled={disabled || busy}
                  className="flex flex-wrap gap-1.5"
                >
                  <legend className="sr-only">
                    How readers can use {item.original_name}
                  </legend>
                  {ACCESS_OPTIONS.map((option) => {
                    const selected = (item.access ?? "both") === option.id;
                    return (
                      <label
                        key={option.id}
                        title={option.hint}
                        className={`cursor-pointer border px-2.5 py-1 text-[0.7rem] font-medium transition-colors ${
                          selected
                            ? "border-pine bg-pine text-mist"
                            : "border-stone bg-white/60 text-ink/70 hover:border-pine/40"
                        } ${disabled || busy ? "opacity-50" : ""}`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={`access-${item.id}`}
                          value={option.id}
                          checked={selected}
                          onChange={() => setAccess(item.id, option.id)}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Campaigns — id list only. */
export function attachmentIdsField(value: PendingAttachment[]): string {
  return JSON.stringify(value.map((item) => item.id));
}

/** Notices — ids + access mode. */
export function attachmentLinksField(value: PendingAttachment[]): string {
  return JSON.stringify(
    value.map((item) => ({
      id: item.id,
      access: item.access ?? "both",
    })),
  );
}
