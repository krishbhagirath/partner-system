const RESEND_API_URL = "https://api.resend.com/emails";

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendImportCompletedEmail(input: {
  to: string;
  displayName: string | null;
  sectionsCount: number;
  appUrl: string | null;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  if (!resendApiKey || !emailFrom) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required to send email.");
  }

  const response = await fetch(RESEND_API_URL, {
    body: JSON.stringify({
      from: emailFrom,
      html: importCompletedEmailHtml(input),
      subject: "Your schedule has been imported",
      to: [input.to],
    }),
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    throw new Error(`Resend request failed (${response.status}): ${body}`);
  }
}

function importCompletedEmailHtml(input: {
  displayName: string | null;
  sectionsCount: number;
  appUrl: string | null;
}) {
  const greeting = input.displayName ? `Hi ${escapeHtml(input.displayName)},` : "Hi,";
  const sectionsLine =
    input.sectionsCount > 0
      ? `We imported ${input.sectionsCount} new lab/tutorial ${
          input.sectionsCount === 1 ? "section" : "sections"
        } from your Mosaic schedule.`
      : "Your Mosaic schedule is up to date — no new lab or tutorial sections were found.";
  const dashboardButton = input.appUrl
    ? `
      <p style="margin: 28px 0;">
        <a href="${escapeHtml(input.appUrl)}/dashboard" style="background: #7A003C; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
          Go to dashboard
        </a>
      </p>`
    : "";

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #7A003C; font-size: 20px;">Your schedule has been imported</h1>
      <p style="color: #1A1715; font-size: 15px; line-height: 1.6;">
        ${greeting}
      </p>
      <p style="color: #1A1715; font-size: 15px; line-height: 1.6;">
        ${sectionsLine} Head to your dashboard to mark the sections you want a partner for and see
        who else is looking.
      </p>
      ${dashboardButton}
      <p style="color: #86817A; font-size: 13px;">
        You're receiving this because you started a schedule import on PartnerUp.
      </p>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
