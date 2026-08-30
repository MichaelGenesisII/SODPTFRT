"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  deleteGraduationSelfie,
  uploadGraduationSelfie,
  uploadPassportPhoto,
} from "@/app/student/photos/actions";
import { ImageFileField } from "@/components/student/image-file-field";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";

type PhotoUploadCardProps = {
  kind: "passport" | "graduation_selfie";
  required: boolean;
  alreadyUploaded: boolean;
  previewUrl?: string | null;
  moderationNote?: string | null;
  takenDown?: boolean;
};

export function PhotoUploadCard({
  kind,
  required,
  alreadyUploaded,
  previewUrl,
  moderationNote,
  takenDown = false,
}: PhotoUploadCardProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [preview, setPreview] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmUploadOpen, setConfirmUploadOpen] = useState(false);
  const [pendingForm, setPendingForm] = useState<HTMLFormElement | null>(null);
  const [fileKey, setFileKey] = useState(0);

  const isPassport = kind === "passport";
  const title = isPassport ? "Passport photograph" : "Graduation selfie";
  const body = isPassport
    ? "A clear head-and-shoulders passport-style photo. This becomes your student account image and cannot be changed."
    : "A clear selfie from the chest or tummy upward. Used for the student gallery. You can replace or remove it anytime.";

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
    if (isPassport && !alreadyUploaded) {
      setPendingForm(event.currentTarget);
      setConfirmUploadOpen(true);
      return;
    }
    runUpload(event.currentTarget);
  }

  function runUpload(form: HTMLFormElement) {
    const formData = new FormData(form);
    setBusyLabel(
      isPassport ? "Uploading passport photo…" : "Uploading selfie…",
    );
    startTransition(async () => {
      try {
        const result = isPassport
          ? await uploadPassportPhoto(formData)
          : await uploadGraduationSelfie(formData);
        if (!result.ok) {
          error(result.message);
          return;
        }
        success(result.message);
        form.reset();
        setPreview(null);
        setReplacing(false);
        setConfirmUploadOpen(false);
        setPendingForm(null);
        setFileKey((k) => k + 1);
        router.refresh();
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function onDelete() {
    if (isPassport) return;
    setBusyLabel("Removing selfie…");
    startTransition(async () => {
      try {
        const result = await deleteGraduationSelfie();
        if (!result.ok) {
          error(result.message);
          return;
        }
        success(result.message);
        setConfirmDeleteOpen(false);
        router.refresh();
      } finally {
        setBusyLabel(null);
      }
    });
  }

  if (!required && !alreadyUploaded && !takenDown) return null;

  if (isPassport && alreadyUploaded) {
    return (
      <div className="border border-pine/20 bg-pine/5 px-4 py-4">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          {title}
        </p>
        <div className="mt-3 flex items-center gap-4">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="size-16 object-cover" />
          ) : (
            <span className="flex size-16 items-center justify-center bg-pine/10 text-xs text-pine">
              On file
            </span>
          )}
          <p className="text-sm text-ink/65">
            Uploaded and locked. Contact the Listening Desk only if there is a
            serious problem.
          </p>
        </div>
      </div>
    );
  }

  if (!isPassport && (alreadyUploaded || takenDown) && !replacing) {
    return (
      <div
        className="relative border border-pine/20 bg-pine/5 px-4 py-4"
        aria-busy={busy}
      >
        <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          {title}
        </p>
        {takenDown && moderationNote ? (
          <p className="mt-2 text-sm text-[#6b4f2a]">
            Taken down by the desk: {moderationNote}. Upload a replacement
            below.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {previewUrl && !takenDown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="size-16 object-cover" />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setReplacing(true)}
              className="border border-pine/30 px-3 py-2 text-sm font-medium text-pine hover:border-pine disabled:opacity-60"
            >
              {takenDown || !alreadyUploaded ? "Upload replacement" : "Replace"}
            </button>
            {alreadyUploaded && !takenDown ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDeleteOpen(true)}
                className="border border-stone px-3 py-2 text-sm font-medium text-ink/60 hover:border-red-800/40 hover:text-red-900 disabled:opacity-60"
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>

        <DeskConfirmModal
          open={confirmDeleteOpen}
          onClose={() => !busy && setConfirmDeleteOpen(false)}
          onConfirm={onDelete}
          eyebrow="Your portrait"
          title="Remove graduation selfie?"
          body={
            <>
              Your photo will disappear from the student gallery until you upload
              a new one. You can upload again anytime after graduation fees are
              settled.
            </>
          }
          confirmLabel="Remove selfie"
          destructive
          busy={busy}
          busyLabel={busyLabel ?? "Removing selfie…"}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative border px-4 py-4 ${
        required || takenDown
          ? "border-[#c4a574]/50 bg-[#efe8dc]/40"
          : "border-stone bg-mist"
      }`}
      aria-busy={busy}
    >
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      <p
        className={`text-[0.65rem] font-medium uppercase tracking-[0.14em] ${
          required || takenDown ? "text-[#6b4f2a]" : "text-celadon"
        }`}
      >
        {required || takenDown ? `Required · ${title}` : title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">{body}</p>
      {takenDown && moderationNote ? (
        <p className="mt-2 text-sm text-[#6b4f2a]">Desk note: {moderationNote}</p>
      ) : null}
      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <p className="text-sm font-medium text-ink">Select your photograph</p>
        <ImageFileField
          key={fileKey}
          name="photo"
          required
          chooseLabel={
            isPassport ? "Choose passport photo" : "Choose graduation selfie"
          }
          hint="JPG, PNG, or WEBP · max 5MB"
          onFileChange={onFileChange}
        />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Preview"
            className="max-h-44 w-auto border border-stone object-cover"
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
          >
            {busy && busyLabel?.startsWith("Uploading")
              ? "Uploading…"
              : `Upload ${isPassport ? "passport" : "selfie"}`}
          </button>
          {!isPassport && replacing ? (
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

      {isPassport && !alreadyUploaded ? (
        <DeskConfirmModal
          open={confirmUploadOpen}
          onClose={() => !busy && setConfirmUploadOpen(false)}
          onConfirm={() => pendingForm && runUpload(pendingForm)}
          eyebrow="Passport photograph"
          title="Upload this passport photo?"
          body={
            <>
              This becomes your student account image and cannot be changed
              later. Contact the Listening Desk only if there is a serious
              problem.
            </>
          }
          confirmLabel="Upload passport photo"
          busy={busy}
          busyLabel={busyLabel ?? "Uploading passport photo…"}
        />
      ) : null}
    </div>
  );
}
