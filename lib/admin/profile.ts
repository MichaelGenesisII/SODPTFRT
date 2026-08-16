export type AdminRole = "master" | "admin";

export type AdminProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  /** null = national desk; set = parish-scoped admin */
  parish_id: string | null;
};

export function isNationalAdmin(profile: AdminProfile): boolean {
  return profile.role === "master" || !profile.parish_id;
}

export function isParishAdmin(profile: AdminProfile): boolean {
  return profile.role !== "master" && Boolean(profile.parish_id);
}

/** Human label for the signed-in desk (welcome modal, emails, Access). */
export function adminDeskScopeLabel(
  profile: Pick<AdminProfile, "role" | "parish_id">,
  parishName?: string | null,
): string {
  // Master and national desks share the same public language — National Admin.
  if (profile.role === "master" || !profile.parish_id) {
    return "National desk — all UK parishes";
  }
  return parishName?.trim()
    ? `Parish desk — ${parishName.trim()}`
    : "Parish desk";
}
