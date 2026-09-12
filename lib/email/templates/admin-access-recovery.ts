export type AdminDeskKind = "national" | "parish";

export type AdminAccessRecoveryInput = {
  fullName: string;
  email: string;
  temporaryPassword: string;
  deskScopeLabel: string;
  adminLoginUrl: string;
  /** Public portal support page — not a mailbox. */
  portalSupportUrl: string;
  /** Main public website (schoolofdisciples.org). */
  siteUrl: string;
  deskKind?: AdminDeskKind;
  parishName?: string;
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

/** Fresh temporary password after an admin forgot-password request. */
export function buildAdminAccessRecoveryEmail(input: AdminAccessRecoveryInput) {
  const firstName = firstNameFrom(input.fullName, input.email);
  const name = escapeHtml(firstName);
  const displayName = escapeHtml(input.fullName.trim() || firstName);
  const email = escapeHtml(input.email.trim());
  const password = escapeHtml(input.temporaryPassword);
  const kind = resolveDeskKind(input.deskKind, input.deskScopeLabel);
  const role = roleTitle(kind);
  const roleSafe = escapeHtml(role);
  const parish = parishFromScope(input.deskScopeLabel, input.parishName);
  const scopeLabel =
    input.deskScopeLabel.trim() ||
    (kind === "parish"
      ? parish
        ? `Parish desk — ${parish}`
        : "Parish desk"
      : "National desk — all UK parishes");
  const scope = escapeHtml(scopeLabel);
  const loginUrl = escapeHtml(input.adminLoginUrl.trim());
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();

  const roleBlurb =
    kind === "parish"
      ? parish
        ? `This renews access to the parish desk for ${parish}.`
        : "This renews access to your parish desk."
      : "This renews access to the national desk.";

  const subject = `${firstName}, your ${role} desk password was refreshed`;

  const text = [
    `Dear ${firstName},`,
    ``,
    `Someone (hopefully you) asked for a fresh temporary password for the admin portal.`,
    ``,
    `Your place: ${role}`,
    `Your desk: ${scopeLabel}`,
    `Account: ${input.fullName.trim() || firstName}`,
    `Email: ${input.email}`,
    ``,
    roleBlurb,
    ``,
    `Your previous password no longer works.`,
    `New temporary password: ${input.temporaryPassword}`,
    `Admin login: ${input.adminLoginUrl}`,
    ``,
    `Please change this password after you sign in (Access → Password).`,
    ``,
    `If you did not request this, open Support straight away: ${input.portalSupportUrl}`,
    ``,
    `School of Disciples · Belfast`,
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
<body style="margin:0;padding:0;background:#e4e9ed;color:#1a2228;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e4e9ed;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <tr>
            <td style="padding:0 4px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#3d6b7a;font-weight:700;">
                    School of Disciples
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(26,34,40,0.4);">
                    Access recovery
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="58%" valign="top" style="background:#1a2f38;color:#eef3f5;padding:30px 24px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#7eb0c0;">
                      ${roleSafe}
                    </p>
                    <p style="margin:14px 0 0;font-size:30px;line-height:1.05;letter-spacing:-0.03em;">
                      ${name},
                    </p>
                    <p style="margin:8px 0 0;font-size:20px;line-height:1.2;color:#a8d0dc;">
                      your desk key is renewed.
                    </p>
                  </td>
                  <td width="42%" valign="middle" align="center" style="background:#2a4a56;padding:24px 14px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#c5e4ec;line-height:1.35;">
                      Temporary<br />password
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:22px 24px 8px;border-left:1px solid #c8d2d8;border-right:1px solid #c8d2d8;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(26,34,40,0.78);">
                ${escapeHtml(roleBlurb)} Your previous password no longer works — use the temporary one below, then replace it under Access → Password.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;background:#eef3f5;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#3d6b7a;">
                      Desk
                    </p>
                    <p style="margin:6px 0 0;font-size:15px;color:#1a2f38;">
                      ${scope}
                    </p>
                    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:rgba(26,34,40,0.55);">
                      ${displayName}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:16px 24px 26px;border:1px solid #c8d2d8;border-top:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a2f38;">
                <tr>
                  <td style="padding:18px 18px 6px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#7eb0c0;">
                      Email
                    </p>
                    <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#eef3f5;">
                      ${email}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 18px 18px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#7eb0c0;">
                      Temporary password
                    </p>
                    <p style="margin:6px 0 0;font-family:ui-monospace,Consolas,monospace;font-size:17px;letter-spacing:0.06em;color:#a8d0dc;">
                      ${password}
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;">
                <tr>
                  <td style="background:#1a2f38;">
                    <a href="${loginUrl}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#eef3f5;text-decoration:none;">
                      Sign in to the admin desk →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#eef3f5;padding:18px 22px;border:1px solid #c8d2d8;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:rgba(26,34,40,0.72);">
              If you did not ask for this reset, open
              <a href="${supportUrl}" style="color:#1a2f38;text-decoration:underline;">Support</a>
              straight away. Your earlier password has been replaced.
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(26,34,40,0.48);">
              Questions?
              <a href="${supportUrl}" style="color:inherit;text-decoration:underline;">Open Support</a><br /><br />
              Automated access message — please do not reply.<br />
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
