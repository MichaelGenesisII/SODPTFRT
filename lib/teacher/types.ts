export type TeacherProfile = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  avatar_path?: string | null;
  /** Signed URL for UI — set in layout, not stored in DB. */
  avatarUrl?: string | null;
};

export type TeachingDeliveryStatus =
  | "scheduled"
  | "delivered"
  | "covered"
  | "cancelled"
  | "no_show";

export const TEACHING_DELIVERY_STATUSES: TeachingDeliveryStatus[] = [
  "scheduled",
  "delivered",
  "covered",
  "cancelled",
  "no_show",
];

export function isTeachingDeliveryStatus(
  value: string,
): value is TeachingDeliveryStatus {
  return (TEACHING_DELIVERY_STATUSES as string[]).includes(value);
}

export const TEACHING_DELIVERY_STATUS_META: Record<
  TeachingDeliveryStatus,
  { label: string; hint: string }
> = {
  scheduled: { label: "Scheduled", hint: "Assigned — not yet confirmed" },
  delivered: { label: "Delivered", hint: "Confirmed taught" },
  covered: { label: "Covered", hint: "Delivered by a substitute" },
  cancelled: { label: "Cancelled", hint: "Class did not run" },
  no_show: { label: "No show", hint: "Teacher did not teach" },
};

export type ClassTeachingDelivery = {
  id: string;
  class_id: string;
  teacher_id: string;
  status: TeachingDeliveryStatus;
  confirmed_at: string | null;
  confirmed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function teacherDisplayName(
  profile: Pick<TeacherProfile, "full_name" | "email">,
): string {
  const name = profile.full_name?.trim();
  if (name) return name;
  return profile.email.split("@")[0] || "Teacher";
}

/** Payable statuses for Finance Phase 2 — kept here for shared rules. */
export function isPayableDeliveryStatus(
  status: TeachingDeliveryStatus,
): boolean {
  return status === "delivered" || status === "covered";
}
