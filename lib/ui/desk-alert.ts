"use client";

import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

const base = {
  buttonsStyling: false,
  reverseButtons: true,
  focusConfirm: false,
  customClass: {
    popup: "desk-alert-popup",
    title: "desk-alert-title",
    htmlContainer: "desk-alert-body",
    actions: "desk-alert-actions",
    confirmButton: "desk-alert-confirm",
    cancelButton: "desk-alert-cancel",
    denyButton: "desk-alert-deny",
    icon: "desk-alert-icon",
  },
} as const;

/** Ask before a serious action. Returns true if the admin confirms. */
export async function deskConfirm(input: {
  title: string;
  text?: string;
  html?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  const result = await Swal.fire({
    ...base,
    icon: input.danger ? "warning" : "question",
    title: input.title,
    text: input.text,
    html: input.html,
    showCancelButton: true,
    confirmButtonText: input.confirmLabel ?? "Yes, continue",
    cancelButtonText: input.cancelLabel ?? "Cancel",
    customClass: {
      ...base.customClass,
      confirmButton: input.danger
        ? "desk-alert-confirm desk-alert-confirm-danger"
        : "desk-alert-confirm",
    },
  });
  return result.isConfirmed;
}

/** Clear success result — use after an action finishes. */
export async function deskSuccess(input: {
  title?: string;
  text: string;
}): Promise<void> {
  await Swal.fire({
    ...base,
    icon: "success",
    title: input.title ?? "Done",
    text: input.text,
    confirmButtonText: "OK",
    timer: 3200,
    timerProgressBar: true,
  });
}

/** Clear failure result — use when an action fails. */
export async function deskError(input: {
  title?: string;
  text: string;
}): Promise<void> {
  await Swal.fire({
    ...base,
    icon: "error",
    title: input.title ?? "Something went wrong",
    text: input.text,
    confirmButtonText: "OK",
  });
}
