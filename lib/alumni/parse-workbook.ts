import * as XLSX from "xlsx";
import type {
  AlumniExamEntry,
  AlumniImportPreview,
  AlumniImportSkipReason,
  AlumniSessionEntry,
  ParsedAlumniRow,
} from "@/lib/alumni/types";

function normHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[:*]+$/g, "")
    .replace(/\s+/g, " ");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseMoney(value: unknown): {
  amount: number;
  covered: boolean;
  note: string | null;
} {
  if (value == null || value === "") {
    return { amount: 0, covered: false, note: null };
  }
  const raw = String(value).trim();
  if (!raw) return { amount: 0, covered: false, note: null };
  if (/scholarship|covered|waived|free|full\s*bursary/i.test(raw)) {
    return { amount: 0, covered: true, note: raw };
  }
  const n = Number(raw.replace(/[£€$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) {
    return { amount: 0, covered: false, note: raw };
  }
  return { amount: Math.round(n * 100) / 100, covered: false, note: null };
}

function parsePercent(value: unknown): number | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw || /^(x|abs|na|n\/a|-|fail)$/i.test(raw)) return null;
  const match = raw.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

function parsePresent(value: unknown): boolean {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "y" || raw === "yes" || raw === "1" || raw === "x" || raw === "✓";
}

function cleanPart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Strip trailing centre notes like "(Beckton Centre)" from a name. */
function stripCentreFromName(name: string): {
  name: string;
  centre: string | null;
} {
  const match = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!match) return { name: cleanPart(name), centre: null };
  return { name: cleanPart(match[1]), centre: cleanPart(match[2]) };
}

export function splitPersonName(
  raw: string,
  surnameHint?: string | null,
): {
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
} {
  let working = cleanPart(raw);
  if (surnameHint && cleanPart(surnameHint)) {
    const last = cleanPart(surnameHint);
    const given = working
      .replace(new RegExp(`${last}$`, "i"), "")
      .replace(/,\s*$/, "")
      .trim();
    const parts = (given || working).split(/\s+/).filter(Boolean);
    const firstName = parts[0] || working || last;
    const middleName =
      parts.length > 1 ? parts.slice(1).join(" ") : null;
    return {
      firstName,
      middleName,
      lastName: last,
      displayName: cleanPart([firstName, middleName, last].filter(Boolean).join(" ")),
    };
  }

  if (working.includes(",")) {
    const [left, ...rest] = working.split(",");
    const last = cleanPart(left);
    const given = cleanPart(rest.join(","));
    const parts = given.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || last;
    const middleName =
      parts.length > 1 ? parts.slice(1).join(" ") : null;
    return {
      firstName,
      middleName,
      lastName: last,
      displayName: cleanPart([firstName, middleName, last].filter(Boolean).join(" ")),
    };
  }

  const parts = working.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      middleName: null,
      lastName: parts[0],
      displayName: parts[0],
    };
  }
  const lastName = parts[parts.length - 1];
  const firstName = parts[0];
  const middleName =
    parts.length > 2 ? parts.slice(1, -1).join(" ") : null;
  return {
    firstName,
    middleName,
    lastName,
    displayName: working,
  };
}

function fingerprint(parts: (string | number | null | undefined)[]): string {
  return parts
    .map((p) =>
      String(p ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " "),
    )
    .filter(Boolean)
    .join("|");
}

function parseDob(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 1000 && serial < 200000) {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  return raw;
}

function parseAppComRef(value: string): string | null {
  const raw = value.trim();
  if (!raw || !/app\s*com/i.test(raw)) return null;
  return raw;
}

