"use client";

import { useState, useTransition } from "react";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";

type SignOutConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  signOut: () => Promise<void> | void;
  /** e.g. "the admin desk", "the student portal" */
  portalLabel: string;
};

export function SignOutConfirmModal({
  open,
  onClose,
  signOut,
  portalLabel,
}: SignOutConfirmModalProps) {
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);

  return (
    <DeskConfirmModal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      onConfirm={() => {
        setBusyLabel("Signing out…");
        startTransition(async () => {
          try {
            await signOut();
          } finally {
            setBusyLabel(null);
          }
        });
      }}
      eyebrow="Session"
      title="Sign out?"
      body={`You will need to sign in again to return to ${portalLabel}.`}
      confirmLabel="Sign out"
      destructive
      busy={busy}
      busyLabel={busyLabel ?? "Signing out…"}
    />
  );
}
