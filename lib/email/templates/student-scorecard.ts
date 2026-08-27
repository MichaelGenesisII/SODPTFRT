export type ScorecardSessionRow = {
  date: string;
  label: string;
  present: boolean;
};

export type ScorecardEntryRow = {
  label: string;
  percent: number;
  passed: boolean;
  includeInTotal: boolean;
  source: string;
};

export type StudentScorecardTemplateInput = {
  studentName: string;
  studentEmail: string;
  reference?: string;
  parishName?: string;
  batchName?: string;
  batchYear?: number | null;
  enrolledAtLabel: string;
  completedAtLabel: string;
  attendancePercent: number | null;
  examAveragePercent: number | null;
  sessions: ScorecardSessionRow[];
  entries: ScorecardEntryRow[];
  issuedAtLabel: string;
  issuedByName: string;
  portalRecordsUrl: string;
  portalCertificatesUrl?: string;
  /** Signed HTTPS URL for passport photo on the certificate. */
  passportImageUrl?: string;
  /** Signed download URL for the course certificate file (optional). */
  certificateDownloadUrl?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const n = Math.round(value * 10) / 10;
  return `${n}%`;
}

function formatDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Formal scorecard — certificate-style document for email. */
export function buildStudentScorecardEmail(input: StudentScorecardTemplateInput) {
  const rawName = input.studentName.trim() || "Student";
  const name = escapeHtml(rawName);
  const email = escapeHtml(input.studentEmail.trim());
  const reference = escapeHtml(input.reference?.trim() || "SOD");
  const parish = escapeHtml(input.parishName?.trim() || "—");
  const batchParts = [
    input.batchName?.trim(),
    input.batchYear != null ? String(input.batchYear) : null,
  ].filter(Boolean);
  const batch = escapeHtml(batchParts.join(" · ") || "—");
  const issuedBy = escapeHtml(input.issuedByName.trim() || "School of Disciples");
  const issuedAt = escapeHtml(input.issuedAtLabel);
  const enrolledAt = escapeHtml(input.enrolledAtLabel.trim() || "—");
  const completedAt = escapeHtml(input.completedAtLabel.trim() || "In progress");
  const portalUrl = escapeHtml(input.portalRecordsUrl);
  const certificatesPortalUrl = input.portalCertificatesUrl?.trim()
    ? escapeHtml(input.portalCertificatesUrl.trim())
    : "";
  const certificateDownloadUrl = input.certificateDownloadUrl?.trim()
    ? escapeHtml(input.certificateDownloadUrl.trim())
    : "";
  const passportUrl = input.passportImageUrl?.trim()
    ? escapeHtml(input.passportImageUrl.trim())
    : "";
  const year = new Date().getFullYear();
  const attendance = formatPercent(input.attendancePercent);
  const examAvg = formatPercent(input.examAveragePercent);
  const initials = escapeHtml(
    rawName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "S",
  );

  const subject = `Your School of Disciples scorecard · ${rawName}`;

  const sessionLines =
    input.sessions.length === 0
      ? ["  (No attendance sessions recorded yet)"]
      : input.sessions.map(
          (s) =>
            `  ${s.present ? "Present" : "Absent"} · ${s.date}${s.label ? ` · ${s.label}` : ""}`,
        );

  const entryLines =
    input.entries.length === 0
      ? ["  (No exam scores recorded yet)"]
      : input.entries.map(
          (e) =>
            `  ${e.label}: ${e.percent}%${e.passed ? " (pass)" : ""}${e.includeInTotal ? "" : " · excluded from average"}`,
        );

  const text = [
    `School of Disciples — Official Scorecard`,
    ``,
    `Dear ${rawName},`,
    ``,
    `Please find your course scorecard below.`,
    ``,
    `Student: ${rawName}`,
    `Email: ${input.studentEmail.trim()}`,
    `Reference: ${input.reference?.trim() || "SOD"}`,
    `Parish: ${input.parishName?.trim() || "—"}`,
    `Batch: ${batchParts.join(" · ") || "—"}`,
    `Date enrolled: ${input.enrolledAtLabel}`,
    `Date completed: ${input.completedAtLabel}`,
    `Issued: ${input.issuedAtLabel}`,
    `Issued by: ${input.issuedByName.trim() || "School of Disciples"}`,
    ``,
    `Summary`,
    `  Attendance: ${attendance}`,
    `  Exam average (included scores): ${examAvg}`,
    ``,
    `Attendance sessions`,
    ...sessionLines,
    ``,
    `Exam scores`,
    ...entryLines,
    ``,
    `View your live scorecard: ${input.portalRecordsUrl}`,
    ...(input.certificateDownloadUrl?.trim()
      ? [
          `Download your course certificate: ${input.certificateDownloadUrl.trim()}`,
          ...(input.portalCertificatesUrl?.trim()
            ? [
                `Or open Certificates in the portal: ${input.portalCertificatesUrl.trim()}`,
              ]
            : []),
        ]
      : []),
    ``,
    `This is a NoReply message.`,
    `schoolofdisciples.org`,
  ].join("\n");

  const presentCount = input.sessions.filter((s) => s.present).length;
  const sessionCount = input.sessions.length;

  const sessionRowsHtml =
    input.sessions.length === 0
      ? `<tr>
          <td colspan="2" style="padding:18px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-style:italic;color:#7a857e;text-align:center;">
            No sessions recorded yet
          </td>
        </tr>`
      : input.sessions
          .map((s, i) => {
            const top = i === 0 ? "border-top:1px solid #e4ebe6;" : "";
            return `<tr>
              <td style="padding:12px 0;${top}border-bottom:1px solid #e4ebe6;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.35;color:#1a2e28;">
                ${escapeHtml(s.label || "Session")}
                <span style="display:block;margin-top:3px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7a857e;">${escapeHtml(formatDateLabel(s.date))}</span>
              </td>
              <td align="right" valign="middle" style="padding:12px 0;${top}border-bottom:1px solid #e4ebe6;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${s.present ? "#2d6a4f" : "#9a6b6b"};">
                ${s.present ? "Present" : "Absent"}
              </td>
            </tr>`;
          })
          .join("");

  const entryRowsHtml =
    input.entries.length === 0
      ? `<tr>
          <td colspan="2" style="padding:18px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-style:italic;color:#7a857e;text-align:center;">
            No assessments recorded yet
          </td>
        </tr>`
      : input.entries
          .map((e, i) => {
            const top = i === 0 ? "border-top:1px solid #e4ebe6;" : "";
            const note = e.includeInTotal
              ? e.passed
                ? "Pass"
                : "Below pass mark"
              : "Recorded · not in average";
            const noteColor = e.includeInTotal
              ? e.passed
                ? "#2d6a4f"
                : "#9a6b6b"
              : "#7a857e";
            return `<tr>
              <td style="padding:14px 0;${top}border-bottom:1px solid #e4ebe6;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.35;color:#1a2e28;">
                ${escapeHtml(e.label)}
                <span style="display:block;margin-top:3px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${noteColor};">${note}</span>
              </td>
              <td align="right" valign="middle" style="padding:14px 0;${top}border-bottom:1px solid #e4ebe6;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:-0.02em;color:#14352c;">
                ${e.percent}<span style="font-size:14px;color:#7a857e;">%</span>
              </td>
            </tr>`;
          })
          .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#dfe8e2;color:#1a2e28;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dfe8e2;padding:36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <!-- Outer certificate frame -->
          <tr>
            <td style="background:#14352c;padding:10px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #c5a35a;">
                <tr>
                  <td style="padding:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8d9b0;">
                      <tr>
                        <td style="padding:36px 36px 28px;text-align:center;">

                          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#8a7350;font-weight:600;">
                            School of Disciples
                          </p>
                          <p style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#7a857e;">
                            Raising Disciples, Equipping The Local Church
                          </p>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px auto 0;max-width:180px;">
                            <tr>
                              <td style="border-top:1px solid #c5a35a;font-size:0;line-height:0;height:1px;">&nbsp;</td>
                            </tr>
                          </table>

                          <p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#5f8f7a;font-weight:700;">
                            Official Scorecard
                          </p>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px auto 0;max-width:460px;">
                            <tr>
                              <td width="112" valign="top" style="padding-right:18px;">
                                ${
                                  passportUrl
                                    ? `<img src="${passportUrl}" alt="Passport photograph" width="96" height="120" style="display:block;width:96px;height:120px;object-fit:cover;border:1px solid #c5a35a;background:#f4f7f5;" />`
                                    : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:96px;height:120px;border:1px solid #c5a35a;background:#f4f7f5;">
                                  <tr>
                                    <td align="center" valign="middle" style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.06em;color:#8a7350;">
                                      ${initials}
                                    </td>
                                  </tr>
                                </table>`
                                }
                                <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#8a7350;text-align:center;">
                                  Passport
                                </p>
                              </td>
                              <td valign="middle" align="left" style="text-align:left;">
                                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;letter-spacing:-0.02em;color:#14352c;">
                                  ${name}
                                </p>
                                <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7a857e;">
                                  ${email}
                                </p>
                                <p style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.45;color:#3d4f47;">
                                  ${parish}<span style="color:#c5a35a;"> &nbsp;·&nbsp; </span>${batch}
                                </p>
                                <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.08em;color:#8a7350;">
                                  Ref. ${reference}
                                </p>
                              </td>
                            </tr>
                          </table>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px auto 0;max-width:420px;">
                            <tr>
                              <td width="50%" align="center" style="padding:0 8px;">
                                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#7a857e;">
                                  Date enrolled
                                </p>
                                <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#14352c;">
                                  ${enrolledAt}
                                </p>
                              </td>
                              <td width="50%" align="center" style="padding:0 8px;border-left:1px solid #e4ebe6;">
                                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#7a857e;">
                                  Date completed
                                </p>
                                <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#14352c;">
                                  ${completedAt}
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Summary figures -->
                      <tr>
                        <td style="padding:0 36px 8px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;border:1px solid #e4ebe6;">
                            <tr>
                              <td width="50%" align="center" style="padding:22px 12px;border-right:1px solid #e4ebe6;">
                                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#7a857e;">
                                  Attendance
                                </p>
                                <p style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1;letter-spacing:-0.03em;color:#14352c;">
                                  ${attendance}
                                </p>
                                <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#7a857e;">
                                  ${sessionCount ? `${presentCount} of ${sessionCount} sessions` : "No sessions yet"}
                                </p>
                              </td>
                              <td width="50%" align="center" style="padding:22px 12px;">
                                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#7a857e;">
                                  Exam average
                                </p>
                                <p style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1;letter-spacing:-0.03em;color:#14352c;">
                                  ${examAvg}
                                </p>
                                <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#7a857e;">
                                  Scores counted in total
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Attendance -->
                      <tr>
                        <td style="padding:28px 36px 8px;">
                          <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8a7350;font-weight:700;">
                            Attendance register
                          </p>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            ${sessionRowsHtml}
                          </table>
                        </td>
                      </tr>

                      <!-- Assessments -->
                      <tr>
                        <td style="padding:24px 36px 8px;">
                          <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8a7350;font-weight:700;">
                            Assessment record
                          </p>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            ${entryRowsHtml}
                          </table>
                        </td>
                      </tr>

                      <!-- Signature / seal -->
                      <tr>
                        <td style="padding:32px 36px 36px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td width="55%" valign="bottom" style="padding-right:16px;">
                                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#7a857e;">
                                  Issued
                                </p>
                                <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#14352c;">
                                  ${issuedAt}
                                </p>
                                <p style="margin:16px 0 0;border-top:1px solid #c5a35a;padding-top:10px;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-style:italic;color:#14352c;">
                                  ${issuedBy}
                                </p>
                                <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#7a857e;">
                                  On behalf of School of Disciples
                                </p>
                              </td>
                              <td width="45%" valign="bottom" align="right">
                                <table role="presentation" cellpadding="0" cellspacing="0" align="right" style="border:1px solid #c5a35a;">
                                  <tr>
                                    <td align="center" style="padding:14px 16px;background:#faf8f2;">
                                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:#8a7350;">
                                        Verified
                                      </p>
                                      <p style="margin:6px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#14352c;">
                                        Records desk
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>

                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                            <tr>
                              <td align="center">
                                <a href="${portalUrl}" style="display:inline-block;padding:12px 22px;background:#14352c;color:#f4f7f5;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;">
                                  View in student portal
                                </a>
                              </td>
                            </tr>
                            ${
                              certificateDownloadUrl
                                ? `<tr>
                              <td align="center" style="padding-top:14px;">
                                <a href="${certificateDownloadUrl}" style="display:inline-block;padding:12px 22px;background:#c5a35a;color:#14352c;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;">
                                  Download certificate
                                </a>
                                ${
                                  certificatesPortalUrl
                                    ? `<p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7a857e;">
                                  Or open <a href="${certificatesPortalUrl}" style="color:#14352c;text-decoration:underline;">Certificates</a> in the portal
                                </p>`
                                    : ""
                                }
                              </td>
                            </tr>`
                                : ""
                            }
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 8px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7870;">
              This is an automated NoReply message from School of Disciples.<br />
              Belfast · schoolofdisciples.org · © ${year}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
