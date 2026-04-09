export interface PaymentRecord {
  id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  paymentStatus: string;
  amount: number;
  stripePaymentIntentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSummary {
  totalCollected: number;
  totalPending: number;
  totalFailed: number;
  totalRefunded: number;
}

export interface PaymentFilters {
  page?: number;
  limit?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}
