import "server-only";

import { requireEmailConfig } from "@/lib/config";

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const { emailFrom, resendApiKey } = requireEmailConfig();

  const response = await fetch(RESEND_API_URL, {
    body: JSON.stringify({
      from: emailFrom,
      html: verificationEmailHtml(verifyUrl),
      subject: "Verify your PartnerUp email",
      to: [to],
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

function verificationEmailHtml(verifyUrl: string) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #7A003C; font-size: 20px;">Verify your email</h1>
      <p style="color: #1A1715; font-size: 15px; line-height: 1.6;">
        Click the button below to verify your McMaster email and activate your PartnerUp account.
        This link expires in 24 hours.
      </p>
      <p style="margin: 28px 0;">
        <a href="${verifyUrl}" style="background: #7A003C; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
          Verify email
        </a>
      </p>
      <p style="color: #86817A; font-size: 13px;">
        If you didn't create a PartnerUp account, you can safely ignore this email.
      </p>
    </div>
  `;
}
