import * as XLSX from "xlsx";
import {
  isExamQuestionType,
  type ExamQuestionType,
  type ImportedQuestion,
  type QuestionPayload,
} from "@/lib/exams/types";

function normalizeType(raw: unknown): ExamQuestionType | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, ExamQuestionType> = {
    mcq: "multiple_choice",
    multiple_choice: "multiple_choice",
    multiplechoice: "multiple_choice",
    true_false: "true_false",
    truefalse: "true_false",
    tf: "true_false",
    short: "short_answer",
    short_answer: "short_answer",
    long: "long_answer",
    long_answer: "long_answer",
    essay: "long_answer",
  };
  const mapped = aliases[s];
  if (mapped) return mapped;
  return isExamQuestionType(s) ? s : null;
}

function splitOptions(raw: unknown): { key: string; text: string }[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/\s*\|\s*|\n+/)
    .map((part, i) => {
      const m = part.match(/^\s*([A-Za-z0-9]+)[.):\-]\s*(.+)$/);
      if (m) return { key: m[1].toUpperCase(), text: m[2].trim() };
      return { key: String.fromCharCode(65 + i), text: part.trim() };
    })
    .filter((o) => o.text.length > 0);
}

function parseCorrectKeys(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/[,|;/\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function rowToQuestion(row: Record<string, unknown>): ImportedQuestion | null {
  const type = normalizeType(
    row.type ?? row.Type ?? row.question_type ?? row.qtype,
  );
  const prompt = String(
    row.prompt ?? row.Prompt ?? row.question ?? row.Question ?? "",
  ).trim();
  if (!type || !prompt) return null;

  const points = Math.max(
    0.5,
    Number(row.points ?? row.Points ?? row.marks ?? 1) || 1,
  );

  let payload: QuestionPayload = {};

  if (type === "multiple_choice") {
    const options = splitOptions(
      row.options ?? row.Options ?? row.choices ?? row.Choices,
    );
    const correctKeys = parseCorrectKeys(
      row.answer ?? row.Answer ?? row.correct ?? row.Correct,
    );
    if (options.length < 2 || correctKeys.length < 1) return null;
    payload = {
      options,
      correctKeys,
      multi: correctKeys.length > 1,
    };
  } else if (type === "true_false") {
    const ans = String(row.answer ?? row.Answer ?? row.correct ?? "true")
      .trim()
      .toLowerCase();
    payload = {
      correct: ["true", "t", "yes", "1", "correct"].includes(ans),
    };
  } else if (type === "short_answer") {
    payload = {
      modelAnswer: String(row.answer ?? row.Answer ?? row.model ?? "").trim() ||
        undefined,
    };
  } else {
    payload = {
      rubric: String(row.rubric ?? row.Rubric ?? row.answer ?? "").trim() ||
        undefined,
    };
  }

  return { type, prompt, points, payload };
}

function recordsFromSheet(rows: unknown[][]): Record<string, unknown>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h, i) =>
    String(h ?? `col_${i}`)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_"),
  );
  return rows.slice(1).map((cells) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i];
      // also keep original-ish keys
      const pretty = String(rows[0][i] ?? h);
      obj[pretty] = cells[i];
    });
    return obj;
  });
}

/** Parse CSV / XLSX / JSON text into questions. Never stores the file. */
export function parseQuestionsFromFile(
  filename: string,
  data: ArrayBuffer | string,
): {
  questions: ImportedQuestion[];
  message: string;
  suggestedTitle?: string;
} {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".json") || (typeof data === "string" && data.trim().startsWith("[")) || (typeof data === "string" && data.trim().startsWith("{"))) {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { questions: [], message: "Invalid JSON." };
    }
    let suggestedTitle: string | undefined;
    let list: unknown[] | null = null;
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as {
        title?: unknown;
        questions?: unknown;
      };
      if (typeof obj.title === "string" && obj.title.trim()) {
        suggestedTitle = obj.title.trim();
      }
      if (Array.isArray(obj.questions)) list = obj.questions;
    }
    if (!list) {
      return { questions: [], message: "JSON must be an array of questions (or { title, questions })." };
    }
    const questions = list
      .map((item) => rowToQuestion(item as Record<string, unknown>))
      .filter((q): q is ImportedQuestion => Boolean(q));
    return {
      questions,
      suggestedTitle,
      message: `Parsed ${questions.length} question${questions.length === 1 ? "" : "s"}.`,
    };
  }

  if (lower.endsWith(".txt") || lower.endsWith(".qti.txt")) {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    const blocks = text
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);
    const questions: ImportedQuestion[] = [];
    for (const block of blocks) {
      const lines = block.split(/\n/).map((l) => l.trim());
      const head = lines[0] ?? "";
      const typeMatch = head.match(/^\[(mcq|tf|true_false|short|long|essay)\]\s*(.*)$/i);
      const type = normalizeType(typeMatch?.[1] ?? "short");
      const prompt = (typeMatch?.[2] || head).trim();
      if (!type || !prompt) continue;
      if (type === "multiple_choice") {
        const optionLines = lines.slice(1).filter((l) => /^[A-Za-z][.)]/.test(l));
        const answerLine = lines.find((l) => /^answer:/i.test(l));
        const options = optionLines.map((l) => {
          const m = l.match(/^([A-Za-z])[.)]\s*(.+)$/);
          return m
            ? { key: m[1].toUpperCase(), text: m[2] }
            : { key: "A", text: l };
        });
        const correctKeys = parseCorrectKeys(
          answerLine?.replace(/^answer:\s*/i, "") ?? "",
        );
        if (options.length >= 2 && correctKeys.length) {
          questions.push({
            type,
            prompt,
            points: 1,
            payload: { options, correctKeys },
          });
        }
      } else if (type === "true_false") {
        const answerLine = lines.find((l) => /^answer:/i.test(l));
        const ans = (answerLine?.replace(/^answer:\s*/i, "") ?? "true")
          .trim()
          .toLowerCase();
        questions.push({
          type,
          prompt,
          points: 1,
          payload: {
            correct: ["true", "t", "yes", "1"].includes(ans),
          },
        });
      } else {
        const answerLine = lines.find((l) => /^answer:/i.test(l));
        questions.push({
          type,
          prompt,
          points: type === "long_answer" ? 5 : 2,
          payload:
            type === "short_answer"
              ? {
                  modelAnswer: answerLine?.replace(/^answer:\s*/i, "").trim(),
                }
              : {
                  rubric: answerLine?.replace(/^answer:\s*/i, "").trim(),
                },
        });
      }
    }
    return {
      questions,
      message: `Parsed ${questions.length} question${questions.length === 1 ? "" : "s"} from text.`,
    };
  }

  // CSV / XLSX via SheetJS
  const workbook = XLSX.read(data, { type: typeof data === "string" ? "string" : "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  const records = recordsFromSheet(rows as unknown[][]);
  const questions = records
    .map((r) => rowToQuestion(r))
    .filter((q): q is ImportedQuestion => Boolean(q));

  return {
    questions,
    message: `Parsed ${questions.length} question${questions.length === 1 ? "" : "s"} from spreadsheet.`,
  };
}
