"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
  type AdminProfile,
} from "@/lib/admin/auth";
import { parseQuestionsFromFile } from "@/lib/exams/import-questions";
import {
  slugifyExamTitle,
  type Exam,
  type ExamAudience,
  type ExamQuestion,
  type ExamStatus,
  type ImportedQuestion,
} from "@/lib/exams/types";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ExamActionResult = {
  ok: boolean;
  message: string;
  examId?: string;
  slug?: string;
};

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type ExamScopeRow = {
  id: string;
  title: string;
  slug: string;
  parish_id: string | null;
  batch_id: string | null;
};

function unauthorized(): ExamActionResult {
  return { ok: false, message: "Unauthorized." };
}

function actionFail(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): { ok: false; message: string } {
  console.error("[admin/exams]", error);
  return {
    ok: false,
    message: publicActionMessage(error, fallback),
  };
}

function assertExamScope(
  actor: AdminProfile,
  parishId: string | null,
): ExamActionResult | null {
  if (isNationalAdmin(actor)) return null;
  if (!actor.parish_id) {
    return { ok: false, message: "Parish scope required." };
  }
  if (!parishId || parishId !== actor.parish_id) {
    return {
      ok: false,
      message: parishId
        ? "Outside your parish."
        : "Parish admins must attach exams to their parish.",
    };
  }
  return null;
}

/**
 * Cookie/RLS gate — parish desks only manage exams with their parish_id.
 * National/null-parish exams are national-only.
 */
async function requireAccessibleExam(examId: string): Promise<
  | {
      ok: true;
      supabase: Supabase;
      actor: AdminProfile;
      exam: ExamScopeRow;
    }
  | { ok: false; message: string }
> {
  let actor: AdminProfile;
  try {
    actor = await requireSessionAdmin();
  } catch {
    return { ok: false, message: "Unauthorized." };
  }

  if (!examId) {
    return { ok: false, message: "Exam id is required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("exams")
    .select("id, title, slug, parish_id, batch_id")
    .eq("id", examId)
    .maybeSingle();

  if (error) return actionFail(error);
  if (!data) {
    return {
      ok: false,
      message: "Exam not found or outside your parish scope.",
    };
  }

  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return {
        ok: false,
        message: "Parish desk is not assigned to a parish.",
      };
    }
    if (!data.parish_id || data.parish_id !== actor.parish_id) {
      return {
        ok: false,
        message: "Exam not found or outside your parish scope.",
      };
    }
  }

  return { ok: true, supabase, actor, exam: data as ExamScopeRow };
}

/**
 * Batch is optional. Parish is no longer chosen in the UI:
 * - National: null parish unless a batch stamps its parish
 * - Parish desk: always stamp actor.parish_id (RLS)
 */
async function resolveExamParishBatch(
  actor: AdminProfile,
  input: { batch_id: string | null },
  supabase: Supabase,
): Promise<
  { parish_id: string | null; batch_id: string | null } | ExamActionResult
> {
  const batchId = input.batch_id || null;
  let parishId: string | null = isNationalAdmin(actor)
    ? null
    : (actor.parish_id ?? null);

  if (batchId) {
    const { data: batch, error } = await supabase
      .from("batches")
      .select("id, parish_id")
      .eq("id", batchId)
      .maybeSingle();
    if (error) return actionFail(error);
    if (!batch) {
      return { ok: false, message: "Batch not found or outside your parish." };
    }
    if (!isNationalAdmin(actor) && actor.parish_id && batch.parish_id !== actor.parish_id) {
      return { ok: false, message: "Batch does not match your parish." };
    }
    parishId = batch.parish_id;
  }

  const scope = assertExamScope(actor, parishId ?? null);
  if (scope) return scope;

  return { parish_id: parishId ?? null, batch_id: batchId };
}

