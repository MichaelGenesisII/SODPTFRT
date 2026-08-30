import type { AttendanceSource } from "@/lib/classes/types";

export type ClassRollRow = {
  user_id: string;
  name: string;
  email: string;
  present: boolean;
  source: AttendanceSource | null;
  duration_seconds: number | null;
  required_seconds: number | null;
  tuition_paid: boolean;
  graduation_paid: boolean;
  fees_label: string;
};

export type ClassUnmatchedRow = {
  id: string;
  name: string;
  email: string;
  present: boolean;
  source: AttendanceSource;
  duration_seconds: number;
  required_seconds: number;
};

export type ClassAttendanceRollup = {
  attended: ClassRollRow[];
  absent: ClassRollRow[];
  unmatched: ClassUnmatchedRow[];
  expected_total: number;
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDurationCsv(seconds: number | null): string {
  if (seconds == null) return "";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function downloadClassRollCsv(
  rows: ClassRollRow[] | ClassUnmatchedRow[],
  filename: string,
  options?: { includeFees?: boolean },
) {
  const includeFees = options?.includeFees ?? true;
  const headers = includeFees
    ? [
        "Name",
        "Email",
        "Present",
        "Source",
        "Duration",
        "Required",
        "Tuition",
        "Graduation",
        "Fees summary",
      ]
    : [
        "Name",
        "Email",
        "Present",
        "Source",
        "Duration",
        "Required",
      ];

  const lines = [headers.join(",")];

  for (const row of rows) {
    const base = [
      csvEscape(row.name),
      csvEscape(row.email),
      row.present ? "Yes" : "No",
      csvEscape("source" in row && row.source ? row.source : ""),
      csvEscape(formatDurationCsv(row.duration_seconds)),
      csvEscape(
        formatDurationCsv(
          "required_seconds" in row ? row.required_seconds : null,
        ),
      ),
    ];
    if (includeFees && "tuition_paid" in row) {
      base.push(
        row.tuition_paid ? "Paid" : "Unpaid",
        row.graduation_paid ? "Paid" : "Unpaid",
        csvEscape(row.fees_label),
      );
    }
    lines.push(base.join(","));
  }

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function feesLabel(tuitionPaid: boolean, graduationPaid: boolean): string {
  const parts: string[] = [];
  parts.push(tuitionPaid ? "Tuition paid" : "Tuition unpaid");
  parts.push(graduationPaid ? "Graduation paid" : "Graduation unpaid");
  return parts.join(" · ");
}
