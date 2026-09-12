export type AccountKind = "student" | "alumni";

export type ManualsStatus = "not_sent" | "sent";

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  student: "Active student",
  alumni: "Alumni",
};

export const MANUALS_STATUS_LABELS: Record<ManualsStatus, string> = {
  not_sent: "Not sent",
  sent: "Sent",
};

export function isAlumniAccount(kind: AccountKind | null | undefined): boolean {
  return kind === "alumni";
}

export function portalHomeForAccount(kind: AccountKind | null | undefined): string {
  return isAlumniAccount(kind) ? "/alumni" : "/student";
}

export function loginPathForAccount(kind: AccountKind | null | undefined): string {
  return isAlumniAccount(kind) ? "/login/alumni" : "/login/student";
}
