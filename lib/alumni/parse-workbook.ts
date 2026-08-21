import * as XLSX from "xlsx";
import type {
  AlumniImportPreview,
  AlumniImportSkipReason,
  ParsedAlumniRow,
} from "@/lib/alumni/types";

function normHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function parseMoney(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function parsePercent(value: unknown): number | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (/^(x|abs|na|-)$/i.test(raw)) return null;
  const n = Number(raw.replace(/%/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

function parsePresent(value: unknown): boolean {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "y" || raw === "yes" || raw === "1" || raw === "x" || raw === "✓";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapHeaders(sheet: XLSX.WorkSheet): Map<string, string> {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  const headerRow = rows[0] ?? [];
  const map = new Map<string, string>();
  for (let i = 0; i < headerRow.length; i += 1) {
    const label = normHeader(headerRow[i]);
    if (label) map.set(label, String(i));
  }
  return map;
}

function headerKey(
  headers: Map<string, string>,
  ...aliases: string[]
): string | null {
  for (const alias of aliases) {
    const hit = headers.get(normHeader(alias));
    if (hit != null) return hit;
  }
  for (const [key, idx] of headers) {
    for (const alias of aliases) {
      if (key.includes(normHeader(alias))) return idx;
    }
  }
  return null;
}

function rowObject(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  headers: Map<string, string>,
): Record<string, unknown> {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  const line = rows[rowIndex] ?? [];
  const out: Record<string, unknown> = {};
  for (const [label, idx] of headers) {
    out[label] = line[Number(idx)] ?? "";
  }
  return out;
}

function skip(
  sheet: string,
  rowNumber: number,
  reason: AlumniImportSkipReason,
  detail: string,
) {
  return { sheet, rowNumber, reason, detail };
}

export function parseAlumniWorkbook(buffer: ArrayBuffer): AlumniImportPreview {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const rows: ParsedAlumniRow[] = [];
  const skipped: AlumniImportPreview["skipped"] = [];
  const seenEmails = new Set<string>();
  const sheetCounts = new Map<string, { valid: number; skipped: number }>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const headers = mapHeaders(sheet);
    const emailIdx = headerKey(headers, "email", "e-mail", "email address");
    const firstIdx = headerKey(
      headers,
      "first name",
      "firstname",
      "given name",
      "forename",
    );
    const lastIdx = headerKey(
      headers,
      "surname",
      "last name",
      "family name",
    );
    const legacyIdx = headerKey(
      headers,
      "app com no",
      "app com no26",
      "application no",
      "app com",
    );
    const parishIdx = headerKey(headers, "parish", "church parish");
    const mobileIdx = headerKey(headers, "mobile", "mobile number", "phone");
    const manualsIdx = headerKey(headers, "manuals", "manuals sent");
    const tuitionIdx = headerKey(
      headers,
      "tuition paid",
      "tuition",
      "amount paid",
      "paid tuition",
      "payment",
    );
    const gradIdx = headerKey(headers, "graduation paid", "graduation", "grad fee");

    const examCols: { label: string; idx: string }[] = [];
    const sessionCols: { label: string; idx: string }[] = [];
    for (const [label, idx] of headers) {
      if (/^exam\s*(y\s*)?\d+/i.test(label) || /^exam\s*\d+/i.test(label)) {
        examCols.push({ label, idx });
      } else if (/session/i.test(label) || /^\d{1,2}[/-]\d{1,2}/.test(label)) {
        sessionCols.push({ label, idx });
      }
    }

    const dataRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    });

    let valid = 0;
    let skipCount = 0;

    for (let i = 1; i < dataRows.length; i += 1) {
      const rowNumber = i + 1;
      const obj = rowObject(sheet, i, headers);

      const email = emailIdx
        ? String((dataRows[i] as unknown[])?.[Number(emailIdx)] ?? "")
            .trim()
            .toLowerCase()
        : cell(obj, "email");
      const firstName = firstIdx
        ? String((dataRows[i] as unknown[])?.[Number(firstIdx)] ?? "").trim()
        : cell(obj, "first name", "firstname");
      const lastName = lastIdx
        ? String((dataRows[i] as unknown[])?.[Number(lastIdx)] ?? "").trim()
        : cell(obj, "surname", "last name");

      if (!email && !firstName && !lastName) continue;

      if (!email || !isValidEmail(email)) {
        skipped.push(
          skip(sheetName, rowNumber, "invalid_email", email || "Missing email"),
        );
        skipCount += 1;
        continue;
      }
      if (!firstName || !lastName) {
        skipped.push(
          skip(sheetName, rowNumber, "missing_name", email),
        );
        skipCount += 1;
        continue;
      }
      if (seenEmails.has(email)) {
        skipped.push(
          skip(sheetName, rowNumber, "duplicate_email", email),
        );
        skipCount += 1;
        continue;
      }
      seenEmails.add(email);

      const tuitionPaidGbp = tuitionIdx
        ? parseMoney((dataRows[i] as unknown[])?.[Number(tuitionIdx)])
        : 0;
      const graduationPaidGbp = gradIdx
        ? parseMoney((dataRows[i] as unknown[])?.[Number(gradIdx)])
        : 0;

      const manualsRaw = manualsIdx
        ? String((dataRows[i] as unknown[])?.[Number(manualsIdx)] ?? "")
        : cell(obj, "manuals");
      const manualsSent = /sent|yes|y|all/i.test(manualsRaw);

      const exams = examCols.map(({ label, idx }) => ({
        label,
        percent: parsePercent((dataRows[i] as unknown[])?.[Number(idx)]),
      }));

      const sessions = sessionCols.map(({ label, idx }) => ({
        label,
        date: null,
        present: parsePresent((dataRows[i] as unknown[])?.[Number(idx)]),
      }));

      rows.push({
        sheet: sheetName,
        rowNumber,
        email,
        firstName,
        lastName,
        middleName: null,
        legacyAppComNo: legacyIdx
          ? String((dataRows[i] as unknown[])?.[Number(legacyIdx)] ?? "").trim() ||
            null
          : null,
        parishName: parishIdx
          ? String((dataRows[i] as unknown[])?.[Number(parishIdx)] ?? "").trim() ||
            null
          : null,
        mobile: mobileIdx
          ? String((dataRows[i] as unknown[])?.[Number(mobileIdx)] ?? "").trim() ||
            null
          : null,
        tuitionPaidGbp,
        graduationPaidGbp,
        manualsSent,
        sessions,
        exams,
      });
      valid += 1;
    }

    sheetCounts.set(sheetName, { valid, skipped: skipCount });
  }

  return {
    rows,
    skipped,
    sheetCounts: [...sheetCounts.entries()].map(([sheet, counts]) => ({
      sheet,
      ...counts,
    })),
  };
}

export type { ParsedAlumniRow };
