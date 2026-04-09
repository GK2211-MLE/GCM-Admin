import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { PaymentRecord, PaymentSummary, PaymentFilters } from './types';

export function usePayments(filters: PaymentFilters = {}) {
  return useQuery({
    queryKey: queryKeys.payments.list(filters as Record<string, unknown>),
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.page) params.page = filters.page;
      if (filters.limit) params.limit = filters.limit;
      if (filters.paymentMethod) params.paymentMethod = filters.paymentMethod;
      if (filters.paymentStatus) params.paymentStatus = filters.paymentStatus;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.search) params.search = filters.search;

      const { data } = await apiClient.get<{
        payments: PaymentRecord[];
        total: number;
      }>('/payments', { params });
      return data;
    },
  });
}

export function usePaymentSummary() {
  return useQuery({
    queryKey: queryKeys.payments.summary(),
    queryFn: async () => {
      const { data } = await apiClient.get<PaymentSummary>('/payments/summary');
      return data;
    },
  });
}

export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await apiClient.post('/payments/mark-paid', { orderId });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.all });
      qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

export function useRefundPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason?: string }) => {
      const { data } = await apiClient.post(`/payments/${orderId}/refund`, { reason });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.all });
      qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}
