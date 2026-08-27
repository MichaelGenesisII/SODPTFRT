export type AdminDeskKind = "national" | "parish";

export type AdminWelcomeInput = {
  fullName: string;
  email: string;
  temporaryPassword: string;
  deskScopeLabel: string;
  inviterName: string;
  adminLoginUrl: string;
  /** Public portal support page — not a mailbox. */
  portalSupportUrl: string;
  /** Main public website (schoolofdisciples.org). */
  siteUrl: string;
  /** Prefer explicit kind; otherwise inferred from deskScopeLabel. */
  deskKind?: AdminDeskKind;
  /** Parish name when inviting to a parish desk. */
  parishName?: string;
  /** Inviter’s desk — softens parish-to-parish vs network invites. */
  inviterDeskKind?: AdminDeskKind;
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

function resolveDeskKind(
  deskKind: AdminDeskKind | undefined,
  deskScopeLabel: string,
): AdminDeskKind {
  if (deskKind === "parish" || deskKind === "national") return deskKind;
  // Never surface a “master” desk — treat all non-parish labels as national.
  if (/^parish desk/i.test(deskScopeLabel.trim())) return "parish";
  return "national";
}

function roleTitle(kind: AdminDeskKind): string {
  return kind === "parish" ? "Parish Admin" : "National Admin";
}

function parishFromScope(deskScopeLabel: string, parishName?: string): string {
  const explicit = parishName?.trim();
  if (explicit) return explicit;
  const match = deskScopeLabel.match(/^Parish desk\s*[—–\-·]\s*(.+)$/i);
  return match?.[1]?.trim() || "";
}

/** Congratulatory welcome for a newly invited National or Parish Admin. */
export function buildAdminWelcomeEmail(input: AdminWelcomeInput) {
  const firstName = firstNameFrom(input.fullName, input.email);
  const name = escapeHtml(firstName);
  const displayName = escapeHtml(input.fullName.trim() || firstName);
  const email = escapeHtml(input.email.trim());
  const password = escapeHtml(input.temporaryPassword);
  const kind = resolveDeskKind(input.deskKind, input.deskScopeLabel);
  const role = roleTitle(kind);
  const roleSafe = escapeHtml(role);
  const parish = parishFromScope(input.deskScopeLabel, input.parishName);
  const parishSafe = escapeHtml(parish);
  const scopeLabel =
    input.deskScopeLabel.trim() ||
    (kind === "parish"
      ? parish
        ? `Parish desk — ${parish}`
        : "Parish desk"
      : "National desk — all UK parishes");
  const scope = escapeHtml(scopeLabel);
  const inviter = escapeHtml(input.inviterName.trim() || "A colleague");
  const inviterRaw = input.inviterName.trim() || "A colleague";
  const loginUrl = escapeHtml(input.adminLoginUrl.trim());
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();
  const peerParishInvite =
    kind === "parish" && input.inviterDeskKind === "parish";

  const inviteLineText = peerParishInvite
    ? `${inviterRaw} has invited you to join them at the parish desk${parish ? ` for ${parish}` : ""}.`
    : kind === "parish"
      ? `${inviterRaw} has invited you to help care for students${parish ? ` at ${parish}` : " at your parish desk"}.`
      : `${inviterRaw} has invited you to join the national desk, supporting parishes across the UK.`;

  const inviteLineHtml = peerParishInvite
    ? `<strong style="color:#f4f7f5;">${inviter}</strong> has invited you to join them at the parish desk${parishSafe ? ` for <strong style="color:#c5e0d2;">${parishSafe}</strong>` : ""}.`
    : kind === "parish"
      ? `<strong style="color:#f4f7f5;">${inviter}</strong> has invited you to help care for students${parishSafe ? ` at <strong style="color:#c5e0d2;">${parishSafe}</strong>` : " at your parish desk"}.`
      : `<strong style="color:#f4f7f5;">${inviter}</strong> has invited you to join the national desk, supporting parishes across the UK.`;

  const roleBlurb =
    kind === "parish"
      ? parish
        ? `As a Parish Admin you will help with enrolments, batches, notices, and the Listening Desk for ${parish}.`
        : "As a Parish Admin you will help with enrolments, batches, notices, and the Listening Desk for your parish."
      : "As a National Admin you will help coordinate enrolments, batches, notices, and the Listening Desk across UK parishes.";

  const subject = peerParishInvite
    ? `${firstName}, you are invited to the parish desk${parish ? ` — ${parish}` : ""}`
    : `${firstName}, welcome to the ${role} desk`;

  const text = [
    `Dear ${firstName},`,
    ``,
    `Welcome to the School of Disciples admin portal.`,
    ``,
    inviteLineText,
    ``,
    `Your place: ${role}`,
    `Your desk: ${scopeLabel}`,
    ``,
    roleBlurb,
    ``,
    `Sign in with:`,
    `Email: ${input.email}`,
    `Temporary password: ${input.temporaryPassword}`,
    `Admin login: ${input.adminLoginUrl}`,
    ``,
    `Please change your temporary password after your first sign-in (Access → Password).`,
    ``,
    `Questions: ${input.portalSupportUrl}`,
    ``,
    `With warmth,`,
    `School of Disciples`,
    `Belfast`,
    ``,
    `This is an automated message. Please do not reply to this email.`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${kind === "parish" ? "#e4ebe6" : "#dde6e8"};color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${kind === "parish" ? "#e4ebe6" : "#dde6e8"};padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <tr>
            <td style="padding:0 4px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${kind === "parish" ? "#3d6b58" : "#3d5f6b"};font-weight:700;">
                    School of Disciples
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(20,36,28,0.4);">
                    Desk invitation
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:${kind === "parish" ? "#0f2a22" : "#1a2f38"};padding:30px 26px;color:#f4f7f5;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${kind === "parish" ? "#8fb8a3" : "#7eb0c0"};">
                ${roleSafe}
              </p>
              <p style="margin:14px 0 0;font-size:34px;line-height:1.05;letter-spacing:-0.03em;">
                Welcome, ${name}.
              </p>
              <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(244,247,245,0.82);">
                ${inviteLineHtml}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:${kind === "parish" ? "#95bfa8" : "#7eb0c0"};height:5px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:24px 26px 8px;border-left:1px solid #c8d4ce;border-right:1px solid #c8d4ce;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;border-left:3px solid ${kind === "parish" ? "#0f2a22" : "#1a2f38"};">
                <tr>
                  <td style="padding:18px 18px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${kind === "parish" ? "#3d6b58" : "#3d5f6b"};font-weight:700;">
                      Your place
                    </p>
                    <p style="margin:8px 0 0;font-size:22px;letter-spacing:-0.02em;color:#14241c;">
                      ${roleSafe}
                    </p>
                    <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:rgba(20,36,28,0.72);">
                      ${escapeHtml(roleBlurb)}
                    </p>
                    <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${kind === "parish" ? "#3d6b58" : "#3d5f6b"};font-weight:700;">
                      Desk
                    </p>
                    <p style="margin:6px 0 0;font-size:16px;color:#14241c;">
                      ${scope}
                    </p>
                    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:rgba(20,36,28,0.55);">
                      Signed in as <strong style="color:#14241c;">${displayName}</strong>
                      ${peerParishInvite ? ` · invited by ${inviter}` : ""}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:22px 26px 8px;border-left:1px solid #c8d4ce;border-right:1px solid #c8d4ce;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(20,36,28,0.78);">
              <p style="margin:0;">
                Change your temporary password as soon as you sign in (Access → Password). Then explore the desk at your own pace.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:16px 26px 28px;border:1px solid #c8d4ce;border-top:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${kind === "parish" ? "#0f2a22" : "#1a2f38"};">
                <tr>
                  <td style="padding:20px 20px 8px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${kind === "parish" ? "#8fb8a3" : "#7eb0c0"};font-weight:700;">
                      Temporary login
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 20px 4px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(244,247,245,0.45);">
                      Email
                    </p>
                    <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#f4f7f5;">
                      ${email}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px 20px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(244,247,245,0.45);">
                      Temporary password
                    </p>
                    <p style="margin:6px 0 0;font-family:ui-monospace,Consolas,monospace;font-size:17px;letter-spacing:0.06em;color:${kind === "parish" ? "#c5e0d2" : "#a8d0dc"};">
                      ${password}
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;">
                <tr>
                  <td style="background:${kind === "parish" ? "#0f2a22" : "#1a2f38"};">
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#f4f7f5;text-decoration:none;">
                      Open the admin desk →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              Questions?
              <a href="${supportUrl}" style="color:inherit;text-decoration:underline;">Open Support</a><br /><br />
              Automated invitation — please do not reply.<br />
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
