/** Original sitting + one retake. */
export const EXAM_MAX_ATTEMPTS = 2;

export function examRetakesRemaining(completedCount: number): number {
  return Math.max(0, EXAM_MAX_ATTEMPTS - Math.max(0, completedCount));
}

export function canStartAnotherExamAttempt(completedCount: number): boolean {
  return completedCount < EXAM_MAX_ATTEMPTS;
}
