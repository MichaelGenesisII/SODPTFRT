"use server";

import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { isNationalAdmin, requireSessionAdmin } from "@/lib/admin/auth";
import { slugifyParishName } from "@/lib/parishes";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type ParishSyncResult = {
  ok: boolean;
  message: string;
  inserted?: number;
  updated?: number;
  skipped?: number;
};

type ParishRow = { name: string; region: string | null };

function parseParishWorkbook(buffer: ArrayBuffer): ParishRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet =
    workbook.Sheets["RCCG_UK_Church_List"] ||
    workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  const out: ParishRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i] ?? [];
    const name = String(line[1] ?? "").trim();
    const region = String(line[2] ?? "").trim() || null;
    if (!name || name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, region });
  }
  return out;
}

async function upsertParishRows(
  rows: ParishRow[],
): Promise<ParishSyncResult> {
  const service = createServiceSupabaseClient();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const slugBase = slugifyParishName(row.name) || "parish";
    const { data: existing } = await service
      .from("parishes")
      .select("id, name, region, slug")
      .ilike("name", row.name)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await service
        .from("parishes")
        .update({
          region: row.region,
          is_active: true,
        })
        .eq("id", existing.id);
      if (error) {
        console.error("[parish sync] update", error);
        skipped += 1;
      } else {
        updated += 1;
      }
      continue;
    }

    let slug = slugBase;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidate = attempt === 0 ? slug : `${slugBase}-${attempt + 1}`;
      const { error } = await service.from("parishes").insert({
        name: row.name,
        slug: candidate,
        region: row.region,
        is_active: true,
      });
      if (!error) {
        inserted += 1;
        break;
      }
      if (!/duplicate|unique/i.test(error.message)) {
        console.error("[parish sync] insert", error);
        skipped += 1;
        break;
      }
      if (attempt === 5) skipped += 1;
    }
  }

  revalidatePath("/admin/parishes");
  revalidatePath("/enrol");

  return {
    ok: true,
    message: `Parishes synced: ${inserted} new, ${updated} updated${
      skipped ? `, ${skipped} skipped` : ""
    }.`,
    inserted,
    updated,
    skipped,
  };
}

/** Sync from uploaded Excel (national desk). */
export async function syncParishesFromUpload(
  formData: FormData,
): Promise<ParishSyncResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) {
      return { ok: false, message: "National desk only." };
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Choose a Parish Excel file." };
    }
    const buffer = await file.arrayBuffer();
    const rows = parseParishWorkbook(buffer);
    if (!rows.length) {
      return { ok: false, message: "No parish rows found in that file." };
    }
    return upsertParishRows(rows);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Unauthorized." };
    }
    console.error("[parish sync upload]", error);
    return { ok: false, message: publicActionMessage(error) };
  }
}

/** Sync from bundled public/Parish.xlsx when present on the server. */
export async function syncParishesFromBundledFile(): Promise<ParishSyncResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) {
      return { ok: false, message: "National desk only." };
    }
    const filePath = path.join(process.cwd(), "public", "Parish.xlsx");
    const u8 = await fs.readFile(filePath);
    const buffer = u8.buffer.slice(
      u8.byteOffset,
      u8.byteOffset + u8.byteLength,
    ) as ArrayBuffer;
    const rows = parseParishWorkbook(buffer);
    if (!rows.length) {
      return { ok: false, message: "Bundled Parish.xlsx had no usable rows." };
    }
    return upsertParishRows(rows);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Unauthorized." };
    }
    console.error("[parish sync bundled]", error);
    return {
      ok: false,
      message:
        "Could not read Parish.xlsx from the server. Upload the file instead.",
    };
  }
}