function normalizeYearIndex(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

function revalidateExams(examId?: string) {
  revalidatePath("/admin/exams");
  if (examId) revalidatePath(`/admin/exams/${examId}`);
  revalidatePath("/admin/records");
  revalidatePath("/student/exams");
  revalidatePath("/student/records");
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const supabase = await createServerSupabaseClient();
  let slug = base || "exam";
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    let q = supabase.from("exams").select("id").eq("slug", candidate).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

export async function listAdminExams(): Promise<Exam[]> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();

  if (!isNationalAdmin(actor) && !actor.parish_id) {
    return [];
  }

  let q = supabase
    .from("exams")
    .select(
      "id, title, slug, audience, status, duration_minutes, pass_percent, counts_toward_record, visitor_reveal_score, visitor_email_scorecard, year_index, parish_id, batch_id, instructions, opens_at, closes_at, created_by, created_at, updated_at, parishes(name), batches(name)",
    )
    .order("updated_at", { ascending: false });

  if (!isNationalAdmin(actor) && actor.parish_id) {
    q = q.eq("parish_id", actor.parish_id);
  }

  let { data, error } = await q;

  // Graceful until migrations for visitor columns / year_index are applied.
  if (
    error &&
    /visitor_reveal_score|visitor_email_scorecard|year_index|column/i.test(
      error.message,
    )
  ) {
    let fallback = supabase
      .from("exams")
      .select(
        "id, title, slug, audience, status, duration_minutes, pass_percent, counts_toward_record, parish_id, batch_id, instructions, opens_at, closes_at, created_by, created_at, updated_at, parishes(name), batches(name)",
      )
      .order("updated_at", { ascending: false });
    if (!isNationalAdmin(actor) && actor.parish_id) {
      fallback = fallback.eq("parish_id", actor.parish_id);
    }
    const again = await fallback;
    data = again.data as typeof data;
    error = again.error;
  }

  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((e) => e.id);
  const countMap = new Map<string, number>();
  if (ids.length) {
    const { data: qs } = await supabase
      .from("exam_questions")
      .select("exam_id")
      .in("exam_id", ids);
    for (const row of qs ?? []) {
      countMap.set(row.exam_id, (countMap.get(row.exam_id) ?? 0) + 1);
    }
  }

  return (data ?? []).map((row) => {
    const parish = row.parishes as { name?: string } | null;
    const batch = row.batches as { name?: string } | null;
    const yearRaw = (row as { year_index?: number | null }).year_index;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      audience: row.audience,
      status: row.status,
      duration_minutes: row.duration_minutes,
      pass_percent: Number(row.pass_percent),
      counts_toward_record: row.counts_toward_record,
      visitor_reveal_score: Boolean(
        (row as { visitor_reveal_score?: boolean }).visitor_reveal_score,
      ),
      visitor_email_scorecard: Boolean(
        (row as { visitor_email_scorecard?: boolean }).visitor_email_scorecard,
      ),
      year_index: yearRaw != null ? Number(yearRaw) : null,
      parish_id: row.parish_id,
      batch_id: row.batch_id,
      instructions: row.instructions,
      opens_at: row.opens_at,
      closes_at: row.closes_at,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      question_count: countMap.get(row.id) ?? 0,
      parish_name: parish?.name ?? null,
      batch_name: batch?.name ?? null,
    } satisfies Exam;
  });
}

export async function getAdminExam(
  examId: string,
): Promise<{ exam: Exam; questions: ExamQuestion[] } | null> {
  const access = await requireAccessibleExam(examId);
  if (!access.ok) return null;

  const { supabase } = access;
  const { data: row, error } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;

  const { data: questions, error: qErr } = await supabase
    .from("exam_questions")
    .select("*")
    .eq("exam_id", examId)
    .order("sort_order", { ascending: true });
  if (qErr) throw new Error(qErr.message);

  return {
    exam: {
      ...row,
      pass_percent: Number(row.pass_percent),
      year_index:
        (row as { year_index?: number | null }).year_index != null
          ? Number((row as { year_index?: number | null }).year_index)
          : null,
      visitor_reveal_score: Boolean(
        (row as { visitor_reveal_score?: boolean }).visitor_reveal_score,
      ),
      visitor_email_scorecard: Boolean(
        (row as { visitor_email_scorecard?: boolean }).visitor_email_scorecard,
      ),
      question_count: questions?.length ?? 0,
    } as Exam,
    questions: (questions ?? []).map((q) => ({
      ...q,
      points: Number(q.points),
      payload: q.payload ?? {},
    })) as ExamQuestion[],
  };
}

