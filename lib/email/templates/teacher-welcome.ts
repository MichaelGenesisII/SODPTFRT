export type TeacherWelcomeInput = {
  fullName: string;
  email: string;
  temporaryPassword: string;
  inviterName: string;
  teacherLoginUrl: string;
  portalSupportUrl: string;
  siteUrl: string;
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
  return "colleague";
}

/** Welcome for a newly invited Teacher (separate from admin desks). */
export function buildTeacherWelcomeEmail(input: TeacherWelcomeInput) {
  const firstName = firstNameFrom(input.fullName, input.email);
  const name = escapeHtml(firstName);
  const displayName = escapeHtml(input.fullName.trim() || firstName);
  const email = escapeHtml(input.email.trim());
  const password = escapeHtml(input.temporaryPassword);
  const inviter = escapeHtml(input.inviterName.trim() || "the national desk");
  const loginUrl = escapeHtml(input.teacherLoginUrl);
  const supportUrl = escapeHtml(input.portalSupportUrl);
  const siteUrl = escapeHtml(input.siteUrl);
  const year = new Date().getFullYear();

  const subject = "Your School of Disciples teacher portal access";

  const text = [
    `Hello ${firstName},`,
    "",
    `${input.inviterName.trim() || "The national desk"} has invited you to the School of Disciples teacher portal.`,
    "",
    "Sign in:",
    input.teacherLoginUrl,
    "",
    `Email: ${input.email.trim()}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "Please change your password after your first sign-in.",
    "You will only see classes assigned to you.",
    "",
    `Questions: ${input.portalSupportUrl}`,
    "",
    `School of Disciples · ${input.siteUrl}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#e8efe9;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8efe9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #d5ddd6;">
        <tr><td style="padding:28px 28px 8px;background:#14352c;">
          <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#95bfa8;">Teacher portal</p>
          <h1 style="margin:12px 0 0;font-size:26px;line-height:1.15;color:#f4f7f5;font-weight:normal;">Welcome, ${name}</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55;">${displayName}, you have been invited by ${inviter} to teach on the School of Disciples portal.</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3d4a43;">You will see only the classes assigned to you — schedule, register, and confirm when you have taught.</p>
          <table role="presentation" width="100%" style="background:#f4f7f5;border:1px solid #d5ddd6;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#5f8f7a;">Sign-in details</p>
              <p style="margin:0 0 6px;font-size:14px;"><strong>Email</strong><br />${email}</p>
              <p style="margin:0;font-size:14px;"><strong>Temporary password</strong><br /><span style="font-family:ui-monospace,monospace;">${password}</span></p>
            </td></tr>
          </table>
          <p style="margin:22px 0 0;">
            <a href="${loginUrl}" style="display:inline-block;background:#14352c;color:#f4f7f5;text-decoration:none;padding:12px 20px;font-size:14px;">Open teacher sign-in</a>
          </p>
          <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#5a655e;">Change your password after first sign-in. Need help? Use <a href="${supportUrl}" style="color:#14352c;">portal support</a>.</p>
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #e4ebe5;font-size:12px;color:#7a857e;">
          <a href="${siteUrl}" style="color:#5f8f7a;text-decoration:none;">School of Disciples</a> · ${year}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
