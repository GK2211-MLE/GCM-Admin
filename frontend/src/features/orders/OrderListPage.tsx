import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router';
import { type ColumnDef } from '@tanstack/react-table';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Eye, XCircle, RefreshCw, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useOrders, useUpdateOrderStatus } from './api';
import type { OrderListItem, OrderStatus } from './types';
import { STATUS_LABELS, STATUS_VARIANT, STATUS_FLOW, getOrderDisplayId, PAYMENT_LABELS } from './types';

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready', label: 'Ready' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CHANNEL_OPTIONS = [
  { value: 'all', label: 'All Channels' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'app', label: 'App' },
];

export function OrderListPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState<OrderListItem | null>(null);
  const [statusUpdateOpen, setStatusUpdateOpen] = useState(false);
  const [statusUpdateOrder, setStatusUpdateOrder] = useState<OrderListItem | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus | ''>('');

  // Always fetch ALL orders — filter status/channel client-side so tab counts stay consistent
  const { data: apiData, isLoading } = useOrders({
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const updateStatus = useUpdateOrderStatus();

  const allOrders = apiData?.orders ?? [];

  // Status counts computed from ALL orders (before status/channel filter)
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allOrders.length };
    for (const o of allOrders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
    }
    return counts;
  }, [allOrders]);

  // Fetch all locations for store filter
  const { data: locationsData } = useQuery({
    queryKey: queryKeys.settings.locations(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ locations: { id: string; name: string }[] }>('/locations/all');
      return data.locations;
    },
  });

  const storeOptions = useMemo(() => {
    const locs = locationsData ?? [];
    return [{ value: 'all', label: 'All Stores' }, ...locs.map((l) => ({ value: l.id, label: l.name }))];
  }, [locationsData]);

  // Client-side status + channel + store filter for the table
  const orders = useMemo(() => {
    let filtered = allOrders;
    if (statusFilter !== 'all') {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }
    if (channelFilter !== 'all') {
      filtered = filtered.filter((o) => (o.source ?? 'app') === channelFilter);
    }
    if (storeFilter !== 'all') {
      filtered = filtered.filter((o) => o.location?.id === storeFilter);
    }
    if (deliveryFilter !== 'all') {
      filtered = filtered.filter((o) => o.deliveryMethod === deliveryFilter);
    }
    return filtered;
  }, [allOrders, statusFilter, channelFilter, storeFilter, deliveryFilter]);

  const handleStatusUpdate = useCallback(() => {
    if (!statusUpdateOrder || !newStatus) return;
    updateStatus.mutate(
      { id: statusUpdateOrder.id, status: newStatus },
      { onSuccess: () => { setStatusUpdateOpen(false); setStatusUpdateOrder(null); setNewStatus(''); } },
    );
  }, [statusUpdateOrder, newStatus, updateStatus]);

  const handleCancel = useCallback(() => {
    if (!cancelConfirm) return;
    updateStatus.mutate(
      { id: cancelConfirm.id, status: 'cancelled' },
      { onSuccess: () => setCancelConfirm(null) },
    );
  }, [cancelConfirm, updateStatus]);

  const hasActiveFilters = dateFrom || dateTo || channelFilter !== 'all' || storeFilter !== 'all' || deliveryFilter !== 'all';

  const columns: ColumnDef<OrderListItem, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'orderCode',
        header: 'Order #',
        cell: ({ row }) => (
          <Link
            to={`/orders/${row.original.id}`}
            className="font-medium text-primary-500 hover:underline whitespace-nowrap"
          >
            {getOrderDisplayId(row.original)}
          </Link>
        ),
      },
      {
        id: 'customer',
        header: 'Customer',
        cell: ({ row }) => (
          <div className="min-w-[120px]">
            <p className="font-medium text-sm text-[var(--text-primary)]">
              {row.original.customer?.name || 'Unknown'}
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {row.original.location?.name ?? ''}
            </p>
          </div>
        ),
      },
      {
        id: 'items',
        header: 'Items',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.items?.length ?? row.original.itemCount ?? 0}
          </span>
        ),
      },
      {
        accessorKey: 'total',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums text-sm">
            {formatCurrency(row.original.total / 100)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status] ?? 'default'}>
            {STATUS_LABELS[row.original.status as OrderStatus] ?? row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Date',
        cell: ({ row }) => (
          <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'payment',
        header: 'Payment',
        cell: ({ row }) => (
          <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap">
            {PAYMENT_LABELS[row.original.paymentMethod] ?? row.original.paymentMethod ?? 'N/A'}
          </span>
        ),
      },
      {
        id: 'channel',
        header: 'Channel',
        cell: ({ row }) => {
          const source = row.original.source ?? 'app';
          const label = source === 'whatsapp' ? 'WhatsApp' : 'App';
          const variant = source === 'whatsapp' ? 'success' : 'default';
          return <Badge variant={variant as 'success' | 'default'}>{label}</Badge>;
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const order = row.original;
          const isActive = order.status !== 'cancelled' && order.status !== 'delivered';
          return (
            <div className="flex items-center gap-1">
              <Link to={`/orders/${order.id}`}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Eye className="h-4 w-4" />
                </Button>
              </Link>
              {isActive && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => { setStatusUpdateOrder(order); setStatusUpdateOpen(true); }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-danger hover:text-danger"
                    onClick={() => setCancelConfirm(order)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Track and manage customer orders."
        actions={
          <Link to="/orders/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Order
            </Button>
          </Link>
        }
      />

      {/* Status tabs with counts */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex-wrap">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              <span className={cn(
                'ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums',
                statusFilter === tab.value
                  ? 'bg-primary-500/10 text-primary-500'
                  : 'bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]',
              )}>
                {statusCounts[tab.value] || 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search + Channel + Date filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-56 shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[140px] shrink-0">
            <SelectValue placeholder="All Channels" />
          </SelectTrigger>
          <SelectContent>
            {CHANNEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="w-[150px] shrink-0">
            <SelectValue placeholder="All Stores" />
          </SelectTrigger>
          <SelectContent>
            {storeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
          <SelectTrigger className="w-[160px] shrink-0">
            <SelectValue placeholder="Delivery Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="pickup">Store Pickup</SelectItem>
            <SelectItem value="delivery">Home Delivery</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex shrink-0">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[150px] rounded-r-none border-r-0"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[150px] rounded-l-none"
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => { setDateFrom(''); setDateTo(''); setChannelFilter('all'); setStoreFilter('all'); setDeliveryFilter('all'); }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={orders}
        isLoading={isLoading}
        emptyMessage="No orders found. Create your first order to get started."
      />

      {/* Cancel Confirmation Dialog */}
      <Dialog open={!!cancelConfirm} onOpenChange={() => setCancelConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel order{' '}
              <strong>{cancelConfirm ? getOrderDisplayId(cancelConfirm) : ''}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirm(null)}>
              Keep Order
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog
        open={statusUpdateOpen}
        onOpenChange={(open) => {
          if (!open) { setStatusUpdateOpen(false); setStatusUpdateOrder(null); setNewStatus(''); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Change status for order{' '}
              <strong>{statusUpdateOrder ? getOrderDisplayId(statusUpdateOrder) : ''}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newStatus} onValueChange={(val) => setNewStatus(val as OrderStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Select new status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FLOW.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStatusUpdateOpen(false); setNewStatus(''); }}>
              Cancel
            </Button>
            <Button onClick={handleStatusUpdate} disabled={!newStatus}>
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
