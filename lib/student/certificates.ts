import { createServiceSupabaseClient } from "@/lib/supabase/service";

/** Admin-issued course certificates (PDF / image). */

export const STUDENT_CERTIFICATES_BUCKET = "student-certificates";

export const MAX_STUDENT_CERTIFICATE_BYTES = 10 * 1024 * 1024;

export const STUDENT_CERTIFICATE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type StudentCertificateMime =
  (typeof STUDENT_CERTIFICATE_MIME_TYPES)[number];

export function isStudentCertificateMime(
  mime: string,
): mime is StudentCertificateMime {
  return (STUDENT_CERTIFICATE_MIME_TYPES as readonly string[]).includes(mime);
}

export function studentCertificateExt(
  mime: string,
): "pdf" | "jpg" | "png" {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  return "pdf";
}

export function studentCertificateObjectPath(
  userId: string,
  mime: string,
): string {
  return `${userId}/certificate.${studentCertificateExt(mime)}`;
}

export async function signStudentCertificateUrl(
  path: string | null | undefined,
  expiresSec = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  try {
    const service = createServiceSupabaseClient();
    const { data, error } = await service.storage
      .from(STUDENT_CERTIFICATES_BUCKET)
      .createSignedUrl(path, expiresSec, { download: true });
    if (error || !data?.signedUrl) {
      console.error("[student/certificates/sign]", error);
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    console.error("[student/certificates/sign]", error);
    return null;
  }
}

export type StudentCertificateMeta = {
  available: boolean;
  path: string | null;
  mime: string | null;
  originalName: string | null;
  uploadedAt: string | null;
};
