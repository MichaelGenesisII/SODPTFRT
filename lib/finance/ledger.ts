import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { monthPeriodKey } from "@/lib/finance/types";
import type { FinanceAttachmentRecord } from "@/lib/finance/attachments";

export type FinanceLedgerDirection = "in" | "out";
export type FinanceLedgerStatus = "recorded" | "reversed";
export type FinanceLedgerSource = "manual" | "portal_payout" | "import";

export type FinanceCategory = {
  id: string;
  name: string;
  sort_order: number;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceLedgerEntry = {
  id: string;
  direction: FinanceLedgerDirection;
  category_id: string;
  category_name: string | null;
  payee: string;
  amount_gbp: number;
  currency: string;
  incurred_on: string;
  settled_at: string | null;
  reason: string | null;
  status: FinanceLedgerStatus;
  source: FinanceLedgerSource;
  created_by: string | null;
  period_key: string;
  reverses_entry_id: string | null;
  created_at: string;
  attachment_count: number;
  has_proof: boolean;
};

export type FinanceLedgerListResult = {
  entries: FinanceLedgerEntry[];
  totalOutGbp: number;
  totalInGbp: number;
  withoutProofCount: number;
};

const CATEGORY_SELECT =
  "id, name, sort_order, retired_at, created_at, updated_at";

export function periodKeyFromIncurredOn(incurredOn: string): string {
  const day = incurredOn.slice(0, 10);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return monthPeriodKey(year, month);
}

export async function listFinanceCategories(options?: {
  includeRetired?: boolean;
}): Promise<FinanceCategory[]> {
  const service = createServiceSupabaseClient();
  let query = service
    .from("finance_categories")
    .select(CATEGORY_SELECT)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options?.includeRetired) {
    query = query.is("retired_at", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[finance/categories/list]", error.message);
    throw new Error("Categories could not be loaded.");
  }
  return (data ?? []) as FinanceCategory[];
}

export async function listLedgerEntries(options?: {
  limit?: number;
}): Promise<FinanceLedgerListResult> {
  const service = createServiceSupabaseClient();
  const limit = options?.limit ?? 200;

  const { data, error } = await service
    .from("finance_ledger_entries")
    .select(
      `
      id,
      direction,
      category_id,
      payee,
      amount_gbp,
      currency,
      incurred_on,
      settled_at,
      reason,
      status,
      source,
      created_by,
      period_key,
      reverses_entry_id,
      created_at,
      finance_categories ( name ),
      finance_attachments ( id )
    `,
    )
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[finance/ledger/list]", error.message);
    throw new Error("The ledger could not be loaded.");
  }

  const entries: FinanceLedgerEntry[] = (data ?? []).map((row) => {
    const categoryJoin = row.finance_categories as
      | { name: string }
      | { name: string }[]
      | null;
    const categoryName = Array.isArray(categoryJoin)
      ? categoryJoin[0]?.name ?? null
      : categoryJoin?.name ?? null;
    const attachments = (row.finance_attachments ?? []) as { id: string }[];
    const attachmentCount = attachments.length;
    return {
      id: row.id as string,
      direction: row.direction as FinanceLedgerDirection,
      category_id: row.category_id as string,
      category_name: categoryName,
      payee: row.payee as string,
      amount_gbp: Number(row.amount_gbp),
      currency: row.currency as string,
      incurred_on: row.incurred_on as string,
      settled_at: (row.settled_at as string | null) ?? null,
      reason: (row.reason as string | null) ?? null,
      status: row.status as FinanceLedgerStatus,
      source: row.source as FinanceLedgerSource,
      created_by: (row.created_by as string | null) ?? null,
      period_key: row.period_key as string,
      reverses_entry_id: (row.reverses_entry_id as string | null) ?? null,
      created_at: row.created_at as string,
      attachment_count: attachmentCount,
      has_proof: attachmentCount > 0,
    };
  });

  let totalOutGbp = 0;
  let totalInGbp = 0;
  let withoutProofCount = 0;

  for (const entry of entries) {
    if (entry.status === "reversed") continue;
    if (entry.direction === "out") totalOutGbp += entry.amount_gbp;
    else totalInGbp += entry.amount_gbp;
    if (!entry.has_proof && !entry.reverses_entry_id) {
      withoutProofCount += 1;
    }
  }

  return { entries, totalOutGbp, totalInGbp, withoutProofCount };
}

export async function listAttachmentsForEntry(
  entryId: string,
): Promise<FinanceAttachmentRecord[]> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_attachments")
    .select(
      "id, ledger_entry_id, storage_path, mime, original_name, byte_size, sort_order, created_at",
    )
    .eq("ledger_entry_id", entryId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[finance/attachments/list]", error.message);
    throw new Error("Attachments could not be loaded.");
  }
  return (data ?? []) as FinanceAttachmentRecord[];
}
