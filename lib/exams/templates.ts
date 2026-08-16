import * as XLSX from "xlsx";

/** Column contract the importer expects (spreadsheet / CSV). */
export const TEMPLATE_HEADERS = [
  "type",
  "prompt",
  "points",
  "options",
  "answer",
  "rubric",
] as const;

export type TemplateFormat = "xlsx" | "csv" | "json" | "txt";

export type QuestionRow = Record<
  (typeof TEMPLATE_HEADERS)[number],
  string | number
>;

export type TemplatePack = {
  id: string;
  format: TemplateFormat;
  title: string;
  tagline: string;
  filename: string;
  kind: "blank" | "sample" | "exam";
  useWhen: string;
  /** Display / JSON title when kind is exam or sample */
  examTitle?: string;
  /** Question bank for exam / sample packs */
  rows?: QuestionRow[];
};

/** Short pattern demo — covers every question type. */
export const SAMPLE_QUESTION_ROWS: QuestionRow[] = [
  {
    type: "multiple_choice",
    prompt: "Who is the Head of the Church?",
    points: 1,
    options: "A) Peter | B) Jesus Christ | C) Paul | D) Moses",
    answer: "B",
    rubric: "",
  },
  {
    type: "multiple_choice",
    prompt: "Which are fruits of the Spirit? (select all that apply)",
    points: 2,
    options: "A) Love | B) Anger | C) Joy | D) Peace",
    answer: "A,C,D",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Water baptism is an outward testimony of an inward change.",
    points: 1,
    options: "",
    answer: "true",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "What does SOD stand for in this school?",
    points: 2,
    options: "",
    answer: "School of Disciples",
    rubric: "",
  },
  {
    type: "long_answer",
    prompt:
      "In your own words, describe how discipleship differs from mere church attendance.",
    points: 5,
    options: "",
    answer: "",
    rubric:
      "Look for: following Christ, growth, obedience, community — not just Sunday presence.",
  },
];

/** Full ready-made papers — download, upload unchanged, publish when ready. */
const FOUNDATION_OF_FAITH: QuestionRow[] = [
  {
    type: "multiple_choice",
    prompt: "Salvation is primarily a gift of God’s grace received through:",
    points: 1,
    options: "A) Good works | B) Faith in Christ | C) Church membership | D) Tithes",
    answer: "B",
    rubric: "",
  },
  {
    type: "multiple_choice",
    prompt: "Which statement best describes repentance?",
    points: 1,
    options:
      "A) Feeling sorry only | B) Turning from sin toward God | C) Joining a parish | D) Memorising Scripture",
    answer: "B",
    rubric: "",
  },
  {
    type: "multiple_choice",
    prompt: "The Bible is:",
    points: 1,
    options:
      "A) Helpful advice only | B) Inspired Word of God | C) Church tradition | D) Optional reading",
    answer: "B",
    rubric: "",
  },
  {
    type: "multiple_choice",
    prompt: "Which belong to the Godhead? (select all that apply)",
    points: 2,
    options: "A) Father | B) Son | C) Holy Spirit | D) Angels",
    answer: "A,B,C",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Jesus Christ is fully God and fully man.",
    points: 1,
    options: "",
    answer: "true",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "A person can earn eternal life by perfect church attendance.",
    points: 1,
    options: "",
    answer: "false",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Prayer is communication with God.",
    points: 1,
    options: "",
    answer: "true",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "Name one evidence of a genuine new birth.",
    points: 2,
    options: "",
    answer: "Changed life / love for God / desire for holiness / witness of the Spirit",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "What does “SOD” stand for in this school?",
    points: 2,
    options: "",
    answer: "School of Disciples",
    rubric: "",
  },
  {
    type: "long_answer",
    prompt:
      "Explain why personal Bible study and church fellowship both matter for a new disciple.",
    points: 5,
    options: "",
    answer: "",
    rubric:
      "Expect: Scripture feeds faith; fellowship encourages, corrects, and sends; both shape obedience.",
  },
];

