export type OverviewStats = {
  deskLabel: string;
  parishName: string | null;
  national: boolean;
  generatedAtLabel: string;

  /** Sum of items that need a human decision soon. */
  attentionTotal: number;
  openTickets: number;
  unsettledTickets: number;
  pendingPayments: number;
  examsNeedingGrade: number;
  applicationsInReview: number;

  students: number;
  studentsActive: number;
  studentsPaused: number;
  paidSeats: number;
  unpaidSeats: number;
  paymentPendingSeats: number;
  newEnrolments7d: number;
  newEnrolments30d: number;
  enrolmentByStatus: {
    submitted: number;
    under_review: number;
    accepted: number;
    payment_pending: number;
    paid: number;
    rejected: number;
  };

  publishedExams: number;
  draftExams: number;
  attemptsInProgress: number;
  classesUpcoming: number;
  classesLive: number;
  scorecards: number;
  recordsWithAttendance: number;

  activeParishes: number;
  openBatches: number;
  activeAdmins: number;
  liveNotices: number;
};

export type StatementReportRow = {
  student_name: string;
  email: string;
  reference: string | null;
  parish_name: string | null;
  batch_label: string | null;
  enrolled_on: string | null;
  enrolment_status: string;
  payment_status: string;
  tuition_paid: boolean;
  /** Enrolment / application evidence on the live desk. */
  application_proof: "On file" | "No reference";
  /** Attendance marks from Records. */
  attendance_proof: "On file" | "Not marked";
  attendance_percent: number | null;
  sessions_present: number;
  sessions_total: number;
};

export type StatementReportSummary = {
  total: number;
  applicationOnFile: number;
  attendanceOnFile: number;
  attendanceNotMarked: number;
  averageAttendancePercent: number | null;
};

export type StatementReportBundle = {
  title: string;
  subtitle: string;
  purpose: string;
  issuedAtLabel: string;
  issuedBy: string;
  scopeLabel: string;
  filterLabel: string;
  summary: StatementReportSummary;
  rows: StatementReportRow[];
};
