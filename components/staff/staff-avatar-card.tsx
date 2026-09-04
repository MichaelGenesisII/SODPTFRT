"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ImageFileField } from "@/components/student/image-file-field";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";

type StaffAvatarCardProps = {
  previewUrl?: string | null;
  hasAvatar: boolean;
  onUpload: (formData: FormData) => Promise<{ ok: boolean; message: string }>;
  onDelete: () => Promise<{ ok: boolean; message: string }>;
  toastTitle?: string;
};

export function StaffAvatarCard({
  previewUrl,
  hasAvatar,
  onUpload,
  onDelete,
  toastTitle = "Profile picture",
}: StaffAvatarCardProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [preview, setPreview] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  function onFileChange(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusyLabel(hasAvatar ? "Updating picture…" : "Uploading picture…");
    startTransition(async () => {
      try {
        const result = await onUpload(formData);
        if (!result.ok) {
          error(result.message, toastTitle);
          return;
        }
        success(result.message, toastTitle);
        form.reset();
        setPreview(null);
        setReplacing(false);
        setFileKey((k) => k + 1);
        router.refresh();
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function runDelete() {
    setBusyLabel("Removing picture…");
    startTransition(async () => {
      try {
        const result = await onDelete();
        if (!result.ok) {
          error(result.message, toastTitle);
          return;
        }
        success(result.message, toastTitle);
        setConfirmDeleteOpen(false);
        router.refresh();
      } finally {
        setBusyLabel(null);
      }
    });
  }

  if (hasAvatar && !replacing) {
    return (
      <div
        className="relative border border-pine/20 bg-pine/5 px-4 py-4"
        aria-busy={busy}
      >
        <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Profile picture
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          This image appears on your portal header. You can replace or remove it
          anytime.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="size-20 rounded-full object-cover ring-2 ring-pine/20"
            />
          ) : (
            <span className="flex size-20 items-center justify-center rounded-full bg-pine/10 text-xs text-pine">
              On file
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setReplacing(true)}
              className="border border-pine/30 px-3 py-2 text-sm font-medium text-pine hover:border-pine disabled:opacity-60"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDeleteOpen(true)}
              className="border border-stone px-3 py-2 text-sm font-medium text-ink/60 hover:border-red-800/40 hover:text-red-900 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>

        <DeskConfirmModal
          open={confirmDeleteOpen}
          onClose={() => !busy && setConfirmDeleteOpen(false)}
          onConfirm={runDelete}
          eyebrow="Profile picture"
          title="Remove profile picture?"
          body={
            <>
              Your picture will be removed from storage and the header will use
              the default image until you upload again.
            </>
          }
          confirmLabel="Remove picture"
          destructive
          busy={busy}
          busyLabel={busyLabel ?? "Removing picture…"}
        />
      </div>
    );
  }

  return (
    <div
      className="relative border border-stone bg-mist px-4 py-4"
      aria-busy={busy}
    >
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
        Profile picture
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        {hasAvatar
          ? "Choose a new head-and-shoulders photo. JPG, PNG, or WEBP · max 5MB."
          : "Add a clear head-and-shoulders photo. It will show on your portal header."}
      </p>
      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <ImageFileField
          key={fileKey}
          name="photo"
          required
          chooseLabel="Choose profile picture"
          hint="JPG, PNG, or WEBP · max 5MB"
          onFileChange={onFileChange}
        />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Preview"
            className="size-28 rounded-full border border-stone object-cover"
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
          >
            {hasAvatar ? "Save new picture" : "Upload picture"}
          </button>
          {hasAvatar && replacing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReplacing(false);
                setPreview(null);
                setFileKey((k) => k + 1);
              }}
              className="border border-stone px-4 py-2.5 text-sm text-ink/60 disabled:opacity-60"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
