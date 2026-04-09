import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface InvoiceListItem {
  invoiceNumber: string;
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceListItem {
  taxRate: number;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}

export interface InvoiceFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export function useInvoices(filters: InvoiceFilters = {}) {
  return useQuery({
    queryKey: queryKeys.invoices.list(filters as Record<string, unknown>),
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.search) params.search = filters.search;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.page) params.page = filters.page;
      if (filters.limit) params.limit = filters.limit;

      const { data } = await apiClient.get<{
        invoices: InvoiceListItem[];
        total: number;
      }>('/invoices', { params });
      return data;
    },
  });
}

export function useInvoice(orderId: string) {
  return useQuery({
    queryKey: queryKeys.invoices.detail(orderId),
    queryFn: async () => {
      const { data } = await apiClient.get<{ invoice: InvoiceDetail }>(`/invoices/${orderId}`);
      return data.invoice;
    },
    enabled: !!orderId,
  });
}