const HOLY_SPIRIT_DRILL: QuestionRow[] = [
  {
    type: "true_false",
    prompt: "The Holy Spirit is a Person, not an impersonal force.",
    points: 1,
    options: "",
    answer: "true",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Every believer is sealed with the Holy Spirit at conversion.",
    points: 1,
    options: "",
    answer: "true",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Spiritual gifts are given so believers can boast of their maturity.",
    points: 1,
    options: "",
    answer: "false",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "The fruit of the Spirit includes love, joy, and peace.",
    points: 1,
    options: "",
    answer: "true",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Speaking in tongues is the only evidence of being filled with the Spirit.",
    points: 1,
    options: "",
    answer: "false",
    rubric: "",
  },
  {
    type: "multiple_choice",
    prompt: "The Holy Spirit’s primary ministry toward Christ is to:",
    points: 1,
    options:
      "A) Replace Jesus | B) Glorify Jesus | C) Hide Scripture | D) Divide the church",
    answer: "B",
    rubric: "",
  },
  {
    type: "multiple_choice",
    prompt: "Which are works of the Spirit? (select all that apply)",
    points: 2,
    options:
      "A) Conviction of sin | B) Regeneration | C) Gossip | D) Empowering for witness",
    answer: "A,B,D",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "List two practical ways a disciple can stay sensitive to the Spirit.",
    points: 2,
    options: "",
    answer: "Prayer, Scripture, obedience, fellowship, repentance",
    rubric: "",
  },
  {
    type: "long_answer",
    prompt:
      "Describe how the baptism in the Holy Spirit equips a disciple for mission in their local church.",
    points: 5,
    options: "",
    answer: "",
    rubric:
      "Look for: boldness, gifts for edification, witness, dependence on God not personality.",
  },
];

const MIDCOURSE_EVALUATION: QuestionRow[] = [
  {
    type: "multiple_choice",
    prompt: "Discipleship means primarily:",
    points: 1,
    options:
      "A) Occasional church visits | B) Following Jesus in life and learning | C) Holding office | D) Debating doctrine only",
    answer: "B",
    rubric: "",
  },
  {
    type: "multiple_choice",
    prompt: "The Great Commission calls believers to:",
    points: 1,
    options:
      "A) Build buildings only | B) Make disciples of all nations | C) Avoid unbelievers | D) Study privately forever",
    answer: "B",
    rubric: "",
  },
  {
    type: "multiple_choice",
    prompt: "Healthy local church life includes: (select all that apply)",
    points: 2,
    options:
      "A) Worship | B) Word | C) Isolation | D) Fellowship and service",
    answer: "A,B,D",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Forgiveness is optional when another believer wrongs you.",
    points: 1,
    options: "",
    answer: "false",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Stewardship includes how we use time, gifts, and money.",
    points: 1,
    options: "",
    answer: "true",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Evangelism is only for ordained pastors.",
    points: 1,
    options: "",
    answer: "false",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "Name two habits that help a disciple grow steadily.",
    points: 2,
    options: "",
    answer: "Prayer, Bible reading, fellowship, witnessing, serving",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "What is one purpose of spiritual disciplines?",
    points: 2,
    options: "",
    answer: "To train the heart toward God / grow in Christlikeness",
    rubric: "",
  },
  {
    type: "long_answer",
    prompt:
      "A classmate struggles to share their faith at work. Outline a biblical, practical approach you would recommend.",
    points: 5,
    options: "",
    answer: "",
    rubric:
      "Expect: prayer, integrity, relationship, clear gospel, invite to church, trust the Spirit.",
  },
  {
    type: "long_answer",
    prompt:
      "How should a disciple respond when Scripture challenges a cultural habit they hold dear?",
    points: 5,
    options: "",
    answer: "",
    rubric:
      "Look for: Scripture authority, humility, repentance, community counsel, obedience over preference.",
  },
];

