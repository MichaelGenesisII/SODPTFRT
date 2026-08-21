export const EXAM_AUDIENCES = ["student", "open"] as const;
export type ExamAudience = (typeof EXAM_AUDIENCES)[number];

export const EXAM_STATUSES = ["draft", "published", "closed"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const EXAM_QUESTION_TYPES = [
  "multiple_choice",
  "true_false",
  "short_answer",
  "long_answer",
] as const;
export type ExamQuestionType = (typeof EXAM_QUESTION_TYPES)[number];

export const EXAM_ATTEMPT_STATUSES = [
  "in_progress",
  "submitted",
  "graded",
  "released",
] as const;
export type ExamAttemptStatus = (typeof EXAM_ATTEMPT_STATUSES)[number];

export type McqPayload = {
  options: { key: string; text: string }[];
  correctKeys: string[];
  multi?: boolean;
};

export type TrueFalsePayload = {
  correct: boolean;
};

export type ShortAnswerPayload = {
  modelAnswer?: string;
};

export type LongAnswerPayload = {
  rubric?: string;
};

export type QuestionPayload =
  | McqPayload
  | TrueFalsePayload
  | ShortAnswerPayload
  | LongAnswerPayload
  | Record<string, unknown>;

export type ExamQuestion = {
  id: string;
  exam_id: string;
  sort_order: number;
  type: ExamQuestionType;
  prompt: string;
  points: number;
  payload: QuestionPayload;
  created_at?: string;
};

export type Exam = {
  id: string;
  title: string;
  slug: string;
  audience: ExamAudience;
  status: ExamStatus;
  duration_minutes: number;
  pass_percent: number;
  counts_toward_record: boolean;
  /** Open exams: show final score / certificate to the visitor after grading. */
  visitor_reveal_score: boolean;
  /** Open exams: email certificate when final score is ready (requires reveal). */
  visitor_email_scorecard: boolean;
  parish_id: string | null;
  batch_id: string | null;
  instructions: string | null;
  opens_at: string | null;
  closes_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  question_count?: number;
  parish_name?: string | null;
  batch_name?: string | null;
};

export type ExamCandidate = {
  full_name: string;
  email: string;
  phone?: string;
  church?: string;
};

export type ExamAttempt = {
  id: string;
  exam_id: string;
  user_id: string | null;
  candidate: ExamCandidate | null;
  attempt_token: string;
  status: ExamAttemptStatus;
  started_at: string;
  submitted_at: string | null;
  auto_score: number;
  manual_score: number;
  total_score: number;
  max_score: number;
  percent: number | null;
  graded_by: string | null;
  graded_at: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
  exam_title?: string;
  exam_audience?: ExamAudience;
  student_name?: string | null;
  student_email?: string | null;
};

export type ExamAnswer = {
  id: string;
  attempt_id: string;
  question_id: string;
  response: Record<string, unknown>;
  auto_points: number | null;
  manual_points: number | null;
  grader_note: string | null;
  updated_at?: string;
};

export type ImportedQuestion = {
  type: ExamQuestionType;
  prompt: string;
  points: number;
  payload: QuestionPayload;
};

export type StudentRecord = {
  id: string;
  user_id: string;
  enrolment_id: string | null;
  parish_id: string | null;
  batch_id: string | null;
  notes: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  student_name?: string;
  student_email?: string;
  parish_name?: string | null;
  batch_name?: string | null;
  batch_year?: number | null;
  /** Signed URL for passport photo (admin desk / email). */
  passport_url?: string | null;
  graduation_gate_override_note?: string | null;
};

export type StudentRecordSession = {
  id: string;
  record_id: string;
  session_date: string;
  label: string | null;
  present: boolean;
};

export type StudentRecordEntry = {
  id: string;
  record_id: string;
  source: "exam" | "manual";
  exam_id: string | null;
  attempt_id: string | null;
  label: string;
  percent: number;
  passed: boolean;
  include_in_total: boolean;
  notes: string | null;
};

export const QUESTION_TYPE_META: Record<
  ExamQuestionType,
  { label: string; auto: boolean }
> = {
  multiple_choice: { label: "Multiple choice", auto: true },
  true_false: { label: "True / false", auto: true },
  short_answer: { label: "Short answer", auto: false },
  long_answer: { label: "Long answer", auto: false },
};

export const ATTEMPT_STATUS_META: Record<
  ExamAttemptStatus,
  { label: string; hint: string }
> = {
  in_progress: { label: "In progress", hint: "Still writing" },
  submitted: { label: "Submitted", hint: "Needs grading" },
  graded: { label: "Graded", hint: "Ready to release" },
  released: { label: "Released", hint: "Shared with candidate" },
};

export function slugifyExamTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function isExamQuestionType(value: string): value is ExamQuestionType {
  return (EXAM_QUESTION_TYPES as readonly string[]).includes(value);
}
