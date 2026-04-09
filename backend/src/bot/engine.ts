import type { ConversationState, ConversationStep } from '../shared/index.js';
import { CONVERSATION_TTL_MS } from '../shared/index.js';
import { sendTwilioMessage } from '../providers/twilio.js';
import { sendMetaMessage } from '../providers/meta.js';
import { sendSimulatorMessage } from '../providers/simulator.js';

// In-memory conversation store (replace with Redis in production)
const conversations = new Map<string, ConversationState>();

export interface IncomingMessage {
  provider: 'meta' | 'twilio' | 'simulator';
  from: string;
  text: string;
  messageType: string;
}

function getDefaultTenantId(): string {
  // In a multi-tenant setup, this would be resolved from the phone number or config
  // For now, we'll use a placeholder that gets set during the welcome step
  return '';
}

function getConversation(phone: string): ConversationState {
  const existing = conversations.get(phone);
  if (existing && Date.now() - existing.lastActive < CONVERSATION_TTL_MS) {
    return existing;
  }

  const state: ConversationState = {
    step: 'welcome',
    tenantId: getDefaultTenantId(),
    cart: [],
    lastActive: Date.now(),
  };
  conversations.set(phone, state);
  return state;
}

function saveConversation(phone: string, state: ConversationState): void {
  state.lastActive = Date.now();
  conversations.set(phone, state);
}

async function sendReply(provider: string, to: string, message: string): Promise<void> {
  switch (provider) {
    case 'meta':
      await sendMetaMessage(to, message);
      break;
    case 'twilio':
      await sendTwilioMessage(to, message);
      break;
    case 'simulator':
      await sendSimulatorMessage(to, message);
      break;
    default:
      console.warn(`Unknown provider: ${provider}`);
  }
}

export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const { provider, from, text } = msg;
  const input = text.trim().toLowerCase();

  // Global commands
  if (input === 'reset' || input === 'start over' || input === 'restart') {
    conversations.delete(from);
    const state = getConversation(from);
    const { handleWelcome } = await import('./steps/welcome.js');
    const reply = await handleWelcome(state, from);
    saveConversation(from, state);
    await sendReply(provider, from, reply);
    return;
  }

  const state = getConversation(from);

  let reply: string;

  switch (state.step) {
    case 'welcome': {
      const { handleWelcome } = await import('./steps/welcome.js');
      reply = await handleWelcome(state, from);
      break;
    }
    case 'select_location': {
      const { handleLocation } = await import('./steps/location.js');
      reply = await handleLocation(state, input);
      break;
    }
    case 'select_category': {
      const { handleCategory } = await import('./steps/category.js');
      reply = await handleCategory(state, input);
      break;
    }
    case 'browse_products': {
      const { handleBrowse } = await import('./steps/browse.js');
      reply = await handleBrowse(state, input);
      break;
    }
    case 'select_quantity': {
      const { handleQuantity } = await import('./steps/quantity.js');
      reply = await handleQuantity(state, input);
      break;
    }
    case 'view_cart': {
      const { showCart } = await import('./steps/cart.js');
      reply = await showCart(state, input);
      break;
    }
    case 'checkout_name':
    case 'checkout_delivery':
    case 'checkout_address':
    case 'checkout_confirm': {
      const { handleCheckout } = await import('./steps/checkout.js');
      reply = await handleCheckout(state, input);
      break;
    }
    case 'select_payment':
    case 'awaiting_payment': {
      const { handlePayment } = await import('./steps/payment.js');
      reply = await handlePayment(state, input);
      break;
    }
    case 'rating': {
      const { handleRating } = await import('./steps/rating.js');
      reply = await handleRating(state, input);
      break;
    }
    case 'done': {
      reply = 'Your order has been placed! Type "hi" to start a new order.';
      if (input === 'hi' || input === 'hello' || input === 'hey') {
        conversations.delete(from);
        const freshState = getConversation(from);
        const { handleWelcome } = await import('./steps/welcome.js');
        reply = await handleWelcome(freshState, from);
        saveConversation(from, freshState);
        await sendReply(provider, from, reply);
        return;
      }
      break;
    }
    default:
      reply = 'Something went wrong. Type "reset" to start over.';
  }

  saveConversation(from, state);
  await sendReply(provider, from, reply);
}
