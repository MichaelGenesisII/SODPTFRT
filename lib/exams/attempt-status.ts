import type { ExamAttempt } from "@/lib/exams/types";

/** True when the attempt has a final (not provisional) score ready to reveal. */
export function attemptHasFinalScore(
  attempt: Pick<ExamAttempt, "status" | "percent">,
) {
  return (
    (attempt.status === "graded" || attempt.status === "released") &&
    attempt.percent != null
  );
}
