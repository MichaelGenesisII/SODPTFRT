"use server";

import {
  linkFinanceAttachmentsToEntry,
  purgeUnlinkedFinanceAttachments,
  revalidateFinanceLedgerPaths,
  signedFinanceAttachmentUrl,
} from "@/app/finance/attachments/actions";
import { writeFinanceAudit } from "@/lib/finance/audit";
import { requireSessionFinance } from "@/lib/finance/auth";
import { ledgerEntriesCsv } from "@/lib/finance/ledger-csv";
import {
  listAttachmentsForEntry,
  listLedgerEntries,
  periodKeyFromIncurredOn,
  type FinanceLedgerListResult,
} from "@/lib/finance/ledger";
import { parseAttachmentIds } from "@/lib/desk-attachments";
import { FINANCE_ATTACHMENT_MAX_PER_ENTRY } from "@/lib/finance/attachments";
import { isPeriodLocked, periodLabelFromKey } from "@/lib/finance/periods-lock";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type FinanceLedgerActionResult = {
  ok: boolean;
  message: string;
  csv?: string;
  filename?: string;
};

export async function loadFinanceLedger(): Promise<FinanceLedgerListResult> {
  await requireSessionFinance();
  return listLedgerEntries();
}

export async function createManualLedgerEntry(
  formData: FormData,
): Promise<FinanceLedgerActionResult> {
  const attachmentIds = parseAttachmentIds(formData).slice(
    0,
    FINANCE_ATTACHMENT_MAX_PER_ENTRY,
  );

  try {
    const finance = await requireSessionFinance();
    const directionRaw = String(formData.get("direction") ?? "").trim();
    const categoryId = String(formData.get("categoryId") ?? "").trim();
    const payee = String(formData.get("payee") ?? "").trim();
    const amountRaw = String(formData.get("amountGbp") ?? "").trim();
    const incurredOn = String(formData.get("incurredOn") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim() || null;
    const amount = Number(amountRaw);

    if (directionRaw !== "in" && directionRaw !== "out") {
      return { ok: false, message: "Choose whether money came in or went out." };
    }
    if (!categoryId) {
      return { ok: false, message: "Choose a category." };
    }
    if (!payee) {
      return { ok: false, message: "Enter who was paid or who paid." };
    }
    if (payee.length > 200) {
      return { ok: false, message: "Payee must be 200 characters or fewer." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Enter an amount greater than zero." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incurredOn)) {
      return { ok: false, message: "Choose a valid date." };
    }
    if (reason && reason.length > 2000) {
      return { ok: false, message: "Comment must be 2000 characters or fewer." };
    }

    const service = createServiceSupabaseClient();
    const { data: category, error: categoryError } = await service
      .from("finance_categories")
      .select("id, retired_at")
      .eq("id", categoryId)
      .maybeSingle();

    if (categoryError || !category || category.retired_at) {
      return {
        ok: false,
        message: "Choose an active category.",
      };
    }

    const periodKey = periodKeyFromIncurredOn(incurredOn);
    if (await isPeriodLocked(periodKey)) {
      await purgeUnlinkedFinanceAttachments(attachmentIds);
      return {
        ok: false,
        message: `${periodLabelFromKey(periodKey)} is locked. New entries for that month are not allowed — record a reversing entry against an existing line if you need a correction.`,
      };
    }

    const { data: entry, error } = await service
      .from("finance_ledger_entries")
      .insert({
        direction: directionRaw,
        category_id: categoryId,
        payee,
        amount_gbp: amount,
        currency: "GBP",
        incurred_on: incurredOn,
        settled_at: null,
        reason,
        status: "recorded",
        source: "manual",
        created_by: finance.id,
        period_key: periodKey,
      })
      .select("id")
      .single();

    if (error || !entry) {
      console.error("[finance/ledger/create]", error?.message);
      await purgeUnlinkedFinanceAttachments(attachmentIds);
      return {
        ok: false,
        message: "Could not save this entry. Please try again.",
      };
    }

    try {
      await linkFinanceAttachmentsToEntry(entry.id as string, attachmentIds);
    } catch (linkError) {
      console.error("[finance/ledger/create link]", linkError);
      await writeFinanceAudit({
        actorId: finance.id,
        action: "ledger_create",
        entityType: "ledger_entry",
        entityId: entry.id as string,
        summary: `Recorded ${directionRaw} ${amount.toFixed(2)} for ${payee} (proof link failed)`,
        after: {
          direction: directionRaw,
          amount_gbp: amount,
          payee,
          incurred_on: incurredOn,
          period_key: periodKey,
        },
      });
      await revalidateFinanceLedgerPaths();
      return {
        ok: true,
        message:
          "Entry saved, but proof could not be linked. Re-attach from a new reversing entry if needed.",
      };
    }

    await writeFinanceAudit({
      actorId: finance.id,
      action: "ledger_create",
      entityType: "ledger_entry",
      entityId: entry.id as string,
      summary: `Recorded ${directionRaw} ${amount.toFixed(2)} for ${payee}`,
      after: {
        direction: directionRaw,
        amount_gbp: amount,
        payee,
        incurred_on: incurredOn,
        period_key: periodKey,
        attachment_count: attachmentIds.length,
      },
    });

    await revalidateFinanceLedgerPaths();
    return { ok: true, message: "Entry recorded." };
  } catch (error) {
    console.error("[finance/ledger/create]", error);
    await purgeUnlinkedFinanceAttachments(attachmentIds).catch(() => undefined);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not save this entry."),
    };
  }
}

export async function reverseLedgerEntry(
  formData: FormData,
): Promise<FinanceLedgerActionResult> {
  try {
    const finance = await requireSessionFinance();
    const entryId = String(formData.get("id") ?? "").trim();
    const note = String(formData.get("reason") ?? "").trim() || null;
    if (!entryId) return { ok: false, message: "Entry not found." };

    const service = createServiceSupabaseClient();
    const { data: original, error: loadError } = await service
      .from("finance_ledger_entries")
      .select(
        "id, direction, category_id, payee, amount_gbp, currency, incurred_on, status, reverses_entry_id",
      )
      .eq("id", entryId)
      .maybeSingle();

    if (loadError || !original) {
      console.error("[finance/ledger/reverse load]", loadError?.message);
      return { ok: false, message: "Entry not found." };
    }
    if (original.status === "reversed") {
      return { ok: false, message: "This entry is already reversed." };
    }
    if (original.reverses_entry_id) {
      return {
        ok: false,
        message: "Reversing entries cannot themselves be reversed.",
      };
    }

    const reverseDirection =
      original.direction === "out" ? "in" : "out";
    const incurredOn = original.incurred_on as string;
    const periodKey = periodKeyFromIncurredOn(incurredOn);
    const reason =
      note ||
      `Reversal of ${original.payee} ${Number(original.amount_gbp).toFixed(2)}`;

    const { data: reversal, error: insertError } = await service
      .from("finance_ledger_entries")
      .insert({
        direction: reverseDirection,
        category_id: original.category_id,
        payee: original.payee,
        amount_gbp: original.amount_gbp,
        currency: original.currency,
        incurred_on: incurredOn,
        settled_at: new Date().toISOString(),
        reason,
        status: "recorded",
        source: "manual",
        created_by: finance.id,
        period_key: periodKey,
        reverses_entry_id: original.id,
      })
      .select("id")
      .single();

    if (insertError || !reversal) {
      console.error("[finance/ledger/reverse insert]", insertError?.message);
      return {
        ok: false,
        message: "Could not reverse this entry. Please try again.",
      };
    }

    const { error: updateError } = await service
      .from("finance_ledger_entries")
      .update({ status: "reversed" })
      .eq("id", original.id)
      .eq("status", "recorded");

    if (updateError) {
      console.error("[finance/ledger/reverse status]", updateError.message);
      return {
        ok: false,
        message:
          "A reversing entry was created, but the original could not be marked. Please try again or contact support.",
      };
    }

    await writeFinanceAudit({
      actorId: finance.id,
      action: "ledger_reverse",
      entityType: "ledger_entry",
      entityId: original.id as string,
      summary: `Reversed ${original.payee} ${Number(original.amount_gbp).toFixed(2)}`,
      before: {
        status: "recorded",
        amount_gbp: Number(original.amount_gbp),
        payee: original.payee,
      },
      after: {
        status: "reversed",
        reversal_id: reversal.id,
        period_key: periodKey,
      },
    });

    await revalidateFinanceLedgerPaths();
    return { ok: true, message: "Reversing entry recorded." };
  } catch (error) {
    console.error("[finance/ledger/reverse]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not reverse this entry."),
    };
  }
}

