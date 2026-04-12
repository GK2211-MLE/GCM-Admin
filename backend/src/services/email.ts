import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!config.SMTP_USER || !config.SMTP_PASS) return null;
  if (!transporter) {
    // Explicitly use smtp.gmail.com over IPv4 (port 465 + TLS). The
    // `service: 'gmail'` shorthand resolves to an IPv6 address which
    // Render's free-tier servers can't reach (ENETUNREACH on 2607:f8b0:...).
    // Forcing `host` + `family: 4` bypasses the IPv6 lookup.
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      family: 4, // Force IPv4
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
  const t = getTransporter();
  if (!t) {
    console.warn('[email] SMTP not configured. Email not sent:', { to, subject });
    return;
  }

  try {
    const info = await t.sendMail({
      from: `"Farm2Cook" <${config.SMTP_USER}>`,
      to,
      subject,
      html,
      attachments,
    });
    console.log(`[email] Sent to=${to} subject="${subject}" messageId=${info.messageId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email] FAILED to=${to} subject="${subject}" error=${msg}`);
    throw err; // re-throw so callers can handle/log
  }
}