const OPEN_CANDIDATE_SCREEN: QuestionRow[] = [
  {
    type: "multiple_choice",
    prompt: "RCCG SOD in the UK exists mainly to:",
    points: 1,
    options:
      "A) Train disciples for Christian living and service | B) Replace Sunday service | C) Award secular degrees | D) Organise sports leagues",
    answer: "A",
    rubric: "",
  },
  {
    type: "multiple_choice",
    prompt: "A healthy candidate for discipleship training should be willing to:",
    points: 1,
    options:
      "A) Avoid accountability | B) Learn, obey, and serve | C) Argue only | D) Attend once",
    answer: "B",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Jesus is the only way to the Father.",
    points: 1,
    options: "",
    answer: "true",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Church community is optional for spiritual growth.",
    points: 1,
    options: "",
    answer: "false",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "In one sentence, why do you want to join School of Disciples?",
    points: 2,
    options: "",
    answer: "Desire to grow as a disciple / serve Christ and the church",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "Name your local assembly (or write “seeking a church”).",
    points: 1,
    options: "",
    answer: "",
    rubric: "",
  },
  {
    type: "long_answer",
    prompt:
      "Briefly share how you came to faith in Christ (or where you are on that journey).",
    points: 5,
    options: "",
    answer: "",
    rubric: "Look for clarity of gospel, honesty, openness to grow.",
  },
];

const GRADUATION_REFLECTION: QuestionRow[] = [
  {
    type: "multiple_choice",
    prompt: "A graduate disciple should primarily aim to:",
    points: 1,
    options:
      "A) Keep learning private | B) Multiply disciples and serve the church | C) Leave fellowship | D) Collect certificates only",
    answer: "B",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Graduation means the disciple no longer needs accountability.",
    points: 1,
    options: "",
    answer: "false",
    rubric: "",
  },
  {
    type: "true_false",
    prompt: "Teaching others is part of completing the discipleship cycle.",
    points: 1,
    options: "",
    answer: "true",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "List three areas where you have grown during SOD.",
    points: 3,
    options: "",
    answer: "Faith, character, service, Scripture, prayer, witness (any honest three)",
    rubric: "",
  },
  {
    type: "short_answer",
    prompt: "Name one ministry area you intend to serve in after graduation.",
    points: 2,
    options: "",
    answer: "Evangelism / children / worship / hospitality / mentoring (examples)",
    rubric: "",
  },
  {
    type: "long_answer",
    prompt:
      "Write a short testimony of how SOD has shaped your walk with Christ this session.",
    points: 5,
    options: "",
    answer: "",
    rubric: "Personal, Christ-centred, specific growth, gratitude, next steps.",
  },
  {
    type: "long_answer",
    prompt:
      "Propose a simple 90-day plan to mentor one younger believer in your parish.",
    points: 5,
    options: "",
    answer: "",
    rubric:
      "Expect: prayer, meeting rhythm, Scripture, accountability, church connection, measurable goals.",
  },
];

function examPack(
  partial: Omit<TemplatePack, "kind" | "rows"> & {
    examTitle: string;
    rows: QuestionRow[];
  },
): TemplatePack {
  const count = partial.rows.length;
  return {
    ...partial,
    kind: "exam",
    rows: partial.rows,
    tagline: partial.tagline || `${count} questions · ready to upload`,
    useWhen:
      partial.useWhen ||
      "Download, upload on Samples, then review and publish in Compose.",
  };
}