function sessionDateFromLabel(label: string): string | null {
  const match = label.match(/^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
  return match ? match[1] : null;
}

function buildDisplayName(
  firstName: string,
  middleName: string | null,
  lastName: string,
): string {
  return cleanPart([firstName, middleName, lastName].filter(Boolean).join(" "));
}

function batchMetaFromFileName(fileName: string | null | undefined): {
  batchYear: number;
  batchLabel: string;
} {
  const raw = fileName ?? "";
  const low = raw.toLowerCase();

  const sessionShort = low.match(/(\d{2})[/_-](\d{2})\s*session/);
  if (sessionShort) {
    const y1 = 2000 + Number(sessionShort[1]);
    const y2 = 2000 + Number(sessionShort[2]);
    return {
      batchYear: y1,
      batchLabel: `${y1}/${String(y2).slice(-2)} session`,
    };
  }

  const fullRange = raw.match(/\b(20\d{2})[/_-](\d{2,4})\b/);
  if (fullRange) {
    const start = Number(fullRange[1]);
    const endPart = fullRange[2];
    const end =
      endPart.length === 4
        ? Number(endPart)
        : start >= 2000
          ? Math.floor(start / 100) * 100 + Number(endPart)
          : Number(endPart);
    return {
      batchYear: start,
      batchLabel: `${start}/${String(end).slice(-2)}`,
    };
  }

  const yearMatch = raw.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
  return {
    batchYear: year,
    batchLabel: yearMatch ? `Batch ${year}` : "Legacy alumni",
  };
}

function skip(
  sheet: string,
  rowNumber: number,
  reason: AlumniImportSkipReason,
  detail: string,
) {
  return { sheet, rowNumber, reason, detail };
}

type ColMap = {
  email: number | null;
  first: number | null;
  middle: number | null;
  last: number | null;
  fullName: number | null;
  phone: number | null;
  address: number | null;
  payments: number | null;
  graduation: number | null;
  studentId: number | null;
  centre: number | null;
  region: number | null;
  parish: number | null;
  dob: number | null;
  screenshot: number | null;
  bankStatement: number | null;
  certificate: number | null;
  comments: number | null;
  manuals: number | null;
  legacyRef: number | null;
  exams: { label: string; idx: number }[];
  sessions: { label: string; idx: number }[];
};

function findHeaderRow(rows: unknown[][]): number {
  const scored: { index: number; score: number }[] = [];
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const labels = (rows[i] ?? []).map(normHeader);
    let score = 0;
    for (const label of labels) {
      if (!label) continue;
      if (
        /^(name|names|surname|first name|second name|last name|email|email address|centre|center|parish|region|s\/n|s\/no|phone|student id|payments?|dob)$/.test(
          label,
        ) ||
        label.includes("email") ||
        label.includes("surname") ||
        label.includes("phone") ||
        label.includes("parish") ||
        label.includes("region")
      ) {
        score += 1;
      }
    }
    if (score >= 2) scored.push({ index: i, score });
  }
  if (!scored.length) return 0;
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0].index;
}

function mapColumns(headerRow: unknown[]): ColMap {
  const map: ColMap = {
    email: null,
    first: null,
    middle: null,
    last: null,
    fullName: null,
    phone: null,
    address: null,
    payments: null,
    graduation: null,
    studentId: null,
    centre: null,
    region: null,
    parish: null,
    dob: null,
    screenshot: null,
    bankStatement: null,
    certificate: null,
    comments: null,
    manuals: null,
    legacyRef: null,
    exams: [],
    sessions: [],
  };

  headerRow.forEach((cell, idx) => {
    const label = normHeader(cell);
    if (!label) {
      // Unlabeled first column often holds the full name (Batch 2021 Sheet1).
      if (idx === 0 && map.fullName == null) map.fullName = 0;
      return;
    }

    if (/^exam\s/.test(label) || /^exam\s*\d/.test(label)) {
      map.exams.push({ label: String(cell).trim() || label, idx });
      return;
    }
    if (/session/.test(label) || /^\d{1,2}[/-]\d{1,2}/.test(label)) {
      map.sessions.push({ label: String(cell).trim() || label, idx });
      return;
    }

    if (label.includes("email")) map.email = idx;
    else if (
      label.includes("student") &&
      label.includes("id")
    ) {
      map.studentId = idx;
    } else if (
      label === "student id" ||
      label === "studentid" ||
      (label === "id" && idx === 0)
    ) {
      map.studentId = idx;
    } else if (
      label.includes("app com") ||
      label.includes("application no")
    ) {
      map.legacyRef = idx;
    } else if (label === "surname" || label === "last name" || label === "family name") {
      map.last = idx;
    } else if (
      label === "second name" ||
      label === "middle name" ||
      label === "other names"
    ) {
      map.middle = idx;
    } else if (
      label === "first name" ||
      label === "firstname" ||
      label === "given name" ||
      label === "forename"
    ) {
      map.first = idx;
    } else if (
      label === "name" ||
      label === "names" ||
      label === "full name" ||
      label === "student name"
    ) {
      map.fullName = idx;
      if (map.first == null && map.last == null) {
        map.first = idx;
      }
    } else if (label.includes("phone") || label.includes("mobile")) {
      map.phone = idx;
    } else if (label.includes("address")) {
      map.address = idx;
    } else if (label === "dob" || label.includes("date of birth")) {
      map.dob = idx;
    } else if (label.includes("screenshot")) {
      map.screenshot = idx;
    } else if (
      label.includes("bank stat") ||
      label.includes("bank statement")
    ) {
      map.bankStatement = idx;
    } else if (
      label.includes("payment") ||
      label.includes("tuition") ||
      label === "amount paid"
    ) {
      map.payments = idx;
    } else if (label.includes("graduation") || label.includes("grad fee")) {
      map.graduation = idx;
    } else if (label === "centre" || label === "center") {
      map.centre = idx;
    } else if (label.includes("parish")) {
      map.parish = idx;
    } else if (label.includes("region")) {
      map.region = idx;
    } else if (label.includes("certificate")) {
      map.certificate = idx;
    } else if (label.includes("comment")) {
      map.comments = idx;
    } else if (label.includes("manual")) {
      map.manuals = idx;
    }
  });

  // Batch 2021 Sheet2: col0 Student ID, col1 unlabeled name
  if (map.studentId === 0 && map.fullName == null && map.first == null) {
    map.fullName = 1;
  }

  // NAME + SURNAME style: first points at NAME, last at SURNAME
  if (map.last != null && map.first == null && map.fullName != null) {
    map.first = map.fullName;
  }

  return map;
}

