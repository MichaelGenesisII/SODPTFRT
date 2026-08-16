import { portalBaseUrl } from "@/lib/email/backend";

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

async function postEmailApi(
  path: string,
  payload: object,
): Promise<{ ok: boolean; message: string; subject?: string }> {
  const baseUrl = process.env.EMAIL_API_URL?.replace(/\/$/, "");
  const secret = process.env.EMAIL_API_SECRET;

  if (!baseUrl || !secret) {
    return { ok: false, message: "Email backend is not configured." };
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SOD-Email-Secret": secret,
      },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      subject?: string;
    } | null;

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        message: data?.message || `Email service returned ${response.status}.`,
      };
    }
    return {
      ok: true,
      message: data.message || "Email sent.",
      subject: data.subject,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not reach email service.",
    };
  }
}

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
