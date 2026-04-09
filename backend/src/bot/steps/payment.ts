import type { ConversationState, PaymentMethod } from '../../shared/index.js';
import { createOrder } from '../../services/order.js';

const paymentOptions: { key: PaymentMethod; label: string }[] = [
  { key: 'cod', label: 'Cash on Delivery' },
  { key: 'pay_at_store', label: 'Pay at Store' },
  { key: 'pay_next_delivery', label: 'Pay on Next Delivery' },
];

export async function handlePayment(state: ConversationState, input: string): Promise<string> {
  if (state.step === 'select_payment') {
    const index = parseInt(input, 10) - 1;

    if (isNaN(index) || index < 0 || index >= paymentOptions.length) {
      let text = 'Select payment method:\n\n';
      paymentOptions.forEach((opt, i) => {
        text += `${i + 1}. ${opt.label}\n`;
      });
      return text;
    }

    const selected = paymentOptions[index];

    try {
      const order = await createOrder({
        tenantId: state.tenantId,
        locationId: state.locationId!,
        phone: '', // Will be set from the incoming message
        customerName: state.customerName ?? 'Customer',
        deliveryMethod: state.deliveryMethod ?? 'pickup',
        deliveryAddress: state.deliveryAddress,
        paymentMethod: selected.key,
        cart: state.cart,
      });

      state.orderId = order.id;
      state.step = 'rating';

      return `Order placed successfully!

Order Code: ${order.orderCode}
Payment: ${selected.label}
Status: ${order.status === 'confirmed' ? 'Confirmed' : 'Pending Payment'}

Thank you for your order! We'll have it ready for you soon.

Would you like to rate your experience? (1-5 stars, or type "skip")`;
    } catch (err) {
      console.error('Order creation error:', err);
      return 'Sorry, there was an error placing your order. Please try again or type "reset".';
    }
  }

  return 'Something went wrong. Type "reset" to start over.';
}
