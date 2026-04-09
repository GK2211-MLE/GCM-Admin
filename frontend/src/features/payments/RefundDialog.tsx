import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRefundPayment } from './api';
import type { PaymentRecord } from './types';

interface RefundDialogProps {
  payment: PaymentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RefundDialog({ payment, open, onOpenChange }: RefundDialogProps) {
  const [reason, setReason] = useState('');
  const refund = useRefundPayment();

  const handleConfirm = () => {
    if (!payment) return;
    refund.mutate(
      { orderId: payment.id, reason: reason || undefined },
      {
        onSuccess: () => {
          setReason('');
          onOpenChange(false);
        },
      },
    );
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setReason('');
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Refund</DialogTitle>
          <DialogDescription>
            Are you sure you want to refund order{' '}
            <strong>{payment?.orderCode}</strong> for{' '}
            <strong>{payment ? formatCurrency(payment.amount / 100) : ''}</strong> to{' '}
            <strong>{payment?.customerName}</strong>?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label
            htmlFor="refund-reason"
            className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
          >
            Reason (optional)
          </label>
          <textarea
            id="refund-reason"
            className="w-full rounded-md border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500/40 min-h-[80px] resize-none"
            placeholder="Enter reason for refund..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={refund.isPending}
          >
            {refund.isPending ? 'Processing...' : 'Confirm Refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
