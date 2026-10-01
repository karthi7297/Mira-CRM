/**
 * Credentials emails (Nodemailer) — sent automatically after a Trainer or
 * Student account is created, and when an admin uses "Resend Credentials".
 *
 * Contract: these functions NEVER throw. They resolve { sent, reason } and log
 * failures server-side without printing passwords, so an SMTP outage can never
 * fail (or duplicate) an account creation — services report emailSent:false and
 * the admin can resend later.
 *
 * Content spec (§6): account confirmation, username, temporary password,
 * login URL, first-login instructions, and the change-password security note.
 */
const config = require('../config');
const { isMailConfigured, getTransporter, getFrom } = require('../config/mailer');

const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const APP_NAME = () => config.mail.appName;
const LOGIN_URL = () => config.mail.loginUrl;

/**
 * Shared responsive shell: dark brand header, greeting, credential table,
 * login button + raw URL, first-login steps, security callout, footer.
 */
function renderCredentialsHtml({ role, name, username, tempPassword, orgName }) {
  const app = escapeHtml(APP_NAME());
  const loginUrl = LOGIN_URL();
  const intro = role === 'TRAINER'
    ? `Your Trainer account has been created by ${escapeHtml(orgName || app)}.`
    : 'Your Student account has been created successfully.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${app} — ${role === 'TRAINER' ? 'Trainer' : 'Student'} account created</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <!-- Brand header -->
        <tr>
          <td style="background:#0f172a;padding:22px 28px;">
            <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.3px;">${app}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:3px;">${role === 'TRAINER' ? 'Trainer' : 'Student'} account credentials</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:26px 28px 8px;">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hello <strong>${escapeHtml(name) || 'there'},</strong></p>
            <p style="margin:0 0 18px;font-size:14.5px;line-height:1.65;color:#334155;">${intro}</p>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:0 0 18px;">
              <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Login details</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#64748b;padding:5px 0;width:140px;">Username</td>
                  <td style="font-size:14px;font-weight:600;padding:5px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#0f172a;">${escapeHtml(username)}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#64748b;padding:5px 0;">Temporary Password</td>
                  <td style="font-size:14px;font-weight:700;padding:5px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#2563eb;letter-spacing:.5px;">${escapeHtml(tempPassword)}</td>
                </tr>
              </table>
            </div>

            <div style="margin:0 0 16px;">
              <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">Open ${app} login</a>
              <div style="font-size:12px;color:#64748b;margin-top:9px;word-break:break-all;">
                Login URL: <a href="${escapeHtml(loginUrl)}" style="color:#2563eb;">${escapeHtml(loginUrl)}</a>
              </div>
            </div>

            <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">
              Please log in using the above credentials and <strong>change your password after your first login</strong>.
            </p>

            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin:0 0 6px;">
              <div style="font-size:13px;line-height:1.6;color:#92400e;">
                <strong>Security note:</strong> this is a temporary password issued by ${app}.
                Set your own password immediately after signing in, keep it private, and do not share these credentials with anyone.
              </div>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px 26px;">
            <div style="border-top:1px solid #e2e8f0;padding-top:14px;font-size:13px;color:#64748b;line-height:1.6;">
              Regards,<br/>
              <strong>${app} Team</strong>
            </div>
          </td>
        </tr>
      </table>
      <div style="font-size:11px;color:#94a3b8;margin-top:14px;max-width:560px;line-height:1.5;">
        This is an automated account notification from ${app}. If you did not expect this email, please contact your administrator.
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

function subjectFor(role) {
  return `Welcome to ${APP_NAME()} - ${role === 'TRAINER' ? 'Trainer' : 'Student'} Account Created`;
}

/**
 * Low-level delivery. Returns { sent, reason } and never throws.
 * reason: 'not-configured' | 'send-failed' (details stay in server logs only).
 */
async function deliver({ to, subject, html }) {
  if (!to) return { sent: false, reason: 'no-recipient' };
  if (!isMailConfigured()) {
    console.warn(`[email] skipped "${subject}" -> ${to} (SMTP not configured)`);
    return { sent: false, reason: 'not-configured' };
  }
  try {
    await getTransporter().sendMail({ from: getFrom(), to, subject, html });
    return { sent: true };
  } catch (err) {
    // Log the failure for ops — never the message body (it carries the password).
    console.error(`[email] send failed "${subject}" -> ${to}: ${err.message}`);
    return { sent: false, reason: 'send-failed' };
  }
}

/** Trainer credentials email (organization creates a trainer). */
async function sendTrainerCredentialsEmail({ to, name, username, tempPassword, orgName } = {}) {
  return deliver({
    to,
    subject: subjectFor('TRAINER'),
    html: renderCredentialsHtml({ role: 'TRAINER', name, username, tempPassword, orgName }),
  });
}

/** Student credentials email (organization / institution / trainer adds a student). */
async function sendStudentCredentialsEmail({ to, name, username, tempPassword, orgName } = {}) {
  return deliver({
    to,
    subject: subjectFor('STUDENT'),
    html: renderCredentialsHtml({ role: 'STUDENT', name, username, tempPassword, orgName }),
  });
}

module.exports = { sendTrainerCredentialsEmail, sendStudentCredentialsEmail };
