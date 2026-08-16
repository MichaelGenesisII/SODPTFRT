import type {
  ExamAnswer,
  ExamQuestion,
  McqPayload,
  TrueFalsePayload,
} from "@/lib/exams/types";

function asMcq(payload: ExamQuestion["payload"]): McqPayload | null {
  const p = payload as McqPayload;
  if (!p || !Array.isArray(p.options) || !Array.isArray(p.correctKeys)) {
    return null;
  }
  return p;
}

function asTf(payload: ExamQuestion["payload"]): TrueFalsePayload | null {
  const p = payload as TrueFalsePayload;
  if (typeof p?.correct !== "boolean") return null;
  return p;
}

/** Auto-score one answer. Manual types return null auto_points. */
export function autoScoreAnswer(
  question: ExamQuestion,
  response: Record<string, unknown> | null | undefined,
): number | null {
  if (!response) return question.type === "multiple_choice" || question.type === "true_false"
    ? 0
    : null;

  if (question.type === "multiple_choice") {
    const mcq = asMcq(question.payload);
    if (!mcq) return 0;
    const selected = Array.isArray(response.selected)
      ? (response.selected as string[]).map(String).sort()
      : typeof response.selected === "string"
        ? [String(response.selected)]
        : [];
    const correct = [...mcq.correctKeys].map(String).sort();
    if (selected.length !== correct.length) return 0;
    const ok = selected.every((k, i) => k === correct[i]);
    return ok ? Number(question.points) : 0;
  }

  if (question.type === "true_false") {
    const tf = asTf(question.payload);
    if (!tf) return 0;
    const value = response.value;
    if (typeof value !== "boolean") return 0;
    return value === tf.correct ? Number(question.points) : 0;
  }

  return null;
}

export function needsManualGrade(question: ExamQuestion): boolean {
  return question.type === "short_answer" || question.type === "long_answer";
}

export function computeAttemptTotals(
  questions: ExamQuestion[],
  answers: Pick<
    ExamAnswer,
    "question_id" | "auto_points" | "manual_points" | "response"
  >[],
): {
  autoScore: number;
  manualScore: number;
  totalScore: number;
  maxScore: number;
  percent: number;
  allManualDone: boolean;
} {
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  let autoScore = 0;
  let manualScore = 0;
  let maxScore = 0;
  let pendingManual = 0;

  for (const q of questions) {
    maxScore += Number(q.points);
    const ans = byQ.get(q.id);
    if (needsManualGrade(q)) {
      if (ans?.manual_points == null) pendingManual += 1;
      else manualScore += Number(ans.manual_points);
    } else {
      const pts =
        ans?.auto_points != null
          ? Number(ans.auto_points)
          : autoScoreAnswer(q, ans?.response ?? null) ?? 0;
      autoScore += pts;
    }
  }

  const totalScore = autoScore + manualScore;
  const percent =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

  return {
    autoScore,
    manualScore,
    totalScore,
    maxScore,
    percent,
    allManualDone: pendingManual === 0,
  };
}

export function passedExam(percent: number, passPercent: number): boolean {
  return percent >= passPercent;
}
