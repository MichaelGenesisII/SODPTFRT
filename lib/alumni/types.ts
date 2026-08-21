export type AlumniImportSkipReason =
  | "invalid_email"
  | "duplicate_email"
  | "missing_name"
  | "missing_email";

export type ParsedAlumniRow = {
  sheet: string;
  rowNumber: number;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  legacyAppComNo: string | null;
  parishName: string | null;
  mobile: string | null;
  tuitionPaidGbp: number;
  graduationPaidGbp: number;
  manualsSent: boolean;
  sessions: { label: string; date: string | null; present: boolean }[];
  exams: { label: string; percent: number | null }[];
};

export type AlumniImportPreview = {
  rows: ParsedAlumniRow[];
  skipped: {
    sheet: string;
    rowNumber: number;
    reason: AlumniImportSkipReason;
    detail: string;
  }[];
  sheetCounts: { sheet: string; valid: number; skipped: number }[];
};

export type AlumniImportResult = {
  ok: boolean;
  message: string;
  imported: number;
  skipped: AlumniImportPreview["skipped"];
};

export const SHEET_COHORT_HINTS: Record<string, string> = {
  "sp 202223 session": "SP 2022/23",
  "ep may 23": "EP May 2023",
  "ep sep 23": "EP Sep 2023",
};
