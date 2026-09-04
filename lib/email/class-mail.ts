import { portalBaseUrl } from "@/lib/email/config";
import { sendTemplatedEmail } from "@/lib/email/post-api";

export type ClassInviteEmailPayload = {
  to: string;
  firstName: string;
  classTitle: string;
  whenLabel: string;
  durationMinutes: number;
  audienceLabel: string;
  portalClassesUrl: string;
  joinUrl?: string;
  passcode?: string;
  attendanceCode?: string;
  notes?: string;
  portalSupportUrl: string;
  siteUrl: string;
};

export function sendClassInviteEmail(payload: ClassInviteEmailPayload) {
  return sendTemplatedEmail("/api/email/class-invite", payload);
}

export type ClassTeacherAssignmentEmailPayload = {
  to: string;
  firstName: string;
  classTitle: string;
  whenLabel: string;
  durationMinutes: number;
  audienceLabel: string;
  teacherPortalUrl: string;
  joinUrl?: string;
  passcode?: string;
  notes?: string;
  assignedByName?: string;
  portalSupportUrl: string;
  siteUrl: string;
};

export function sendClassTeacherAssignmentEmail(
  payload: ClassTeacherAssignmentEmailPayload,
) {
  return sendTemplatedEmail("/api/email/class-teacher-assignment", payload);
}

export function classPortalUrl() {
  return `${portalBaseUrl()}/student/classes`;
}

export function teacherClassPortalUrl() {
  return `${portalBaseUrl()}/teacher/classes`;
}

export function formatClassWhenLabel(isoStart: string): string {
  return new Date(isoStart).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}
