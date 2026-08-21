import { portalBaseUrl } from "@/lib/email/backend";
import { postEmailApi } from "@/lib/email/post-api";

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
  return postEmailApi("/api/email/class-invite", payload);
}

export function classPortalUrl() {
  return `${portalBaseUrl()}/student/classes`;
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
