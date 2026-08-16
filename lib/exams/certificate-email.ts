import {
  portalBaseUrl,
  sendExamResultCertificateViaBackend,
} from "@/lib/email/backend";
import { attemptHasFinalScore } from "@/lib/exams/attempt-status";
import { passedExam } from "@/lib/exams/score";
import type { Exam, ExamAttempt, ExamCandidate } from "@/lib/exams/types";
import { SOD_SITE } from "@/lib/site-nav";

export { attemptHasFinalScore } from "@/lib/exams/attempt-status";

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Email a single open-assessment result certificate.
 * Intended for open-link / visitor candidates (not enrolled student Records).
 */
export async function sendAttemptCertificateEmail(input: {
  exam: Pick<Exam, "title" | "slug" | "pass_percent" | "audience">;
  attempt: ExamAttempt;
  candidate: ExamCandidate;
}): Promise<{ ok: boolean; message: string }> {
  const { exam, attempt, candidate } = input;
  if (!attemptHasFinalScore(attempt) || attempt.percent == null) {
    return {
      ok: false,
      message: "Final score is not ready yet.",
    };
  }

  const email = candidate.email.trim().toLowerCase();
  const name = candidate.full_name.trim() || email.split("@")[0] || "Candidate";
  // Open assessments use /exam/... ; keep student path only if ever reused.
  const examPath =
    exam.audience === "open"
      ? `/exam/${exam.slug}`
      : `/student/exams/${exam.slug}`;

  const result = await sendExamResultCertificateViaBackend({
    to: email,
    candidateName: name,
    candidateEmail: email,
    examTitle: exam.title,
    percent: Number(attempt.percent),
    passPercent: Number(exam.pass_percent),
    passed: passedExam(Number(attempt.percent), Number(exam.pass_percent)),
    totalScore: Number(attempt.total_score),
    maxScore: Number(attempt.max_score),
    submittedAtLabel: formatWhen(attempt.submitted_at),
    issuedAtLabel: formatWhen(new Date().toISOString()),
    church: candidate.church,
    portalSupportUrl: `${portalBaseUrl()}/support`,
    siteUrl: SOD_SITE,
    examUrl: `${portalBaseUrl()}${examPath}`,
  });

  if (!result.ok) {
    console.error("[exam certificate email]", result.message);
    return {
      ok: false,
      message: "Could not send the certificate email. Please try again.",
    };
  }

  return { ok: true, message: `Certificate emailed to ${email}.` };
}
