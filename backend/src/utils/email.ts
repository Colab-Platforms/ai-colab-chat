import { Resend } from "resend";
import { ApiError } from "./ApiError.js";
import STATUS_CODES from "./statusCodes.js";

const resend = new Resend(process.env.RESEND_API_KEY);

const getFromAddress = () => {
  // Try to use configured environment variables, fallback to Resend onboarding default
  return (
    process.env.SMTP_FROM || process.env.SMTP_USER || "onboarding@resend.dev"
  );
};

interface SendEmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

export const sendEmail = async (payload: SendEmailPayload) => {
  const from = getFromAddress();

  if (!process.env.RESEND_API_KEY) {
    throw new ApiError(
      "RESEND_API_KEY is not configured. Please set the RESEND_API_KEY in .env.",
      STATUS_CODES.SERVER_ERROR,
    );
  }

  const { error } = await resend.emails.send({
    from,
    to: [payload.to],
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
  });

  if (error) {
    console.error("Resend API failed:", error);
    throw new ApiError(
      "Failed to send email via Resend",
      STATUS_CODES.SERVER_ERROR,
    );
  }
};

const renderOtpTemplate = ({
  otp,
  title,
  subtitle,
  action,
}: {
  otp: string;
  title: string;
  subtitle: string;
  action: string;
}) => {
  const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style>
      :root {
        --bg: #f5f7fb;
        --card: #ffffff;
        --text: #0f172a;
        --muted: #475569;
        --primary: #4f46e5;
        --otp-bg: #eef2ff;
        --otp-text: #312e81;
        --border: #e2e8f0;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0b1220;
          --card: #111827;
          --text: #e5e7eb;
          --muted: #9ca3af;
          --primary: #818cf8;
          --otp-bg: #1f2248;
          --otp-text: #c7d2fe;
          --border: #273244;
        }
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, Segoe UI, Arial, sans-serif;
      }
      .wrap {
        width: 100%;
        padding: 32px 12px;
      }
      .card {
        max-width: 560px;
        margin: 0 auto;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow: hidden;
      }
      .header {
        padding: 24px;
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
        color: #ffffff;
      }
      .app {
        font-weight: 700;
        font-size: 20px;
        letter-spacing: 0.2px;
      }
      .content {
        padding: 24px;
      }
      .title {
        margin: 0 0 8px;
        font-size: 22px;
        line-height: 1.25;
      }
      .subtitle {
        margin: 0 0 20px;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.5;
      }
      .otp {
        display: block;
        margin: 0 auto 20px;
        background: var(--otp-bg);
        color: var(--otp-text);
        border-radius: 14px;
        border: 1px solid var(--border);
        text-align: center;
        font-size: 40px;
        letter-spacing: 14px;
        font-weight: 800;
        padding: 18px 16px;
      }
      .meta {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
        margin: 0;
      }
      .footer {
        padding: 16px 24px 24px;
        color: var(--muted);
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="header">
          <div class="app">AI Colab Chat</div>
        </div>
        <div class="content">
          <h1 class="title">${title}</h1>
          <p class="subtitle">${subtitle}</p>
          <div class="otp">${otp}</div>
          <p class="meta">Use this OTP to ${action}. It expires in 10 minutes.</p>
          <p class="meta">If you did not request this, you can safely ignore this email.</p>
        </div>
        <div class="footer">This is an automated message from AI Colab Chat.</div>
      </div>
    </div>
  </body>
</html>`;
  const text = `AI Colab Chat\n\n${title}\n${subtitle}\n\nOTP: ${otp}\nUse this OTP to ${action}. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`;
  return { html, text };
};

export const sendOtpEmail = async (
  to: string,
  otp: string,
  purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
) => {
  const title =
    purpose === "EMAIL_VERIFICATION"
      ? "Email verification code"
      : "Password reset code";
  const action =
    purpose === "EMAIL_VERIFICATION"
      ? "verify your email"
      : "reset your password";
  const subtitle =
    purpose === "EMAIL_VERIFICATION"
      ? "Enter this verification code to continue your sign in."
      : "Enter this code to set a new password for your account.";
  const template = renderOtpTemplate({
    otp,
    title,
    subtitle,
    action,
  });

  await sendEmail({
    to,
    subject: `${title} - AI Colab Chat`,
    text: template.text,
    html: template.html,
  });
};