export async function createExam(input: {
  title: string;
  audience: ExamAudience;
  duration_minutes: number;
  pass_percent: number;
  counts_toward_record: boolean;
  visitor_reveal_score: boolean;
  visitor_email_scorecard: boolean;
  year_index?: number | null;
  batch_id: string | null;
  instructions: string;
}): Promise<ExamActionResult> {
  let actor: AdminProfile;
  try {
    actor = await requireSessionAdmin();
  } catch {
    return unauthorized();
  }

  const title = input.title.trim();
  if (title.length < 2) {
    return { ok: false, message: "Title is required." };
  }

  const yearIndex = normalizeYearIndex(input.year_index);
  if (input.year_index != null && yearIndex == null) {
    return { ok: false, message: "Exam year must be between 1 and 10." };
  }

  const supabase = await createServerSupabaseClient();
  const resolved = await resolveExamParishBatch(
    actor,
    { batch_id: input.batch_id },
    supabase,
  );
  if ("ok" in resolved) return resolved;

  const slug = await uniqueSlug(slugifyExamTitle(title));
  const openAudience = input.audience === "open";
  const { data, error } = await supabase
    .from("exams")
    .insert({
      title,
      slug,
      audience: input.audience,
      duration_minutes: Math.min(600, Math.max(1, input.duration_minutes || 60)),
      pass_percent: Math.min(100, Math.max(0, input.pass_percent ?? 50)),
      counts_toward_record:
        input.audience === "student" ? input.counts_toward_record : false,
      visitor_reveal_score: openAudience ? Boolean(input.visitor_reveal_score) : false,
      visitor_email_scorecard:
        openAudience && input.visitor_reveal_score
          ? Boolean(input.visitor_email_scorecard)
          : false,
      year_index: openAudience ? null : yearIndex,
      parish_id: resolved.parish_id,
      batch_id: resolved.batch_id,
      instructions: input.instructions.trim() || null,
      created_by: actor.id,
      status: "draft",
    })
    .select("id, slug")
    .single();

  if (error) return actionFail(error);
  revalidateExams(data.id);
  return {
    ok: true,
    message: "Exam created as draft.",
    examId: data.id,
    slug: data.slug,
  };
}

