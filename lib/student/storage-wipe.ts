import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { STUDENT_CERTIFICATES_BUCKET } from "@/lib/student/certificates";
import { STUDENT_PHOTOS_BUCKET } from "@/lib/student/photos";

const PAYMENT_PROOFS_BUCKET = "payment-proofs";

async function removePrefix(
  bucket: string,
  prefix: string,
): Promise<void> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service.storage.from(bucket).list(prefix, {
    limit: 100,
  });
  if (error) {
    console.error(`[storage-wipe] list ${bucket}/${prefix}`, error);
    return;
  }
  const paths = (data ?? [])
    .map((row) => `${prefix}/${row.name}`)
    .filter((p) => !p.endsWith("/"));
  if (paths.length === 0) return;
  const { error: removeError } = await service.storage.from(bucket).remove(paths);
  if (removeError) {
    console.error(`[storage-wipe] remove ${bucket}`, removeError);
  }
}

/** Remove a student's private files via Storage API (SQL deletes are blocked). */
export async function removeStudentStorageFolder(userId: string): Promise<void> {
  if (!userId) return;
  await Promise.all([
    removePrefix(PAYMENT_PROOFS_BUCKET, userId),
    removePrefix(STUDENT_PHOTOS_BUCKET, userId),
    removePrefix(STUDENT_CERTIFICATES_BUCKET, userId),
  ]);
}
