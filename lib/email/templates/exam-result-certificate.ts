export type ExamResultCertificateInput = {
  candidateName: string;
  candidateEmail: string;
  examTitle: string;
  percent: number;
  passPercent: number;
  passed: boolean;
  totalScore: number;
  maxScore: number;
  submittedAtLabel: string;
  issuedAtLabel: string;
  church?: string;
  /** Public portal /support — open candidates are not signed-in students. */
  portalSupportUrl: string;
  /** Main public website (schoolofdisciples.org). */
  siteUrl: string;
  /** Link back to the open exam result page. */
  examUrl?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function firstNameFrom(fullName: string, email: string): string {
  const fromName = fullName.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = email.split("@")[0]?.trim();
  if (local) {
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "friend";
}

/**
 * Open-link / visitor assessment result.
 * Not used for enrolled student Records scorecards (see student-scorecard).
 */
export function buildExamResultCertificateEmail(
  input: ExamResultCertificateInput,
) {
  const nameRaw = input.candidateName.trim() || "Candidate";
  const firstName = firstNameFrom(nameRaw, input.candidateEmail);
  const name = escapeHtml(nameRaw);
  const greet = escapeHtml(firstName);
  const email = escapeHtml(input.candidateEmail.trim());
  const title = escapeHtml(input.examTitle.trim() || "Assessment");
  const church = escapeHtml(input.church?.trim() || "");
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const examUrl = input.examUrl?.trim()
    ? escapeHtml(input.examUrl.trim())
    : "";
  const percent = Math.round(input.percent * 10) / 10;
  const passMark = Math.round(input.passPercent * 10) / 10;
  const year = new Date().getFullYear();
  const passed = input.passed;

  const outcomeLabel = passed ? "Pass" : "Below pass mark";
  const outcomeNote = passed
    ? "Well done — you met the pass mark for this open assessment."
    : "You can keep learning and try again when the assessment is open to you.";
  const ink = passed ? "#0f2a22" : "#3a2c24";
  const soft = passed ? "#8fb8a3" : "#c4a890";
  const bg = passed ? "#dde8e1" : "#ebe4de";
  const panel = passed ? "#f4f7f5" : "#faf6f2";

  const subject = passed
    ? `${firstName}, your result — ${input.examTitle.trim()} · ${percent}%`
    : `${firstName}, your result — ${input.examTitle.trim()}`;

  const text = [
    `Dear ${firstName},`,
    ``,
    `Thank you for sitting this School of Disciples open assessment.`,
    ``,
    `Assessment: ${input.examTitle}`,
    `Score: ${percent}% (${input.totalScore} / ${input.maxScore})`,
    `Pass mark: ${passMark}%`,
    `Outcome: ${outcomeLabel}`,
    `Submitted: ${input.submittedAtLabel}`,
    `Issued: ${input.issuedAtLabel}`,
    input.church?.trim() ? `Church / parish: ${input.church.trim()}` : "",
    ``,
    outcomeNote,
    ``,
    input.examUrl?.trim() ? `View your result: ${input.examUrl.trim()}` : "",
    `Questions: ${input.portalSupportUrl}`,
    ``,
    `School of Disciples · Belfast`,
    ``,
    `This is an automated message. Please do not reply to this email.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${bg};color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <tr>
            <td style="padding:0 4px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${soft};font-weight:700;">
                    School of Disciples
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(20,36,28,0.4);">
                    Open assessment
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:${ink};padding:28px 26px;color:#f4f7f5;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${soft};">
                Your result
              </p>
              <p style="margin:12px 0 0;font-size:30px;line-height:1.08;letter-spacing:-0.03em;">
                ${greet},
              </p>
              <p style="margin:8px 0 0;font-size:20px;line-height:1.25;color:${passed ? "#c5e0d2" : "#e0d2b8"};">
                ${passed ? "you have a result to keep." : "here is your sitting result."}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:${soft};height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="background:${panel};padding:24px 26px 8px;border-left:1px solid #c8d4ce;border-right:1px solid #c8d4ce;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(20,36,28,0.45);">
                This certifies that
              </p>
              <p style="margin:8px 0 0;font-size:24px;line-height:1.2;color:${ink};">
                ${name}
              </p>
              <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:rgba(20,36,28,0.55);">
                ${email}${church ? ` · ${church}` : ""}
              </p>
              <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(20,36,28,0.45);">
                completed the open assessment
              </p>
              <p style="margin:8px 0 0;font-size:20px;line-height:1.3;color:${ink};">
                ${title}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:18px 26px;border-left:1px solid #c8d4ce;border-right:1px solid #c8d4ce;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${panel};border:1px solid #d5ddd8;">
                <tr>
                  <td width="50%" align="center" style="padding:20px 12px;border-right:1px solid #d5ddd8;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(20,36,28,0.45);">
                      Final score
                    </p>
                    <p style="margin:10px 0 0;font-size:36px;line-height:1;letter-spacing:-0.03em;color:${ink};">
                      ${percent}%
                    </p>
                    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:rgba(20,36,28,0.5);">
                      ${input.totalScore} / ${input.maxScore} points
                    </p>
                  </td>
                  <td width="50%" align="center" style="padding:20px 12px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(20,36,28,0.45);">
                      Outcome
                    </p>
                    <p style="margin:10px 0 0;font-size:22px;line-height:1.15;color:${passed ? "#2d6a4f" : "#8a5a3a"};">
                      ${outcomeLabel}
                    </p>
                    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:rgba(20,36,28,0.5);">
                      Pass mark ${passMark}%
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:rgba(20,36,28,0.72);">
                ${escapeHtml(outcomeNote)}
              </p>
              <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:rgba(20,36,28,0.5);">
                Submitted ${escapeHtml(input.submittedAtLabel)} · Issued ${escapeHtml(input.issuedAtLabel)}
              </p>
              ${
                examUrl
                  ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
                <tr>
                  <td style="background:${ink};">
                    <a href="${examUrl}" style="display:inline-block;padding:13px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#f4f7f5;text-decoration:none;">
                      View result online →
                    </a>
                  </td>
                </tr>
              </table>`
                  : ""
              }
            </td>
          </tr>

          <tr>
            <td style="background:${panel};padding:16px 26px 22px;border:1px solid #c8d4ce;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:rgba(20,36,28,0.62);">
              This email is for an <strong style="color:${ink};">open assessment</strong> sitting (shared link). It is separate from the enrolled student Records scorecard.
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              Questions?
              <a href="${supportUrl}" style="color:inherit;text-decoration:underline;">Open Support</a><br /><br />
              Automated result notice — please do not reply.<br />
              Belfast ·
              <a href="${siteUrl}" style="color:inherit;text-decoration:underline;">schoolofdisciples.org</a>
              · © ${year}
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
