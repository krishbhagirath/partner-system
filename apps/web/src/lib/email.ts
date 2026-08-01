import "server-only";

import { requireEmailConfig } from "@/lib/config";

const RESEND_API_URL = "https://api.resend.com/emails";

const BRAND = "#7A003C";
const TEXT = "#1A1715";
const MUTED = "#86817A";

async function sendEmail(payload: { to: string; subject: string; html: string }) {
  const { emailFrom, resendApiKey } = requireEmailConfig();

  const response = await fetch(RESEND_API_URL, {
    body: JSON.stringify({
      from: emailFrom,
      html: payload.html,
      subject: payload.subject,
      to: [payload.to],
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

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  await sendEmail({
    to,
    subject: "Verify your PartnerUp email",
    html: verificationEmailHtml(verifyUrl),
  });
}

export async function sendIncomingRequestEmail(input: {
  to: string;
  senderName: string;
  sectionLabel: string;
  appUrl: string;
}) {
  await sendEmail({
    to: input.to,
    subject: `${input.senderName} wants to be your lab partner`,
    html: incomingRequestHtml(input),
  });
}

export async function sendMatchedEmail(input: {
  to: string;
  partnerName: string;
  sectionLabel: string;
  appUrl: string;
}) {
  await sendEmail({
    to: input.to,
    subject: `You matched with ${input.partnerName} on PartnerUp`,
    html: matchedHtml(input),
  });
}

function link(appUrl: string, path: string) {
  return `${appUrl.replace(/\/+$/, "")}${path}`;
}

function shell(inner: string) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      ${inner}
      <p style="color: ${MUTED}; font-size: 13px; margin-top: 28px;">
        You're receiving this because you turned on email notifications. Change that anytime
        in your PartnerUp settings.
      </p>
    </div>
  `;
}

function button(href: string, label: string) {
  return `
    <p style="margin: 28px 0;">
      <a href="${href}" style="background: ${BRAND}; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        ${label}
      </a>
    </p>
  `;
}

function verificationEmailHtml(verifyUrl: string) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h1 style="color: ${BRAND}; font-size: 20px;">Verify your email</h1>
      <p style="color: ${TEXT}; font-size: 15px; line-height: 1.6;">
        Click the button below to verify your McMaster email and activate your PartnerUp account.
        This link expires in 24 hours.
      </p>
      ${button(verifyUrl, "Verify email")}
      <p style="color: ${MUTED}; font-size: 13px;">
        If you didn't create a PartnerUp account, you can safely ignore this email.
      </p>
    </div>
  `;
}

function incomingRequestHtml(input: { senderName: string; sectionLabel: string; appUrl: string }) {
  return shell(`
    <h1 style="color: ${BRAND}; font-size: 20px;">New lab partner request</h1>
    <p style="color: ${TEXT}; font-size: 15px; line-height: 1.6;">
      <strong>${input.senderName}</strong> wants to partner with you for
      <strong>${input.sectionLabel}</strong>. Open PartnerUp to accept or decline.
    </p>
    ${button(link(input.appUrl, "/requests"), "View request")}
  `);
}

function matchedHtml(input: { partnerName: string; sectionLabel: string; appUrl: string }) {
  return shell(`
    <h1 style="color: ${BRAND}; font-size: 20px;">You've got a lab partner!</h1>
    <p style="color: ${TEXT}; font-size: 15px; line-height: 1.6;">
      You and <strong>${input.partnerName}</strong> are now matched for
      <strong>${input.sectionLabel}</strong>. Open PartnerUp to see their contact info and say hi.
    </p>
    ${button(link(input.appUrl, "/matches"), "View match")}
  `);
}
