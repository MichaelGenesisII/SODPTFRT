export type AlumniExamEntry = {
  label: string;
  percent: number | null;
};

export type AlumniSessionEntry = {
  label: string;
  date: string | null;
  present: boolean;
};

/** One person row ready to store in alumni_legacy_people (email optional). */
export type ParsedAlumniRow = {
  sheet: string;
  rowNumber: number;
  batchYear: number;
  batchLabel: string;
  sourceFile: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
  displayName: string;
  email: string | null;
  mobile: string | null;
  addressText: string | null;
  centre: string | null;
  studentId: string | null;
  legacyAppComNo: string | null;
  tuitionPaidGbp: number;
  tuitionCovered: boolean;
  tuitionNote: string | null;
  graduationPaidGbp: number;
  certificateNote: string | null;
  comments: string | null;
  manualsSent: boolean;
  sessions: AlumniSessionEntry[];
  exams: AlumniExamEntry[];
  importFingerprint: string;
};

export type AlumniImportSkipReason =
  | "missing_name"
  | "invalid_email"
  | "duplicate_in_file"
  | "junk_sheet";

export type AlumniImportPreview = {
  rows: ParsedAlumniRow[];
  skipped: {
    sheet: string;
    rowNumber: number;
    reason: AlumniImportSkipReason;
    detail: string;
  }[];
  sheetCounts: { sheet: string; valid: number; skipped: number }[];
  batchYear: number | null;
  batchLabel: string | null;
};

export type AlumniImportResult = {
  ok: boolean;
  message: string;
  imported: number;
  updated: number;
  skipped: AlumniImportPreview["skipped"];
};

export type AlumniLegacyPerson = {
  id: string;
  batch_year: number;
  batch_label: string;
  source_file: string | null;
  source_sheet: string | null;
  source_row: number | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  display_name: string;
  email: string | null;
  mobile: string | null;
  address_text: string | null;
  centre: string | null;
  student_id: string | null;
  legacy_ref: string | null;
  tuition_paid_gbp: number;
  tuition_covered: boolean;
  tuition_note: string | null;
  graduation_paid_gbp: number;
  certificate_note: string | null;
  comments: string | null;
  manuals_sent: boolean;
  exams: AlumniExamEntry[];
  sessions: AlumniSessionEntry[];
  cohort_id: string | null;
  activated_user_id: string | null;
  email_assigned_at: string | null;
  created_at: string;
};

export type AlumniPortalFilter = "all" | "awaiting_email" | "portal_ready";

/** Optional sheet → cohort name hints for known legacy workbooks. */
export const SHEET_COHORT_HINTS: Record<string, string> = {
  "sp 202223 session": "SP 2022/23",
  "ep may 23": "EP May 2023",
  "ep sep 23": "EP Sep 2023",
};
