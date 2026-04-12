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
    // Render's free-tier Docker containers block outbound SMTP over IPv6
    // (ENETUNREACH) and DNS-based IPv4 connections time out on ports 465
    // and 587. We use a custom DNS resolver that forces IPv4 lookups so
    // nodemailer never attempts IPv6. Port 587 + STARTTLS is the standard
    // Gmail submission port.
    const dns = require('dns');
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
      // Force IPv4 DNS resolution at the socket level
      dnsLookup: (hostname: string, options: any, callback: any) => {
        dns.resolve4(hostname, (err: any, addresses: string[]) => {
          if (err) return callback(err);
          callback(null, addresses[0], 4);
        });
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
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
