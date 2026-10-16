import { sendEmail } from "@/utils/email.js";

const INVITE_TTL_DAYS = 7;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The invitation email for joining an organization. `owner` changes the wording
 * for the person an org is created for. Best-effort: returns whether it was
 * sent, never throws, so callers can still hand the link over another way.
 */
export async function sendOrgInviteEmail(
  to: string,
  orgName: string,
  inviteUrl: string,
  opts: { owner?: boolean } = {},
): Promise<boolean> {
  const name = esc(orgName);
  const subject = opts.owner ? `Set up ${orgName} on Colab AI` : `You've been invited to ${orgName} on Colab AI`;
  const lead = opts.owner
    ? `${name} has been set up on Colab AI Business and you're the organization owner. Create your account to manage your team, roles and billing.`
    : `${name} invited you to their team. Create your account to get started.`;
  const button = opts.owner ? "Create my account" : "Accept invitation";

  const text = `${orgName} ${opts.owner ? "has been set up on Colab AI Business and you're the owner" : "invited you to join their team on Colab AI"}.\n\nCreate your account: ${inviteUrl}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2 style="margin:0 0 12px">${opts.owner ? `Set up ${name}` : `Join ${name} on Colab AI`}</h2><p style="color:#444;line-height:1.5">${lead}</p><p style="margin:24px 0"><a href="${inviteUrl}" style="background:#111;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">${button}</a></p><p style="color:#888;font-size:13px">This link expires in ${INVITE_TTL_DAYS} days. If you weren't expecting it, ignore this email.</p></div>`;

  try {
    await sendEmail({ to, subject, text, html });
    return true;
  } catch (e) {
    console.error("Org invite email failed", e);
    return false;
  }
}