export async function loadEntryAttachmentViews(entryId: string): Promise<
  {
    id: string;
    name: string;
    mime: string;
    byteSize: number;
    url: string | null;
  }[]
> {
  await requireSessionFinance();
  const rows = await listAttachmentsForEntry(entryId);
  const views = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.original_name,
      mime: row.mime,
      byteSize: row.byte_size,
      url: await signedFinanceAttachmentUrl(row.storage_path, 3600, {
        download: row.original_name,
      }),
    })),
  );
  return views;
}

/**
 * Enrich an existing entry with proof and/or a note.
 * Does not change amount, payee, direction, or category.
 */
export async function enrichLedgerEntry(
  formData: FormData,
): Promise<FinanceLedgerActionResult> {
  const attachmentIds = parseAttachmentIds(formData).slice(
    0,
    FINANCE_ATTACHMENT_MAX_PER_ENTRY,
  );
  const note = String(formData.get("note") ?? "").trim();

  try {
    const finance = await requireSessionFinance();
    const entryId = String(formData.get("entryId") ?? "").trim();
    if (!entryId) {
      await purgeUnlinkedFinanceAttachments(attachmentIds);
      return { ok: false, message: "Entry not found." };
    }
    if (!note && attachmentIds.length === 0) {
      return {
        ok: false,
        message: "Add a note or at least one proof file.",
      };
    }
    if (note.length > 1500) {
      return { ok: false, message: "Note must be 1500 characters or fewer." };
    }

    const service = createServiceSupabaseClient();
    const { data: entry, error: loadError } = await service
      .from("finance_ledger_entries")
      .select("id, reason, status, reverses_entry_id, period_key")
      .eq("id", entryId)
      .maybeSingle();

    if (loadError || !entry) {
      await purgeUnlinkedFinanceAttachments(attachmentIds);
      return { ok: false, message: "Entry not found." };
    }
    if (entry.status === "reversed") {
      await purgeUnlinkedFinanceAttachments(attachmentIds);
      return {
        ok: false,
        message: "Reversed entries cannot be updated. Use a new entry instead.",
      };
    }

    const existing = await listAttachmentsForEntry(entryId);
    const room = FINANCE_ATTACHMENT_MAX_PER_ENTRY - existing.length;
    if (attachmentIds.length > room) {
      await purgeUnlinkedFinanceAttachments(attachmentIds);
      return {
        ok: false,
        message:
          room <= 0
            ? "This entry already has the maximum number of proof files."
            : `You can add at most ${room} more proof file${room === 1 ? "" : "s"}.`,
      };
    }

    if (note) {
      const stamp = new Date().toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const addition = `Note (${stamp}): ${note}`;
      const prev = (entry.reason as string | null)?.trim() || "";
      const nextReason = prev ? `${prev}\n\n${addition}` : addition;
      if (nextReason.length > 2000) {
        await purgeUnlinkedFinanceAttachments(attachmentIds);
        return {
          ok: false,
          message:
            "This entry’s comment is full. Reverse and re-record if you need a longer note.",
        };
      }
      const { error: reasonError } = await service
        .from("finance_ledger_entries")
        .update({ reason: nextReason })
        .eq("id", entryId);
      if (reasonError) {
        console.error("[finance/ledger/enrich reason]", reasonError.message);
        await purgeUnlinkedFinanceAttachments(attachmentIds);
        return {
          ok: false,
          message: "Could not save the note. Please try again.",
        };
      }
    }

    if (attachmentIds.length) {
      try {
        await linkFinanceAttachmentsToEntry(entryId, attachmentIds);
      } catch (error) {
        console.error("[finance/ledger/enrich attach]", error);
        await purgeUnlinkedFinanceAttachments(attachmentIds).catch(
          () => undefined,
        );
        return {
          ok: false,
          message: note
            ? "Note saved, but proof could not be linked. Please try again."
            : "Could not attach proof. Please try again.",
        };
      }
    }

    await writeFinanceAudit({
      actorId: finance.id,
      action: "ledger_enrich",
      entityType: "finance_ledger_entry",
      entityId: entryId,
      summary: `Enriched entry · note=${Boolean(note)} · files=${attachmentIds.length}`,
      after: {
        note_added: Boolean(note),
        attachment_count: attachmentIds.length,
      },
    });

    await revalidateFinanceLedgerPaths();
    return {
      ok: true,
      message:
        note && attachmentIds.length
          ? "Note and proof added."
          : note
            ? "Note added."
            : "Proof added.",
    };
  } catch (error) {
    console.error("[finance/ledger/enrich]", error);
    await purgeUnlinkedFinanceAttachments(attachmentIds).catch(() => undefined);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not update this entry. Please try again.",
      ),
    };
  }
}

export async function exportLedgerCsv(
  entryIds?: string[],
): Promise<FinanceLedgerActionResult> {
  try {
    await requireSessionFinance();
    const { entries } = await listLedgerEntries({ limit: 2000 });
    const idSet =
      entryIds && entryIds.length
        ? new Set(entryIds.map((id) => id.trim()).filter(Boolean))
        : null;
    const selected = idSet
      ? entries.filter((entry) => idSet.has(entry.id))
      : entries;

    const stamp = new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      message: "Export ready.",
      csv: ledgerEntriesCsv(selected),
      filename: `finance-ledger-${stamp}.csv`,
    };
  } catch (error) {
    console.error("[finance/ledger/export]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not export the ledger. Please try again.",
      ),
    };
  }
}