function cellAt(row: unknown[], idx: number | null): string {
  if (idx == null || idx < 0 || idx >= row.length) return "";
  const v = row[idx];
  if (v == null) return "";
  return String(v).trim();
}

function isJunkSheet(sheetName: string, map: ColMap, sampleRows: unknown[][]): boolean {
  const low = sheetName.toLowerCase();
  if (/coordinator/.test(low)) return true;
  if (!map.email && !map.first && !map.last && !map.fullName && !map.studentId) {
    return true;
  }
  // Sheet with only address + name and no email/centre (Batch 2021 "ok")
  if (
    map.address != null &&
    map.email == null &&
    map.centre == null &&
    map.payments == null &&
    map.exams.length === 0 &&
    map.last == null
  ) {
    const hasUseful = sampleRows.some((r) => cellAt(r, map.email) || cellAt(r, map.centre));
    if (!hasUseful && map.fullName != null) {
      // Still keep if it has names only? For "ok" sheet we skip — address-only duplicate.
      return true;
    }
  }
  return false;
}

function parseSheetRows(
  sheetName: string,
  rows: unknown[][],
  meta: { batchYear: number; batchLabel: string; sourceFile: string | null },
  seenKeys: Set<string>,
  allRows: ParsedAlumniRow[],
): {
  added: number;
  skipped: AlumniImportPreview["skipped"];
} {
  const headerIndex = findHeaderRow(rows);
  const headerRow = rows[headerIndex] ?? [];
  const map = mapColumns(headerRow);
  const data = rows.slice(headerIndex + 1);
  let added = 0;
  const skipped: AlumniImportPreview["skipped"] = [];

  if (isJunkSheet(sheetName, map, data.slice(0, 5))) {
    skipped.push(
      skip(sheetName, headerIndex + 1, "junk_sheet", "Sheet skipped (not a student list)"),
    );
    return { added, skipped };
  }

  for (let i = 0; i < data.length; i += 1) {
    const row = data[i] ?? [];
    const rowNumber = headerIndex + i + 2;
    if (!row.some((c) => c != null && String(c).trim())) continue;

    // Skip section banners like "Rotherham Centre - Pastor…"
    const firstCell = cellAt(row, 0);
    if (
      /centre|center|coordinator|pastor/i.test(firstCell) &&
      !cellAt(row, map.email) &&
      !cellAt(row, map.last)
    ) {
      continue;
    }

    const emailRaw = cellAt(row, map.email).toLowerCase();
    const email =
      emailRaw && isValidEmail(emailRaw) ? emailRaw : null;
    if (emailRaw && !email) {
      skipped.push(skip(sheetName, rowNumber, "invalid_email", emailRaw));
    }

    let centre = cellAt(row, map.centre) || null;
    const parish = cellAt(row, map.parish) || null;
    const region = cellAt(row, map.region) || null;
    const surnameCol = cellAt(row, map.last);
    let givenOrFull = "";
    if (map.first != null && map.last != null) {
      givenOrFull = cellAt(row, map.first);
    } else if (map.fullName != null) {
      givenOrFull = cellAt(row, map.fullName);
    } else if (map.first != null) {
      givenOrFull = cellAt(row, map.first);
    }

    if (!givenOrFull && !surnameCol) {
      if (map.studentId === 0) givenOrFull = cellAt(row, 1);
    }

    if (!givenOrFull && !surnameCol) continue;

    const stripped = stripCentreFromName(givenOrFull || surnameCol);
    if (stripped.centre && !centre) centre = stripped.centre;
    if (parish && !centre) centre = parish;

    let names: ReturnType<typeof splitPersonName>;
    if (map.first != null && map.last != null) {
      const firstName = cleanPart(stripped.name || givenOrFull);
      const lastName = cleanPart(surnameCol);
      const middleName =
        map.middle != null ? cleanPart(cellAt(row, map.middle)) || null : null;
      names = {
        firstName: firstName || lastName,
        middleName,
        lastName: lastName || firstName,
        displayName: buildDisplayName(
          firstName || lastName,
          middleName,
          lastName || firstName,
        ),
      };
    } else {
      names = splitPersonName(
        stripped.name || surnameCol,
        map.first != null && map.last != null ? surnameCol : null,
      );
    }

    if (!names.firstName || !names.lastName) {
      skipped.push(
        skip(sheetName, rowNumber, "missing_name", givenOrFull || surnameCol),
      );
      continue;
    }

    const payment = parseMoney(cellAt(row, map.payments));
    const screenshot = parseMoney(cellAt(row, map.screenshot));
    const bank = parseMoney(cellAt(row, map.bankStatement));
    const grad = parseMoney(cellAt(row, map.graduation));
    const mobile = cellAt(row, map.phone) || null;
    let studentId = cellAt(row, map.studentId) || null;
    let legacyRef =
      parseAppComRef(cellAt(row, map.legacyRef)) ||
      parseAppComRef(cellAt(row, 0)) ||
      null;
    if (studentId && parseAppComRef(studentId)) {
      legacyRef = legacyRef ?? parseAppComRef(studentId);
      studentId = null;
    }
    const addressText = cellAt(row, map.address) || null;
    const dateOfBirth =
      map.dob != null ? parseDob(row[map.dob]) : null;
    const certificateNote = cellAt(row, map.certificate) || null;
    const comments = cellAt(row, map.comments) || null;
    const manualsRaw = cellAt(row, map.manuals);
    const manualsSent = /sent|yes|y|all/i.test(manualsRaw);

    const tuitionPaidGbp =
      payment.amount ||
      Math.max(screenshot.amount, bank.amount, 0);
    const tuitionCovered = payment.covered;
    const tuitionNote =
      payment.note ||
      (payment.amount > 0
        ? null
        : [screenshot.note, bank.note].filter(Boolean).join(" · ") || null);

    const exams: AlumniExamEntry[] = map.exams.map(({ label, idx }) => ({
      label,
      percent: parsePercent(row[idx]),
    }));
    const sessions: AlumniSessionEntry[] = map.sessions.map(
      ({ label, idx }) => ({
        label,
        date: sessionDateFromLabel(label),
        present: parsePresent(row[idx]),
      }),
    );

    const dedupeKey = email
      ? fingerprint([meta.batchYear, "email", email])
      : fingerprint([
          meta.batchYear,
          "name",
          names.displayName,
          studentId || "",
          centre || "",
        ]);
    if (seenKeys.has(dedupeKey)) {
      const prev = allRows.find((r) => {
        const key = r.email
          ? fingerprint([r.batchYear, "email", r.email])
          : fingerprint([
              r.batchYear,
              "name",
              r.displayName,
              r.studentId || "",
              r.centre || "",
            ]);
        return key === dedupeKey;
      });
      if (prev) {
        mergeInto(prev, {
          email: email || prev.email,
          mobile: mobile || prev.mobile,
          addressText: addressText || prev.addressText,
          centre: centre || prev.centre,
          region: region || prev.region,
          parish: parish || prev.parish,
          dateOfBirth: dateOfBirth || prev.dateOfBirth,
          studentId: studentId || prev.studentId,
          legacyAppComNo: legacyRef || prev.legacyAppComNo,
          screenshotGbp: Math.max(prev.screenshotGbp, screenshot.amount),
          bankStatementGbp: Math.max(prev.bankStatementGbp, bank.amount),
          tuitionPaidGbp: Math.max(prev.tuitionPaidGbp, tuitionPaidGbp),
          tuitionCovered: prev.tuitionCovered || tuitionCovered,
          tuitionNote: tuitionNote || prev.tuitionNote,
          middleName: names.middleName || prev.middleName,
          displayName: names.displayName || prev.displayName,
          graduationPaidGbp: Math.max(prev.graduationPaidGbp, grad.amount),
          certificateNote: certificateNote || prev.certificateNote,
          comments: comments || prev.comments,
          manualsSent: prev.manualsSent || manualsSent,
          exams: mergeExams(prev.exams, exams),
          sessions: prev.sessions.length ? prev.sessions : sessions,
        });
        continue;
      }
      skipped.push(
        skip(sheetName, rowNumber, "duplicate_in_file", names.displayName),
      );
      continue;
    }
    seenKeys.add(dedupeKey);

    const importFingerprint = fingerprint([
      meta.batchYear,
      meta.sourceFile || "",
      email || "",
      studentId || "",
      names.firstName,
      names.lastName,
      centre || "",
      names.displayName,
    ]);

    allRows.push({
      sheet: sheetName,
      rowNumber,
      batchYear: meta.batchYear,
      batchLabel: meta.batchLabel,
      sourceFile: meta.sourceFile,
      firstName: names.firstName,
      lastName: names.lastName,
      middleName: names.middleName,
      displayName: names.displayName,
      email,
      mobile,
      addressText,
      centre,
      region: region || null,
      parish: parish || null,
      dateOfBirth,
      studentId,
      legacyAppComNo: legacyRef,
      screenshotGbp: screenshot.amount,
      bankStatementGbp: bank.amount,
      tuitionPaidGbp,
      tuitionCovered,
      tuitionNote,
      graduationPaidGbp: grad.amount,
      certificateNote,
      comments,
      manualsSent,
      sessions,
      exams,
      importFingerprint,
    });
    added += 1;
  }

  return { added, skipped };
}

