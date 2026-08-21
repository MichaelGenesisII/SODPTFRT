"use client";

import { useRef, useState, useTransition } from "react";
import { uploadDeskAttachment } from "@/app/admin/desk-attachments/actions";
import { useToast } from "@/components/ui/toast";
import {
  DESK_ATTACHMENT_MAX_BYTES,
  formatAttachmentSize,
  type DeskAttachmentRecord,
} from "@/lib/desk-attachments";

type PendingAttachment = Pick<
  DeskAttachmentRecord,
  "id" | "original_name" | "byte_size" | "mime"
>;

type DeskAttachmentPickerProps = {
  value: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  disabled?: boolean;
};

export function DeskAttachmentPicker({
  value,
  onChange,
  disabled,
}: DeskAttachmentPickerProps) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;

    startTransition(async () => {
      for (const file of list) {
        if (file.size > DESK_ATTACHMENT_MAX_BYTES) {
          error(`${file.name} is too large (max 10 MB).`);
          continue;
        }
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadDeskAttachment(formData);
        if (result.ok && result.attachment) {
          onChange([
            ...value,
            {
              id: result.attachment.id,
              original_name: result.attachment.original_name,
              byte_size: result.attachment.byte_size,
              mime: result.attachment.mime,
            },
          ]);
          success(`${file.name} attached.`);
        } else {
          error(result.message);
        }
      }
    });
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (disabled || pending) return;
          uploadFiles(event.dataTransfer.files);
        }}
        className={`border border-dashed px-4 py-5 text-center transition-colors ${
          dragOver
            ? "border-pine bg-mist/60"
            : "border-stone bg-white/40 hover:border-pine/40"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <p className="text-sm text-ink/70">
          Drag PDF or images here, or{" "}
          <button
            type="button"
            disabled={disabled || pending}
            onClick={() => inputRef.current?.click()}
            className="font-medium text-pine underline-offset-2 hover:underline disabled:opacity-50"
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-ink/45">
          PDF, JPEG, PNG, WebP · 10 MB per file
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          disabled={disabled || pending}
          onChange={(event) => {
            if (event.target.files) uploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {value.length > 0 ? (
        <ul className="divide-y divide-stone border border-stone/80">
          {value.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-ink">{item.original_name}</span>
              <span className="shrink-0 text-xs text-ink/45">
                {formatAttachmentSize(item.byte_size)}
              </span>
              <button
                type="button"
                disabled={disabled || pending}
                onClick={() =>
                  onChange(value.filter((entry) => entry.id !== item.id))
                }
                className="shrink-0 text-xs text-red-900/70 hover:text-red-900 disabled:opacity-50"
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

export function attachmentIdsField(value: PendingAttachment[]): string {
  return JSON.stringify(value.map((item) => item.id));
}
