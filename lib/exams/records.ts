import type {
  StudentRecord,
  StudentRecordEntry,
  StudentRecordSession,
} from "@/lib/exams/types";

export function includedAverage(entries: StudentRecordEntry[]): number | null {
  const included = entries.filter((e) => e.include_in_total);
  if (included.length === 0) return null;
  const sum = included.reduce((acc, e) => acc + Number(e.percent), 0);
  return Math.round((sum / included.length) * 100) / 100;
}

export function attendanceRate(sessions: StudentRecordSession[]): number | null {
  if (sessions.length === 0) return null;
  const present = sessions.filter((s) => s.present).length;
  return Math.round((present / sessions.length) * 1000) / 10;
}

export type RecordBundle = {
  record: StudentRecord;
  sessions: StudentRecordSession[];
  entries: StudentRecordEntry[];
  average: number | null;
  attendance: number | null;
};
