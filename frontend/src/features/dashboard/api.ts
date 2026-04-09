import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface DashboardSummary {
  totalOrders: number;
  todayOrders: number;
  totalRevenue: number;
  todayRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  pendingCount: number;
  activeDeliveries: number;
  processingCount: number;
  revenueGrowth: number;
  ordersGrowth: number;
  statusBreakdown: Record<string, number>;
  deliveryMethodBreakdown: Record<string, number>;
  dailyRevenue: Array<{ date: string; revenue: number; count: number }>;
  topProducts: Array<{ productName: string; productId: string; orderCount: number; totalQty: number }>;
  recentOrders: Array<{
    id: string;
    orderCode: string;
    status: string;
    total: number;
    createdAt: string;
    deliveryMethod: string;
    customerName: string | null;
    customerPhone: string | null;
  }>;
}

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => {
      const { data } = await apiClient.get('/orders/summary');
      return data;
    },
    staleTime: 60_000,
  });
}
