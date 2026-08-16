export type EnrolmentStatus =
  | "submitted"
  | "under_review"
  | "accepted"
  | "payment_pending"
  | "paid"
  | "rejected";

export type PaymentStatus = "unpaid" | "pending_review" | "paid";

export type StudentProfile = {
  id: string;
  email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  is_active: boolean;
  created_at: string;
  zoom_email?: string | null;
  passport_path?: string | null;
  passport_uploaded_at?: string | null;
  graduation_selfie_path?: string | null;
  graduation_selfie_uploaded_at?: string | null;
  selfie_moderation_status?: "visible" | "flagged" | "taken_down" | null;
  selfie_moderation_note?: string | null;
  selfie_moderated_at?: string | null;
  /** Signed URL for UI avatar (short-lived). */
  passportUrl?: string | null;
};

/** Slim enrolment used across student surfaces. */
export type StudentEnrolment = {
  id: string;
  user_id: string;
  reference: string;
  reference_compact: string;
  status: EnrolmentStatus;
  payment_status: PaymentStatus;
  attendance_mode: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  mobile_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  town_city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  local_church: string | null;
  church_leader: string | null;
  parish_id: string | null;
  parish_name: string | null;
  batch_id: string | null;
  batch_label: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  created_at: string;
  updated_at: string;
};

export function studentDisplayName(profile: StudentProfile): string {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ");
}