export async function updateExamMeta(
  examId: string,
  input: {
    title: string;
    audience: ExamAudience;
    duration_minutes: number;
    pass_percent: number;
    counts_toward_record: boolean;
    visitor_reveal_score: boolean;
    visitor_email_scorecard: boolean;
    year_index?: number | null;
    batch_id: string | null;
    instructions: string;
    opens_at: string | null;
    closes_at: string | null;
  },
): Promise<ExamActionResult> {
  const access = await requireAccessibleExam(examId);
  if (!access.ok) return { ok: false, message: access.message };

  const { actor, supabase, exam: existing } = access;

  const yearIndex = normalizeYearIndex(input.year_index);
  if (input.year_index != null && yearIndex == null) {
    return { ok: false, message: "Exam year must be between 1 and 10." };
  }

  const resolved = await resolveExamParishBatch(
    actor,
    { batch_id: input.batch_id },
    supabase,
  );
  if ("ok" in resolved) return resolved;

  const title = input.title.trim();
  if (title.length < 2) {
    return { ok: false, message: "Title is required." };
  }

  let slug = existing.slug;
  if (existing.title !== title) {
    slug = await uniqueSlug(slugifyExamTitle(title), examId);
  }

  const openAudience = input.audience === "open";
  const { error } = await supabase
    .from("exams")
    .update({
      title,
      slug,
      audience: input.audience,
      duration_minutes: Math.min(600, Math.max(1, input.duration_minutes || 60)),
      pass_percent: Math.min(100, Math.max(0, input.pass_percent ?? 50)),
      counts_toward_record:
        input.audience === "student" ? input.counts_toward_record : false,
      visitor_reveal_score: openAudience ? Boolean(input.visitor_reveal_score) : false,
      visitor_email_scorecard:
        openAudience && input.visitor_reveal_score
          ? Boolean(input.visitor_email_scorecard)
          : false,
      year_index: openAudience ? null : yearIndex,
      parish_id: resolved.parish_id,
      batch_id: resolved.batch_id,
      instructions: input.instructions.trim() || null,
      opens_at: input.opens_at || null,
      closes_at: input.closes_at || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", examId);

  if (error) return actionFail(error);
  revalidateExams(examId);
  return { ok: true, message: "Exam updated.", examId, slug };
}

export async function setExamStatus(
  examId: string,
  status: ExamStatus,
): Promise<ExamActionResult> {
  const access = await requireAccessibleExam(examId);
  if (!access.ok) return { ok: false, message: access.message };

  const { supabase } = access;
  if (status === "published") {
    const { count } = await supabase
      .from("exam_questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", examId);
    if (!count) {
      return { ok: false, message: "Add at least one question before publishing." };
    }
  }

  const { error } = await supabase
    .from("exams")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", examId);

  if (error) return actionFail(error);
  revalidateExams(examId);
  return {
    ok: true,
    message:
      status === "published"
        ? "Exam published."
        : status === "closed"
          ? "Exam closed."
          : "Exam set to draft.",
  };
}

export async function deleteExam(examId: string): Promise<ExamActionResult> {
  const access = await requireAccessibleExam(examId);
  if (!access.ok) return { ok: false, message: access.message };

  const { error } = await access.supabase.from("exams").delete().eq("id", examId);
  if (error) return actionFail(error);
  revalidateExams(examId);
  return { ok: true, message: "Exam deleted." };
}

export async function upsertQuestion(input: {
  id?: string;
  exam_id: string;
  type: ExamQuestion["type"];
  prompt: string;
  points: number;
  payload: ExamQuestion["payload"];
  sort_order?: number;
}): Promise<ExamActionResult> {
  const access = await requireAccessibleExam(input.exam_id);
  if (!access.ok) return { ok: false, message: access.message };

  const prompt = input.prompt.trim();
  if (!prompt) return { ok: false, message: "Prompt is required." };

  const { supabase } = access;
  if (input.id) {
    const { error } = await supabase
      .from("exam_questions")
      .update({
        type: input.type,
        prompt,
        points: Math.max(0.5, input.points || 1),
        payload: input.payload ?? {},
        sort_order: input.sort_order ?? 0,
      })
      .eq("id", input.id)
      .eq("exam_id", input.exam_id);
    if (error) return actionFail(error);
  } else {
    const { count } = await supabase
      .from("exam_questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", input.exam_id);
    const { error } = await supabase.from("exam_questions").insert({
      exam_id: input.exam_id,
      type: input.type,
      prompt,
      points: Math.max(0.5, input.points || 1),
      payload: input.payload ?? {},
      sort_order: input.sort_order ?? count ?? 0,
    });
    if (error) return actionFail(error);
  }

  await supabase
    .from("exams")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.exam_id);

  revalidateExams(input.exam_id);
  return { ok: true, message: "Question saved.", examId: input.exam_id };
}

export async function deleteQuestion(
  questionId: string,
  examId: string,
): Promise<ExamActionResult> {
  const access = await requireAccessibleExam(examId);
  if (!access.ok) return { ok: false, message: access.message };

  const { error } = await access.supabase
    .from("exam_questions")
    .delete()
    .eq("id", questionId)
    .eq("exam_id", examId);
  if (error) return actionFail(error);
  revalidateExams(examId);
  return { ok: true, message: "Question removed.", examId };
}

export async function reorderQuestions(
  examId: string,
  orderedIds: string[],
): Promise<ExamActionResult> {
  const access = await requireAccessibleExam(examId);
  if (!access.ok) return { ok: false, message: access.message };

  const { supabase } = access;
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error } = await supabase
      .from("exam_questions")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("exam_id", examId);
    if (error) return actionFail(error);
  }
  revalidateExams(examId);
  return { ok: true, message: "Order updated.", examId };
}

