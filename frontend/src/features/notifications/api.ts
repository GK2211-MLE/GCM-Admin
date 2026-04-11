import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface Notification {
  id: string;
  tenantId: string;
  type: 'order' | 'payment' | 'inventory';
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: async () => {
      const { data } = await apiClient.get<NotificationsResponse>('/notifications');
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; markAll?: boolean }) =>
      apiClient.put('/notifications', payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
      if (vars.markAll) toast.success('All notifications marked as read');
    },
  });
}

export function useClearRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete('/notifications/read'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
      toast.success('Read notifications cleared');
    },
  });
}