/** Complete test files — upload as-is to create a draft exam. */
export const FULL_EXAM_PACKS: TemplatePack[] = [
  examPack({
    id: "exam-foundation-xlsx",
    format: "xlsx",
    title: "Y1 Foundation of Faith",
    examTitle: "Y1 Foundation of Faith",
    filename: "SOD-Y1-Foundation-of-Faith.xlsx",
    tagline: "10 questions · mixed types · spreadsheet",
    useWhen: "Core doctrine paper for early-session students.",
    rows: FOUNDATION_OF_FAITH,
  }),
  examPack({
    id: "exam-foundation-json",
    format: "json",
    title: "Y1 Foundation of Faith (JSON)",
    examTitle: "Y1 Foundation of Faith",
    filename: "SOD-Y1-Foundation-of-Faith.json",
    tagline: "Same paper · JSON with title baked in",
    useWhen: "Same bank as the spreadsheet — ideal for a clean one-click import.",
    rows: FOUNDATION_OF_FAITH,
  }),
  examPack({
    id: "exam-spirit-xlsx",
    format: "xlsx",
    title: "Holy Spirit & Power drill",
    examTitle: "Holy Spirit & Power",
    filename: "SOD-Holy-Spirit-and-Power.xlsx",
    tagline: "9 questions · T/F heavy · spreadsheet",
    useWhen: "Quick module check after Spirit-focused teaching.",
    rows: HOLY_SPIRIT_DRILL,
  }),
  examPack({
    id: "exam-midcourse-xlsx",
    format: "xlsx",
    title: "Mid-course evaluation",
    examTitle: "SOD Mid-course Evaluation",
    filename: "SOD-Midcourse-Evaluation.xlsx",
    tagline: "10 questions · discipleship focus",
    useWhen: "Half-way assessment across Word, walk, and witness.",
    rows: MIDCOURSE_EVALUATION,
  }),
  examPack({
    id: "exam-midcourse-json",
    format: "json",
    title: "Mid-course evaluation (JSON)",
    examTitle: "SOD Mid-course Evaluation",
    filename: "SOD-Midcourse-Evaluation.json",
    tagline: "Same evaluation · JSON",
    useWhen: "Upload unchanged to spawn the mid-course draft.",
    rows: MIDCOURSE_EVALUATION,
  }),
  examPack({
    id: "exam-open-xlsx",
    format: "xlsx",
    title: "Open candidate screen",
    examTitle: "Open Candidate Screening",
    filename: "SOD-Open-Candidate-Screening.xlsx",
    tagline: "7 questions · short open-link style",
    useWhen: "For public / open-link exams before enrolment.",
    rows: OPEN_CANDIDATE_SCREEN,
  }),
  examPack({
    id: "exam-graduation-xlsx",
    format: "xlsx",
    title: "Graduation reflection",
    examTitle: "Graduation Reflection Paper",
    filename: "SOD-Graduation-Reflection.xlsx",
    tagline: "7 questions · testimony & next steps",
    useWhen: "End-of-session reflection before certificates.",
    rows: GRADUATION_REFLECTION,
  }),
  examPack({
    id: "exam-graduation-csv",
    format: "csv",
    title: "Graduation reflection (CSV)",
    examTitle: "Graduation Reflection Paper",
    filename: "SOD-Graduation-Reflection.csv",
    tagline: "Same reflection · CSV",
    useWhen: "Lightweight CSV of the graduation paper.",
    rows: GRADUATION_REFLECTION,
  }),
];

