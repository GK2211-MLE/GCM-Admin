import type { FastifyInstance } from 'fastify';
import { handleIncomingMessage } from '../bot/engine.js';

// In-memory store for simulator conversations
const simulatorResponses = new Map<string, string[]>();

export async function simulatorRoutes(app: FastifyInstance) {
  // Send a message from the simulator
  app.post('/send', async (request) => {
    const { phone, text } = request.body as { phone: string; text: string };

    // Clear previous responses for this phone
    simulatorResponses.set(phone, []);

    await handleIncomingMessage({
      provider: 'simulator',
      from: phone,
      text,
      messageType: 'text',
    });

    // Small delay to let async bot finish
    await new Promise((r) => setTimeout(r, 100));

    const responses = simulatorResponses.get(phone) ?? [];
    return { responses };
  });

  // Poll for responses (used by frontend)
  app.get('/responses/:phone', async (request) => {
    const { phone } = request.params as { phone: string };
    const responses = simulatorResponses.get(phone) ?? [];
    return { responses };
  });

  // Clear conversation
  app.post('/clear', async (request) => {
    const { phone } = request.body as { phone: string };
    simulatorResponses.delete(phone);
    return { success: true };
  });
}

/** Called by the simulator provider to store a response */
export function addSimulatorResponse(phone: string, message: string) {
  if (!simulatorResponses.has(phone)) {
    simulatorResponses.set(phone, []);
  }
  simulatorResponses.get(phone)!.push(message);
}