export async function importQuestionsToExam(
  examId: string,
  filename: string,
  base64: string,
): Promise<ExamActionResult & { imported?: number }> {
  const access = await requireAccessibleExam(examId);
  if (!access.ok) return { ok: false, message: access.message };

  const binary = Buffer.from(base64, "base64");
  const { questions, message } = parseQuestionsFromFile(
    filename,
    binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength,
    ),
  );

  if (!questions.length) {
    return { ok: false, message: message || "No questions found in file." };
  }

  const { supabase } = access;
  const { count } = await supabase
    .from("exam_questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  const start = count ?? 0;
  const rows = questions.map((q: ImportedQuestion, i: number) => ({
    exam_id: examId,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    payload: q.payload,
    sort_order: start + i,
  }));

  const { error } = await supabase.from("exam_questions").insert(rows);
  if (error) return actionFail(error);

  await supabase
    .from("exams")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", examId);

  revalidateExams(examId);
  return {
    ok: true,
    message,
    examId,
    imported: questions.length,
  };
}

/** Create a draft exam and fill it from an uploaded question file in one step. */
export async function createExamFromQuestionFile(
  filename: string,
  base64: string,
  options?: {
    title?: string;
    audience?: ExamAudience;
    year_index?: number | null;
    batch_id?: string | null;
  },
): Promise<ExamActionResult & { imported?: number }> {
  let actor: AdminProfile;
  try {
    actor = await requireSessionAdmin();
  } catch {
    return unauthorized();
  }

  const binary = Buffer.from(base64, "base64");
  const { questions, message, suggestedTitle } = parseQuestionsFromFile(
    filename,
    binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength,
    ),
  );

  if (!questions.length) {
    return { ok: false, message: message || "No questions found in file." };
  }

  const title = (
    options?.title?.trim() ||
    suggestedTitle ||
    filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") ||
    "Imported exam"
  ).slice(0, 160);

  const audience: ExamAudience = options?.audience ?? "student";
  const yearIndex = normalizeYearIndex(options?.year_index);
  if (options?.year_index != null && yearIndex == null) {
    return { ok: false, message: "Exam year must be between 1 and 10." };
  }

  const supabase = await createServerSupabaseClient();
  const resolved = await resolveExamParishBatch(
    actor,
    { batch_id: options?.batch_id ?? null },
    supabase,
  );
  if ("ok" in resolved) return resolved;

  const slug = await uniqueSlug(slugifyExamTitle(title));
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .insert({
      title,
      slug,
      audience,
      duration_minutes: 60,
      pass_percent: 50,
      counts_toward_record: audience === "student",
      visitor_reveal_score: false,
      visitor_email_scorecard: false,
      year_index: audience === "open" ? null : yearIndex,
      parish_id: resolved.parish_id,
      batch_id: resolved.batch_id,
      instructions:
        "Imported from file. Review questions in Compose before publishing.",
      created_by: actor.id,
      status: "draft",
    })
    .select("id, slug")
    .single();

  if (examError || !exam) {
    return actionFail(examError, "Could not create exam.");
  }

  const rows = questions.map((q: ImportedQuestion, i: number) => ({
    exam_id: exam.id,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    payload: q.payload,
    sort_order: i,
  }));

  const { error: qError } = await supabase.from("exam_questions").insert(rows);
  if (qError) {
    return {
      ok: false,
      message: `Exam created but questions failed: ${qError.message}`,
      examId: exam.id,
      slug: exam.slug,
    };
  }

  revalidateExams(exam.id);
  return {
    ok: true,
    message: `Draft “${title}” created with ${questions.length} question${questions.length === 1 ? "" : "s"}.`,
    examId: exam.id,
    slug: exam.slug,
    imported: questions.length,
  };
}