export const TEMPLATE_PACKS: TemplatePack[] = [
  {
    id: "xlsx-blank",
    format: "xlsx",
    title: "Spreadsheet ledger",
    tagline: "Blank workbook · Excel / Google Sheets",
    filename: "sod-exam-ledger-blank.xlsx",
    kind: "blank",
    useWhen: "Build a full paper in Sheets or Excel, then upload.",
  },
  {
    id: "xlsx-sample",
    format: "xlsx",
    title: "Pattern demo (5 questions)",
    tagline: "Filled workbook · study the pattern",
    filename: "sod-exam-pattern-demo.xlsx",
    kind: "sample",
    examTitle: "SOD pattern demo",
    rows: SAMPLE_QUESTION_ROWS,
    useWhen: "See every question type filled, then replace with your content.",
  },
  {
    id: "csv-blank",
    format: "csv",
    title: "CSV line sheet",
    tagline: "Blank · opens in any spreadsheet",
    filename: "sod-exam-questions-blank.csv",
    kind: "blank",
    useWhen: "Lightest format — one row per question.",
  },
  {
    id: "csv-sample",
    format: "csv",
    title: "CSV pattern demo",
    tagline: "Filled · same columns as blank",
    filename: "sod-exam-pattern-demo.csv",
    kind: "sample",
    examTitle: "SOD pattern demo",
    rows: SAMPLE_QUESTION_ROWS,
    useWhen: "Quick reference while you draft your own CSV.",
  },
  {
    id: "json-blank",
    format: "json",
    title: "JSON atlas",
    tagline: "Blank structure · power users",
    filename: "sod-exam-atlas-blank.json",
    kind: "blank",
    useWhen: "Scripted banks or editors that speak JSON.",
  },
  {
    id: "json-sample",
    format: "json",
    title: "JSON pattern demo",
    tagline: "Filled · includes title hint",
    filename: "sod-exam-pattern-demo.json",
    kind: "sample",
    examTitle: "SOD pattern demo",
    rows: SAMPLE_QUESTION_ROWS,
    useWhen: "Upload as-is to spawn a draft with five demo questions.",
  },
  {
    id: "txt-blank",
    format: "txt",
    title: "Plain verse kit",
    tagline: "Blank text blocks",
    filename: "sod-exam-verse-blank.txt",
    kind: "blank",
    useWhen: "Write questions in Notepad — no spreadsheet needed.",
  },
  {
    id: "txt-sample",
    format: "txt",
    title: "Plain verse demo",
    tagline: "Filled blocks · [mcq] [tf] [short] [long]",
    filename: "sod-exam-pattern-demo.txt",
    kind: "sample",
    examTitle: "SOD pattern demo",
    rows: SAMPLE_QUESTION_ROWS,
    useWhen: "Copy the block pattern for each new question.",
  },
];

const INSTRUCTIONS_SHEET: string[][] = [
  ["SOD exam question template"],
  [""],
  ["How to use"],
  ["1. Stay on the Questions sheet (or keep these column headers)."],
  ["2. Add one row per question. Do not rename the header row."],
  ["3. Save the file, then upload it on Admin → Exams → Samples."],
  ["4. The file is parsed into the question bank — it is never stored."],
  [""],
  ["Column guide"],
  ["type", "multiple_choice | true_false | short_answer | long_answer"],
  ["", "Aliases: mcq, tf, short, long, essay"],
  ["prompt", "The question text shown to the candidate"],
  ["points", "Marks for this question (e.g. 1, 2, 5)"],
  [
    "options",
    "MCQ only. Separate with |  e.g. A) One | B) Two | C) Three",
  ],
  [
    "answer",
    "MCQ: letter(s) e.g. B or A,C  ·  T/F: true/false  ·  short: model answer",
  ],
  ["rubric", "Long answers: grading notes for the Queue (optional)"],
  [""],
  ["Tips"],
  ["Multi-select MCQ: put several letters in answer, e.g. A,C,D"],
  ["Leave options empty for true_false, short_answer, and long_answer"],
  ["Ready-made tests on Samples can be uploaded unchanged as a full draft."],
];

function questionRowsOf(pack: TemplatePack): QuestionRow[] {
  if (pack.rows?.length) return pack.rows;
  if (pack.kind === "sample") return SAMPLE_QUESTION_ROWS;
  return [];
}

function rowsForPack(pack: TemplatePack): (string | number)[][] {
  const header = [...TEMPLATE_HEADERS];
  if (pack.kind === "blank") {
    return [
      header,
      ["multiple_choice", "", 1, "A)  | B)  | C)  | D) ", "", ""],
      ["true_false", "", 1, "", "true", ""],
      ["short_answer", "", 2, "", "", ""],
      ["long_answer", "", 5, "", "", ""],
    ];
  }
  return [
    header,
    ...questionRowsOf(pack).map((r) => TEMPLATE_HEADERS.map((h) => r[h] ?? "")),
  ];
}

