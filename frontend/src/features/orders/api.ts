import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { Order, OrderListItem, OrderFilters, OrderCreate, OrderUpdate } from './types';

export function useOrders(filters: OrderFilters = {}) {
  return useQuery({
    queryKey: queryKeys.orders.list(filters as Record<string, unknown>),
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.page) params.page = filters.page;
      if (filters.limit) params.limit = filters.limit;

      const { data } = await apiClient.get<{
        orders: OrderListItem[];
        pagination: { page: number; limit: number; total: number; pages: number };
      }>('/orders', { params });
      return data;
    },
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<{ order: Order }>(`/orders/${id}`);
      return data.order;
    },
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: OrderCreate) => {
      const { data } = await apiClient.post('/orders', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      toast.success('Order created');
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { data } = await apiClient.patch(`/orders/${id}/status`, { status, notes });
      return data;
    },
    onSuccess: (_d, { id, status }) => {
      qc.invalidateQueries({ queryKey: queryKeys.orders.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      const pretty = status.replace(/_/g, ' ');
      toast.success(`Order marked as ${pretty}`);
    },
  });
}

export function useBulkUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderIds, status }: { orderIds: string[]; status: string }) => {
      const { data } = await apiClient.patch('/orders/bulk/status', { orderIds, status });
      return data;
    },
    onSuccess: (_d, { orderIds }) => {
      qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success(`${orderIds.length} order${orderIds.length === 1 ? '' : 's'} updated`);
    },
  });
}
