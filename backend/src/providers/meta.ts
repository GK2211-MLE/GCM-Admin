import { config } from '../config.js';

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';

export async function sendMetaMessage(to: string, body: string): Promise<boolean> {
  if (!config.META_ACCESS_TOKEN || !config.META_PHONE_NUMBER_ID) {
    console.warn('Meta WhatsApp not configured. Message not sent:', { to, body: body.slice(0, 50) });
    return false;
  }

  try {
    const url = `${GRAPH_API_URL}/${config.META_PHONE_NUMBER_ID}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Meta WhatsApp API error:', err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Meta send error:', err);
    return false;
  }
}
