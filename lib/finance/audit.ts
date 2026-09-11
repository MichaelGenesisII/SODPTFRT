import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinanceAuditWrite = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/** Best-effort append-only audit. Never throws into the caller path. */
export async function writeFinanceAudit(
  input: FinanceAuditWrite,
): Promise<void> {
  try {
    const service = createServiceSupabaseClient();
    const { error } = await service.from("finance_audit_events").insert({
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary ?? null,
      before_snapshot: input.before ?? null,
      after_snapshot: input.after ?? null,
    });
    if (error) {
      console.error("[finance/audit]", error.message);
    }
  } catch (error) {
    console.error("[finance/audit]", error);
  }
}