function buildCsv(rows: (string | number)[][]): string {
  return rows
    .map((line) =>
      line
        .map((cell) => {
          const s = String(cell ?? "");
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\n");
}

function rowsToJsonQuestions(rows: QuestionRow[]) {
  return rows.map((r) => ({
    type: r.type,
    prompt: r.prompt,
    points: r.points,
    options: r.options || undefined,
    answer: r.answer || undefined,
    rubric: r.rubric || undefined,
  }));
}

function buildJson(pack: TemplatePack): string {
  if (pack.kind === "blank") {
    return `${JSON.stringify(
      {
        title: "Untitled SOD exam",
        questions: [
          {
            type: "multiple_choice",
            prompt: "",
            points: 1,
            options: "A)  | B)  | C)  | D) ",
            answer: "",
          },
          {
            type: "true_false",
            prompt: "",
            points: 1,
            answer: "true",
          },
          {
            type: "short_answer",
            prompt: "",
            points: 2,
            answer: "",
          },
          {
            type: "long_answer",
            prompt: "",
            points: 5,
            rubric: "",
          },
        ],
      },
      null,
      2,
    )}\n`;
  }

  const rows = questionRowsOf(pack);
  return `${JSON.stringify(
    {
      title: pack.examTitle || pack.title,
      questions: rowsToJsonQuestions(rows),
    },
    null,
    2,
  )}\n`;
}

function buildTxt(pack: TemplatePack): string {
  if (pack.kind === "blank") {
    return [
      "# SOD exam plain-text template",
      "# Separate questions with a blank line.",
      "# Start each block with [mcq], [tf], [short], or [long].",
      "",
      "[mcq] Your question here?",
      "A) Option one",
      "B) Option two",
      "C) Option three",
      "Answer: A",
      "",
      "[tf] A true or false statement.",
      "Answer: true",
      "",
      "[short] A short written answer?",
      "Answer: model answer for graders",
      "",
      "[long] An essay-style prompt.",
      "Answer: rubric notes for the Queue",
      "",
    ].join("\n");
  }

  const lines: string[] = [];
  for (const r of questionRowsOf(pack)) {
    const type = String(r.type);
    if (type === "multiple_choice") {
      lines.push(`[mcq] ${r.prompt}`);
      const opts = String(r.options || "")
        .split(/\s*\|\s*/)
        .map((o) => o.trim())
        .filter(Boolean);
      for (const o of opts) lines.push(o);
      lines.push(`Answer: ${r.answer}`);
    } else if (type === "true_false") {
      lines.push(`[tf] ${r.prompt}`);
      lines.push(`Answer: ${r.answer}`);
    } else if (type === "short_answer") {
      lines.push(`[short] ${r.prompt}`);
      lines.push(`Answer: ${r.answer}`);
    } else {
      lines.push(`[long] ${r.prompt}`);
      lines.push(`Answer: ${r.rubric || r.answer}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildXlsx(pack: TemplatePack): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const guideRows = [...INSTRUCTIONS_SHEET];
  if (pack.examTitle) {
    guideRows.splice(1, 0, ["Paper title", pack.examTitle]);
  }
  const guide = XLSX.utils.aoa_to_sheet(guideRows);
  guide["!cols"] = [{ wch: 14 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(wb, guide, "Instructions");

  const questionRows = rowsForPack(pack);
  const questions = XLSX.utils.aoa_to_sheet(questionRows);
  questions["!cols"] = [
    { wch: 16 },
    { wch: 52 },
    { wch: 8 },
    { wch: 44 },
    { wch: 18 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, questions, "Questions");

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

export function buildTemplateBlob(pack: TemplatePack): Blob {
  if (pack.format === "xlsx") {
    return new Blob([buildXlsx(pack)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  if (pack.format === "csv") {
    return new Blob([buildCsv(rowsForPack(pack))], {
      type: "text/csv;charset=utf-8",
    });
  }
  if (pack.format === "json") {
    return new Blob([buildJson(pack)], {
      type: "application/json;charset=utf-8",
    });
  }
  return new Blob([buildTxt(pack)], { type: "text/plain;charset=utf-8" });
}

export function downloadTemplatePack(pack: TemplatePack) {
  const blob = buildTemplateBlob(pack);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pack.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function suggestedTitleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "Imported exam";
  return base.replace(/\bsod\b/gi, "SOD").slice(0, 120);
}
