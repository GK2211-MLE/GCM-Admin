import { useState, useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Search, Eye, Download, Mail, FileText, Loader2, CheckCircle, X } from 'lucide-react';
import { useInvoices, type InvoiceListItem } from './api';
import { InvoiceDetailDialog } from './InvoiceDetailDialog';

const PAYMENT_LABELS: Record<string, string> = {
  stripe: 'Card (Stripe)',
  cod: 'Cash on Delivery',
  pay_at_store: 'Pay at Store',
};

export function InvoiceListPage() {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  const { data: apiData, isLoading } = useInvoices({
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const invoices = apiData?.invoices ?? [];

  const hasActiveFilters = !!dateFrom || !!dateTo || !!search;

  const handleViewDetail = (orderId: string) => {
    setDetailOrderId(orderId);
    setDetailOpen(true);
  };

  const handleSendEmail = async (orderId: string) => {
    setSendingEmail(orderId);
    try {
      await apiClient.post(`/invoices/${orderId}/send-email`);
      setSentEmail(orderId);
      setShowBanner(true);
      setTimeout(() => { setSentEmail(null); setShowBanner(false); }, 3000);
    } finally {
      setSendingEmail(null);
    }
  };

  const handleDownload = async (orderId: string) => {
    try {
      const { data: html } = await apiClient.get(`/invoices/${orderId}/html`, { responseType: 'text' });
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
    } catch {
      window.open(`/api/invoices/${orderId}/html`, '_blank');
    }
  };

  const columns: ColumnDef<InvoiceListItem, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: 'Invoice #',
        cell: ({ row }) => (
          <span className="font-medium text-[var(--text-primary)] whitespace-nowrap">
            {row.original.invoiceNumber}
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
            {row.original.customerPhone && (
              <p className="text-xs text-[var(--text-tertiary)]">
                {row.original.customerPhone}
              </p>
            )}
          </div>
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
        id: 'paymentMethod',
        header: 'Payment Method',
        cell: ({ row }) => (
          <Badge variant="info">
            {PAYMENT_LABELS[row.original.paymentMethod] ?? row.original.paymentMethod}
          </Badge>
        ),
      },
      {
        accessorKey: 'total',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums text-sm text-[var(--text-primary)]">
            {formatCurrency(row.original.total / 100)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const invoice = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleViewDetail(invoice.orderId)}
                title="View invoice"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDownload(invoice.orderId)}
                title="Download invoice"
              >
                <Download className="h-4 w-4" />
              </Button>
              {sentEmail === invoice.orderId ? (
                <span className="flex items-center gap-1 px-2 text-xs font-medium text-green-600">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Mail sent
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 gap-1.5 text-xs font-medium active:scale-95 transition-transform"
                  onClick={() => handleSendEmail(invoice.orderId)}
                  disabled={sendingEmail === invoice.orderId}
                  title="Send invoice to customer email"
                >
                  {sendingEmail === invoice.orderId
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Mail className="h-3.5 w-3.5" />}
                  {sendingEmail === invoice.orderId ? 'Sending...' : 'Mail'}
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [sendingEmail, sentEmail],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="View and download customer invoices"
      />

      {/* Success banner */}
      {showBanner && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium">Invoice email sent successfully!</p>
          <button
            className="ml-auto rounded p-0.5 hover:bg-green-100 dark:hover:bg-green-900"
            onClick={() => setShowBanner(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters */}
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
            onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Table or Empty */}
      {!isLoading && invoices.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No invoices yet"
          description="Invoices are generated automatically when orders are paid. They will appear here once you have paid orders."
        />
      ) : (
        <DataTable
          columns={columns}
          data={invoices}
          isLoading={isLoading}
          emptyMessage="No invoices match your filters."
        />
      )}

      {/* Detail dialog */}
      <InvoiceDetailDialog
        orderId={detailOrderId}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailOrderId(null);
        }}
      />
    </div>
  );
}
