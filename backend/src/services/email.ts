import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { config } from '../config.js';

/**
 * Email transport — uses Resend (HTTP API) when RESEND_API_KEY is set,
 * falls back to nodemailer SMTP when only SMTP_USER/SMTP_PASS are set.
 *
 * Resend is preferred because Render's free-tier Docker containers block
 * all outbound SMTP ports (25/465/587). Resend uses HTTPS (port 443)
 * which is always allowed.
 */

// Resend client (preferred)
let resend: Resend | null = null;
function getResend(): Resend | null {
  if (!(config as any).RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend((config as any).RESEND_API_KEY);
  }
  return resend;
}

// Nodemailer fallback (for local dev or platforms that allow SMTP)
let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  if (!config.SMTP_USER || !config.SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });
  }
  return transporter;
}

interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: Attachment[],
): Promise<void> {
  // Try Resend first (HTTP, works everywhere)
  const r = getResend();
  if (r) {
    try {
      const fromEmail = config.SMTP_USER || 'onboarding@resend.dev';
      const { data, error } = await r.emails.send({
        from: `Good Crazy Meat <${fromEmail}>`,
        to: [to],
        subject,
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
      });
      if (error) {
        console.error(`[email/resend] FAILED to=${to} subject="${subject}" error=${JSON.stringify(error)}`);
        throw new Error(error.message);
      }
      console.log(`[email/resend] Sent to=${to} subject="${subject}" id=${data?.id}`);
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[email/resend] FAILED to=${to} subject="${subject}" error=${msg}`);
      throw err;
    }
  }

  // Fallback to SMTP (works locally, blocked on Render free tier)
  const t = getTransporter();
  if (!t) {
    console.warn('[email] Neither RESEND_API_KEY nor SMTP_USER/SMTP_PASS configured. Email not sent:', { to, subject });
    return;
  }

  try {
    const info = await t.sendMail({
      from: `"Good Crazy Meat" <${config.SMTP_USER}>`,
      to,
      subject,
      html,
      attachments,
    });
    console.log(`[email/smtp] Sent to=${to} subject="${subject}" messageId=${info.messageId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email/smtp] FAILED to=${to} subject="${subject}" error=${msg}`);
    throw err;
  }
}
