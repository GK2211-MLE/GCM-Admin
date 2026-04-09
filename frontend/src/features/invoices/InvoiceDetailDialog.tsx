import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useInvoice } from './api';
import { ExternalLink, Loader2 } from 'lucide-react';

const PAYMENT_LABELS: Record<string, string> = {
  stripe: 'Card (Stripe)',
  cod: 'Cash on Delivery',
  pay_at_store: 'Pay at Store',
};

interface InvoiceDetailDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceDetailDialog({ orderId, open, onOpenChange }: InvoiceDetailDialogProps) {
  const { data: invoice, isLoading } = useInvoice(orderId || '');

  const handlePrintDownload = async () => {
    if (!orderId) return;
    try {
      const { data: html } = await apiClient.get(`/invoices/${orderId}/html`, { responseType: 'text' });
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
    } catch {
      // Fallback
      window.open(`/api/invoices/${orderId}/html`, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invoice Details</DialogTitle>
          <DialogDescription>
            {invoice ? invoice.invoiceNumber : 'Loading...'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : invoice ? (
          <div className="space-y-5">
            {/* Header info */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  {invoice.invoiceNumber}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {formatDate(invoice.createdAt)}
                </p>
              </div>
              <Badge variant="success">Paid</Badge>
            </div>

            {/* Customer */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                Customer
              </p>
              <p className="text-sm font-medium text-[var(--text-primary)]">{invoice.customerName}</p>
              {invoice.customerPhone && (
                <p className="text-sm text-[var(--text-secondary)]">{invoice.customerPhone}</p>
              )}
              {invoice.customerEmail && (
                <p className="text-sm text-[var(--text-secondary)]">{invoice.customerEmail}</p>
              )}
            </div>

            {/* Line items */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                Items
              </p>
              <div className="rounded-lg border border-[var(--border-default)] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--surface-tertiary)]">
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-tertiary)]">Product</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-[var(--text-tertiary)]">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-[var(--text-tertiary)]">Price</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-[var(--text-tertiary)]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, idx) => (
                      <tr key={idx} className="border-t border-[var(--border-default)]">
                        <td className="px-3 py-2 text-sm text-[var(--text-primary)]">{item.productName}</td>
                        <td className="px-3 py-2 text-sm text-center text-[var(--text-secondary)] tabular-nums">{item.quantity}</td>
                        <td className="px-3 py-2 text-sm text-right text-[var(--text-secondary)] tabular-nums">{formatCurrency(item.unitPrice / 100)}</td>
                        <td className="px-3 py-2 text-sm text-right font-medium text-[var(--text-primary)] tabular-nums">{formatCurrency(item.total / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-52 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="tabular-nums text-[var(--text-primary)]">{formatCurrency(invoice.subtotal / 100)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Tax</span>
                  <span className="tabular-nums text-[var(--text-primary)]">{formatCurrency(invoice.tax / 100)}</span>
                </div>
                {invoice.deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Delivery Fee</span>
                    <span className="tabular-nums text-[var(--text-primary)]">{formatCurrency(invoice.deliveryFee / 100)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold border-t border-[var(--border-default)] pt-1">
                  <span className="text-[var(--text-primary)]">Total</span>
                  <span className="tabular-nums text-[var(--text-primary)]">{formatCurrency(invoice.total / 100)}</span>
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-secondary)]">Payment:</span>
              <Badge variant="info">
                {PAYMENT_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod}
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)] py-8 text-center">Invoice not found.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handlePrintDownload} disabled={!invoice}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Print / Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
