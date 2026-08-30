"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
} from "@/lib/admin/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import {
  isStudentCertificateMime,
  MAX_STUDENT_CERTIFICATE_BYTES,
  signStudentCertificateUrl,
  STUDENT_CERTIFICATES_BUCKET,
  studentCertificateObjectPath,
  type StudentCertificateMeta,
} from "@/lib/student/certificates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type CertificateActionResult = {
  ok: boolean;
  message: string;
  meta?: StudentCertificateMeta;
  downloadUrl?: string | null;
};

function unauthorized(): CertificateActionResult {
  return { ok: false, message: "Unauthorized." };
}

/** Prefer browser MIME; fall back to filename (some browsers send empty type for PDF). */
function resolveCertificateMime(file: File): string | null {
  const typed = (file.type || "").toLowerCase();
  if (isStudentCertificateMime(typed)) return typed;
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

function revalidateCertificatePaths() {
  revalidatePath("/admin/students");
  revalidatePath("/admin/records");
}

/**
 * Cookie/RLS gate — parish admins only manage certificates for their parish.
 */
async function requireAccessibleCertificateStudent(studentId: string) {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("student_profiles")
    .select(
      "id, email, first_name, last_name, is_active, certificate_path, certificate_mime, certificate_original_name, certificate_uploaded_at",
    )
    .eq("id", studentId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, message: publicActionMessage(error.message) };
  }
  if (!data) {
    return {
      ok: false as const,
      message: "Student not found or outside your parish scope.",
    };
  }

  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return {
        ok: false as const,
        message: "Parish desk is not assigned to a parish.",
      };
    }
    const { data: enrolment } = await supabase
      .from("enrolments")
      .select("id, parish_id")
      .eq("user_id", studentId)
      .eq("parish_id", actor.parish_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!enrolment) {
      return {
        ok: false as const,
        message: "Student not found or outside your parish scope.",
      };
    }
  }

  return { ok: true as const, profile: data, supabase, actor };
}

function metaFromProfile(profile: {
  certificate_path?: string | null;
  certificate_mime?: string | null;
  certificate_original_name?: string | null;
  certificate_uploaded_at?: string | null;
}): StudentCertificateMeta {
  const path = profile.certificate_path ?? null;
  return {
    available: Boolean(path),
    path,
    mime: profile.certificate_mime ?? null,
    originalName: profile.certificate_original_name ?? null,
    uploadedAt: profile.certificate_uploaded_at ?? null,
  };
}

export async function getAdminStudentCertificate(
  studentId: string,
): Promise<CertificateActionResult> {
  try {
    if (!studentId) {
      return { ok: false, message: "Student id is required." };
    }
    const access = await requireAccessibleCertificateStudent(studentId);
    if (!access.ok) return { ok: false, message: access.message };

    const meta = metaFromProfile(access.profile);
    let downloadUrl: string | null = null;
    if (meta.path) {
      downloadUrl = await signStudentCertificateUrl(meta.path, 60 * 30);
    }
    return {
      ok: true,
      message: meta.available ? "Certificate on file." : "No certificate yet.",
      meta,
      downloadUrl,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    console.error("[admin/certificate/get]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not load certificate."),
    };
  }
}

export async function uploadStudentCertificate(
  studentId: string,
  formData: FormData,
): Promise<CertificateActionResult> {
  try {
    if (!studentId) {
      return { ok: false, message: "Student id is required." };
    }
    const access = await requireAccessibleCertificateStudent(studentId);
    if (!access.ok) return { ok: false, message: access.message };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Choose a certificate file to upload." };
    }
    if (file.size > MAX_STUDENT_CERTIFICATE_BYTES) {
      return {
        ok: false,
        message: "Certificate must be 10 MB or smaller.",
      };
    }
    const mime = resolveCertificateMime(file);
    if (!mime) {
      return {
        ok: false,
        message: "Use a PDF, JPEG, or PNG certificate file.",
      };
    }

    const objectPath = studentCertificateObjectPath(studentId, mime);
    const service = createServiceSupabaseClient();
    const bytes = Buffer.from(await file.arrayBuffer());

    // Remove previous object if extension changed (pdf ↔ image).
    const previousPath = access.profile.certificate_path;
    if (previousPath && previousPath !== objectPath) {
      await service.storage
        .from(STUDENT_CERTIFICATES_BUCKET)
        .remove([previousPath]);
    }

    const { error: uploadError } = await service.storage
      .from(STUDENT_CERTIFICATES_BUCKET)
      .upload(objectPath, bytes, {
        contentType: mime,
        upsert: true,
      });
    if (uploadError) {
      console.error("[admin/certificate/upload]", uploadError);
      return {
        ok: false,
        message: publicActionMessage(
          uploadError.message,
          "Could not store the certificate. Please try again.",
        ),
      };
    }

    const originalName = (file.name || "certificate").slice(0, 180);
    const uploadedAt = new Date().toISOString();
    const { error: updateError } = await service
      .from("student_profiles")
      .update({
        certificate_path: objectPath,
        certificate_mime: mime,
        certificate_original_name: originalName,
        certificate_uploaded_at: uploadedAt,
        certificate_uploaded_by: access.actor.id,
      })
      .eq("id", studentId);

    if (updateError) {
      console.error("[admin/certificate/profile]", updateError);
      return {
        ok: false,
        message: publicActionMessage(
          updateError.message,
          "Certificate uploaded but the student file could not be updated.",
        ),
      };
    }

    const meta: StudentCertificateMeta = {
      available: true,
      path: objectPath,
      mime,
      originalName,
      uploadedAt,
    };
    const downloadUrl = await signStudentCertificateUrl(objectPath, 60 * 30);

    revalidateCertificatePaths();
    return {
      ok: true,
      message: previousPath
        ? "Certificate replaced."
        : "Certificate uploaded.",
      meta,
      downloadUrl,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    console.error("[admin/certificate/upload]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not upload the certificate. Please try again.",
      ),
    };
  }
}

export async function deleteStudentCertificate(
  studentId: string,
): Promise<CertificateActionResult> {
  try {
    if (!studentId) {
      return { ok: false, message: "Student id is required." };
    }
    const access = await requireAccessibleCertificateStudent(studentId);
    if (!access.ok) return { ok: false, message: access.message };

    const previousPath = access.profile.certificate_path;
    if (!previousPath) {
      return {
        ok: true,
        message: "No certificate on file.",
        meta: metaFromProfile(access.profile),
        downloadUrl: null,
      };
    }

    const service = createServiceSupabaseClient();
    const { error: removeError } = await service.storage
      .from(STUDENT_CERTIFICATES_BUCKET)
      .remove([previousPath]);
    if (removeError) {
      console.error("[admin/certificate/remove]", removeError);
      // Continue clearing profile so the desk is not stuck on a ghost file.
    }

    const { error: updateError } = await service
      .from("student_profiles")
      .update({
        certificate_path: null,
        certificate_mime: null,
        certificate_original_name: null,
        certificate_uploaded_at: null,
        certificate_uploaded_by: null,
      })
      .eq("id", studentId);

    if (updateError) {
      console.error("[admin/certificate/clear]", updateError);
      return {
        ok: false,
        message: publicActionMessage(
          updateError.message,
          "Could not remove the certificate. Please try again.",
        ),
      };
    }

    revalidateCertificatePaths();
    return {
      ok: true,
      message: "Certificate removed.",
      meta: {
        available: false,
        path: null,
        mime: null,
        originalName: null,
        uploadedAt: null,
      },
      downloadUrl: null,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    console.error("[admin/certificate/delete]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not remove the certificate. Please try again.",
      ),
    };
  }
}
