import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import { type ColumnDef } from '@tanstack/react-table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Eye, DollarSign, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import { usePayments, usePaymentSummary, useMarkPaid } from './api';
import { RefundDialog } from './RefundDialog';
import type { PaymentRecord } from './types';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

const METHOD_OPTIONS = [
  { value: 'all', label: 'All Methods' },
  { value: 'stripe', label: 'Card (Online)' },
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'pay_at_store', label: 'Pay at Store' },
];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: 'Card (Online)',
  cod: 'Cash on Delivery',
  pay_at_store: 'Pay at Store',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  paid: 'success',
  pending: 'warning',
  failed: 'danger',
  refunded: 'default',
};

export function PaymentListPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [refundPayment, setRefundPayment] = useState<PaymentRecord | null>(null);

  const filters = useMemo(() => ({
    paymentStatus: statusFilter !== 'all' ? statusFilter : undefined,
    paymentMethod: methodFilter !== 'all' ? methodFilter : undefined,
    search: search || undefined,
  }), [statusFilter, methodFilter, search]);

  const { data: apiData, isLoading } = usePayments(filters);
  const { data: summary } = usePaymentSummary();
  const markPaid = useMarkPaid();

  const payments = apiData?.payments ?? [];

  const summaryCards = [
    {
      label: 'Total Collected',
      value: summary?.totalCollected ?? 0,
      icon: DollarSign,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'Pending',
      value: summary?.totalPending ?? 0,
      icon: Clock,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      label: 'Failed',
      value: summary?.totalFailed ?? 0,
      icon: AlertTriangle,
      color: 'text-danger',
      bg: 'bg-danger/10',
      isCount: true,
    },
    {
      label: 'Refunded',
      value: summary?.totalRefunded ?? 0,
      icon: RotateCcw,
      color: 'text-info',
      bg: 'bg-info/10',
    },
  ];

  const columns: ColumnDef<PaymentRecord, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'orderCode',
        header: 'Order Code',
        cell: ({ row }) => (
          <span className="font-medium text-sm text-[var(--text-primary)]">
            {row.original.orderCode}
          </span>
        ),
      },
      {
        id: 'customer',
        header: 'Customer',
        cell: ({ row }) => (
          <div className="min-w-[120px]">
            <p className="font-medium text-sm text-[var(--text-primary)]">
              {row.original.customerName}
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {row.original.customerPhone}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'paymentMethod',
        header: 'Payment Method',
        cell: ({ row }) => (
          <Badge variant="default">
            {PAYMENT_METHOD_LABELS[row.original.paymentMethod] ?? row.original.paymentMethod}
          </Badge>
        ),
      },
      {
        accessorKey: 'paymentStatus',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.paymentStatus] ?? 'default'}>
            {row.original.paymentStatus.charAt(0).toUpperCase() + row.original.paymentStatus.slice(1)}
          </Badge>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums text-sm">
            {formatCurrency(row.original.amount / 100)}
          </span>
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
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const payment = row.original;
          return (
            <div className="flex items-center gap-1">
              <Link to={`/orders/${payment.id}`}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Eye className="h-4 w-4" />
                </Button>
              </Link>
              {payment.paymentStatus === 'pending' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs font-medium text-success hover:text-success"
                  onClick={() => markPaid.mutate(payment.id)}
                  disabled={markPaid.isPending}
                >
                  Mark Paid
                </Button>
              )}
              {payment.paymentStatus === 'paid' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs font-medium text-danger hover:text-danger"
                  onClick={() => setRefundPayment(payment)}
                >
                  Refund
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [markPaid],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Track payment transactions" />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-sm text-[var(--text-tertiary)]">{card.label}</p>
                <p className="text-xl font-semibold tabular-nums text-[var(--text-primary)]">
                  {card.isCount ? card.value : formatCurrency(card.value / 100)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Filters Row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            placeholder="Search by order code or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-[180px] shrink-0">
            <SelectValue placeholder="All Methods" />
          </SelectTrigger>
          <SelectContent>
            {METHOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={payments}
        isLoading={isLoading}
        emptyMessage="No payment transactions found."
      />

      {/* Refund Dialog */}
      <RefundDialog
        payment={refundPayment}
        open={!!refundPayment}
        onOpenChange={(open) => { if (!open) setRefundPayment(null); }}
      />
    </div>
  );
}
