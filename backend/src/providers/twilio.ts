import twilio from 'twilio';
import { config } from '../config.js';

let client: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) return null;
  if (!client) {
    client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  }
  return client;
}

export async function sendTwilioMessage(to: string, body: string): Promise<boolean> {
  const c = getTwilioClient();
  if (!c) {
    console.warn('Twilio not configured. Message not sent:', { to, body: body.slice(0, 50) });
    return false;
  }

  try {
    await c.messages.create({
      from: `whatsapp:${config.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:${to}`,
      body,
    });
    return true;
  } catch (err) {
    console.error('Twilio send error:', err);
    return false;
  }
}
