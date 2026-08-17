"use server";

import { getSessionStudent } from "@/lib/student/auth";
import {
  signStudentCertificateUrl,
  type StudentCertificateMeta,
} from "@/lib/student/certificates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publicActionMessage } from "@/lib/safe-action-message";

export type OwnCertificateResult = {
  ok: boolean;
  message?: string;
  meta: StudentCertificateMeta;
  downloadUrl: string | null;
};

function emptyMeta(): StudentCertificateMeta {
  return {
    available: false,
    path: null,
    mime: null,
    originalName: null,
    uploadedAt: null,
  };
}

export async function getOwnCertificate(): Promise<OwnCertificateResult> {
  const profile = await getSessionStudent();
  if (!profile) {
    return {
      ok: false,
      message: "Sign in to view your certificate.",
      meta: emptyMeta(),
      downloadUrl: null,
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("student_profiles")
      .select(
        "certificate_path, certificate_mime, certificate_original_name, certificate_uploaded_at, is_active",
      )
      .eq("id", profile.id)
      .maybeSingle();

    if (error) {
      console.error("[student/certificate]", error);
      return {
        ok: false,
        message: publicActionMessage(
          error.message,
          "Could not load your certificate. Please try again.",
        ),
        meta: emptyMeta(),
        downloadUrl: null,
      };
    }

    const path = data?.certificate_path ?? null;
    const meta: StudentCertificateMeta = {
      available: Boolean(path),
      path,
      mime: data?.certificate_mime ?? null,
      originalName: data?.certificate_original_name ?? null,
      uploadedAt: data?.certificate_uploaded_at ?? null,
    };

    // Only active seats receive a download link.
    let downloadUrl: string | null = null;
    if (meta.path && data?.is_active !== false) {
      downloadUrl = await signStudentCertificateUrl(meta.path, 60 * 30);
    }

    return { ok: true, meta, downloadUrl };
  } catch (error) {
    console.error("[student/certificate]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not load your certificate. Please try again.",
      ),
      meta: emptyMeta(),
      downloadUrl: null,
    };
  }
}