function mergeExams(
  a: AlumniExamEntry[],
  b: AlumniExamEntry[],
): AlumniExamEntry[] {
  const byLabel = new Map<string, AlumniExamEntry>();
  for (const e of [...a, ...b]) {
    const key = e.label.toLowerCase();
    const prev = byLabel.get(key);
    if (!prev || (e.percent != null && prev.percent == null)) {
      byLabel.set(key, e);
    }
  }
  return [...byLabel.values()];
}

function mergeInto(
  target: ParsedAlumniRow,
  patch: Partial<ParsedAlumniRow>,
) {
  Object.assign(target, patch);
}

export function parseAlumniWorkbook(
  buffer: ArrayBuffer,
  options?: { fileName?: string },
): AlumniImportPreview {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const meta = batchMetaFromFileName(options?.fileName);
  const rows: ParsedAlumniRow[] = [];
  const skipped: AlumniImportPreview["skipped"] = [];
  const sheetCounts: AlumniImportPreview["sheetCounts"] = [];
  const seenKeys = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const parsed = parseSheetRows(
      sheetName,
      matrix,
      {
        batchYear: meta.batchYear,
        batchLabel: meta.batchLabel,
        sourceFile: options?.fileName ?? null,
      },
      seenKeys,
      rows,
    );
    skipped.push(...parsed.skipped);
    sheetCounts.push({
      sheet: sheetName,
      valid: parsed.added,
      skipped: parsed.skipped.length,
    });
  }

  return {
    rows,
    skipped,
    sheetCounts,
    batchYear: meta.batchYear,
    batchLabel: meta.batchLabel,
  };
}

export type { ParsedAlumniRow };
