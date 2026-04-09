import { useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';
import {
  ArrowLeft, XCircle, RefreshCw, Phone, Clock, User, Package,
  CheckCircle2, Circle, Truck, CreditCard, MapPin, AlertTriangle,
} from 'lucide-react';
import { useOrder, useUpdateOrderStatus } from './api';
import type { OrderStatus } from './types';
import {
  STATUS_LABELS, STATUS_VARIANT, STATUS_FLOW, PAYMENT_LABELS,
  getOrderDisplayId,
} from './types';

interface TimelineEvent {
  status: string;
  label: string;
  description: string;
  completed: boolean;
  current: boolean;
}

export function OrderDetailPage() {
  const { code } = useParams<{ code: string }>();
  const { data: order, isLoading, isError } = useOrder(code ?? '');

  const [statusUpdateOpen, setStatusUpdateOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus | ''>('');
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const updateStatus = useUpdateOrderStatus();

  // Build timeline
  const timeline: TimelineEvent[] = useMemo(() => {
    if (!order) return [];
    const currentIdx = STATUS_FLOW.indexOf(order.status as OrderStatus);
    const isCancelled = order.status === 'cancelled';

    const events: TimelineEvent[] = [
      {
        status: 'pending_payment', label: 'Pending Payment',
        description: `Order placed${order.customer?.name ? ` by ${order.customer.name}` : ''}`,
        completed: true, current: order.status === 'pending_payment',
      },
      {
        status: 'confirmed', label: 'Confirmed',
        description: 'Payment received, order confirmed',
        completed: currentIdx >= 1, current: order.status === 'confirmed',
      },
      {
        status: 'processing', label: 'Processing',
        description: 'Order is being prepared',
        completed: currentIdx >= 2, current: order.status === 'processing',
      },
      {
        status: 'ready', label: 'Ready',
        description: order.deliveryMethod === 'delivery' ? 'Ready for dispatch' : 'Ready for pickup',
        completed: currentIdx >= 3, current: order.status === 'ready',
      },
      {
        status: 'out_for_delivery', label: 'Out for Delivery',
        description: 'Order is on the way',
        completed: currentIdx >= 4, current: order.status === 'out_for_delivery',
      },
      {
        status: 'delivered', label: 'Delivered',
        description: 'Order delivered successfully',
        completed: currentIdx >= 5, current: order.status === 'delivered',
      },
    ];

    // For pickup orders, skip out_for_delivery
    const filtered = order.deliveryMethod === 'pickup'
      ? events.filter((e) => e.status !== 'out_for_delivery')
      : events;

    if (isCancelled) {
      return [
        filtered[0],
        {
          status: 'cancelled', label: 'Cancelled',
          description: order.notes ? `Reason: ${order.notes}` : 'This order has been cancelled',
          completed: true, current: true,
        },
      ];
    }

    return filtered;
  }, [order]);

  const handleStatusUpdate = useCallback(() => {
    if (!newStatus || !order) return;
    updateStatus.mutate(
      { id: order.id, status: newStatus },
      { onSuccess: () => { setStatusUpdateOpen(false); setNewStatus(''); } },
    );
  }, [order, newStatus, updateStatus]);

  const handleCancel = useCallback(() => {
    if (!order) return;
    updateStatus.mutate(
      { id: order.id, status: 'cancelled', notes: cancelReason.trim() || undefined },
      { onSuccess: () => { setCancelConfirm(false); setCancelReason(''); } },
    );
  }, [order, updateStatus, cancelReason]);

  const handleQuickAdvance = useCallback((targetStatus: OrderStatus) => {
    if (!order) return;
    updateStatus.mutate({ id: order.id, status: targetStatus });
  }, [order, updateStatus]);

  if (isLoading) return <LoadingSpinner className="h-64" />;

  if (isError || !order) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Order Not Found"
          actions={
            <Link to="/orders">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
              </Button>
            </Link>
          }
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-[var(--text-secondary)]">The requested order could not be found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isActive = order.status !== 'cancelled' && order.status !== 'delivered';
  const displayId = getOrderDisplayId(order);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${displayId}`}
        description={`Placed on ${formatDate(order.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[order.status] ?? 'default'} className="text-sm px-3 py-1">
              {STATUS_LABELS[order.status as OrderStatus] ?? order.status}
            </Badge>
            <Link to="/orders">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            </Link>
          </div>
        }
      />

      {/* Workflow Action Bar */}
      {isActive && (
        <Card className="border-primary-500/20 bg-primary-500/[0.02]">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-2">
              {order.status === 'pending_payment' && (
                <Button size="sm" onClick={() => handleQuickAdvance('confirmed')} className="bg-success text-white hover:bg-success/90">
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Confirm Order
                </Button>
              )}
              {order.status === 'confirmed' && (
                <Button size="sm" onClick={() => handleQuickAdvance('processing')} className="bg-info text-white hover:bg-info/90">
                  <Package className="mr-2 h-4 w-4" /> Start Processing
                </Button>
              )}
              {order.status === 'processing' && (
                <Button size="sm" onClick={() => handleQuickAdvance('ready')} className="bg-success text-white hover:bg-success/90">
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Ready
                </Button>
              )}
              {order.status === 'ready' && order.deliveryMethod === 'delivery' && (
                <Button size="sm" onClick={() => handleQuickAdvance('out_for_delivery')} className="bg-info text-white hover:bg-info/90">
                  <Truck className="mr-2 h-4 w-4" /> Out for Delivery
                </Button>
              )}
              {((order.status === 'ready' && order.deliveryMethod === 'pickup') || order.status === 'out_for_delivery') && (
                <Button size="sm" onClick={() => handleQuickAdvance('delivered')} className="bg-success text-white hover:bg-success/90">
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Delivered
                </Button>
              )}

              <div className="h-6 w-px bg-[var(--border-default)] mx-1 hidden sm:block" />

              <Button variant="outline" size="sm" onClick={() => setStatusUpdateOpen(true)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Change Status
              </Button>

              <div className="flex-1" />

              <Button variant="destructive" size="sm" onClick={() => setCancelConfirm(true)}>
                <XCircle className="mr-2 h-4 w-4" /> Cancel Order
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Line Items + Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-[var(--text-tertiary)]" /> Line Items
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-[var(--border-default)] bg-[var(--surface-tertiary)]">
                      <th className="px-6 py-3 text-left font-medium text-[var(--text-tertiary)]">Product</th>
                      <th className="px-6 py-3 text-right font-medium text-[var(--text-tertiary)]">Qty</th>
                      <th className="px-6 py-3 text-right font-medium text-[var(--text-tertiary)]">Unit Price</th>
                      <th className="px-6 py-3 text-right font-medium text-[var(--text-tertiary)]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, idx) => (
                      <tr
                        key={item.id}
                        className={cn(
                          'transition-colors hover:bg-[var(--surface-tertiary)]',
                          idx < order.items.length - 1 && 'border-b border-[var(--border-default)]',
                        )}
                      >
                        <td className="px-6 py-3.5 font-medium text-[var(--text-primary)]">
                          {item.productName}
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums text-[var(--text-secondary)]">
                          {item.quantity}
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums text-[var(--text-secondary)]">
                          {formatCurrency(item.unitPrice / 100)}
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums font-medium text-[var(--text-primary)]">
                          {formatCurrency(item.total / 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Totals */}
              <div className="border-t border-[var(--border-default)] px-6 py-4">
                <div className="max-w-xs ml-auto space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(order.subtotal / 100)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Tax</span>
                    <span className="tabular-nums">{formatCurrency(order.tax / 100)}</span>
                  </div>
                  {order.deliveryFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Delivery Fee</span>
                      <span className="tabular-nums">{formatCurrency(order.deliveryFee / 100)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold border-t border-[var(--border-default)] pt-2">
                    <span>Total</span>
                    <span className="tabular-nums text-primary-500">{formatCurrency(order.total / 100)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-[var(--text-tertiary)]" /> Order Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {timeline.map((event, idx) => {
                  const isLast = idx === timeline.length - 1;
                  const isCancelEvent = event.status === 'cancelled';
                  return (
                    <div key={`${event.status}-${idx}`} className="flex gap-4 pb-6 last:pb-0">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                          event.current && !isCancelEvent && 'border-primary-500 bg-primary-500 text-white shadow-md',
                          event.current && isCancelEvent && 'border-danger bg-danger text-white shadow-md',
                          event.completed && !event.current && 'border-success bg-success text-white',
                          !event.completed && !event.current && 'border-[var(--border-default)] bg-[var(--surface-secondary)] text-[var(--text-tertiary)]',
                        )}>
                          {event.completed && !event.current ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : isCancelEvent ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            <Circle className="h-4 w-4" />
                          )}
                        </div>
                        {!isLast && (
                          <div className={cn(
                            'w-0.5 flex-1 mt-1',
                            event.completed ? 'bg-success' : 'bg-[var(--border-default)]',
                          )} />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <p className={cn(
                          'text-sm font-semibold',
                          !event.completed && !event.current && 'text-[var(--text-tertiary)]',
                        )}>
                          {event.label}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{event.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right - Customer & Order Info */}
        <div className="space-y-6">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-[var(--text-tertiary)]" /> Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {order.customer?.name || 'Unknown'}
              </p>
              {order.customer?.phone && (
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{order.customer.phone}</span>
                </div>
              )}
              {order.customer?.email && (
                <p className="text-sm text-[var(--text-secondary)]">{order.customer.email}</p>
              )}
            </CardContent>
          </Card>

          {/* Order Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4 text-[var(--text-tertiary)]" /> Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Payment Method</p>
                <p className="text-sm font-medium mt-1">
                  {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod ?? 'N/A'}
                </p>
              </div>
              <div className="border-t border-[var(--border-default)] pt-4">
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Payment Status</p>
                <Badge
                  variant={order.paymentStatus === 'paid' ? 'success' : 'warning'}
                  className="mt-1"
                >
                  {(order.paymentStatus || 'pending').charAt(0).toUpperCase() + (order.paymentStatus || 'pending').slice(1)}
                </Badge>
              </div>
              <div className="border-t border-[var(--border-default)] pt-4">
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Delivery Method</p>
                <Badge variant={order.deliveryMethod === 'delivery' ? 'info' : 'default'} className="mt-1">
                  {order.deliveryMethod === 'delivery' ? 'Home Delivery' : 'Store Pickup'}
                </Badge>
              </div>
              {order.deliveryAddress && (
                <div className="border-t border-[var(--border-default)] pt-4">
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Delivery Address</p>
                  <div className="flex items-start gap-2 mt-1">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 text-[var(--text-tertiary)]" />
                    <p className="text-sm">{(() => {
                      try {
                        const addr = typeof order.deliveryAddress === 'string' ? JSON.parse(order.deliveryAddress) : order.deliveryAddress;
                        if (addr && typeof addr === 'object' && addr.street) {
                          return [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
                        }
                        return String(order.deliveryAddress);
                      } catch {
                        return String(order.deliveryAddress);
                      }
                    })()}</p>
                  </div>
                </div>
              )}
              {order.location && (
                <div className="border-t border-[var(--border-default)] pt-4">
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
                    {order.deliveryMethod === 'delivery' ? 'Dispatched From' : 'Pickup Location'}
                  </p>
                  <p className="text-sm font-medium mt-1">{order.location.name}</p>
                </div>
              )}
              {order.notes && (
                <div className="border-t border-[var(--border-default)] pt-4">
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Notes</p>
                  <p className="text-sm mt-1 text-[var(--text-secondary)]">{order.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card className="bg-[var(--surface-tertiary)]">
            <CardContent className="pt-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Order Code</span>
                <span className="font-mono text-xs">{order.orderCode}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Created</span>
                <span>{formatDate(order.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Items</span>
                <span>{order.items.length} products</span>
              </div>
              {order.rating && (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Rating</span>
                  <span>{'★'.repeat(order.rating)}{'☆'.repeat(5 - order.rating)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Update Status Dialog */}
      <Dialog open={statusUpdateOpen} onOpenChange={(open) => { if (!open) { setStatusUpdateOpen(false); setNewStatus(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Change status for {displayId}. Current: <strong>{STATUS_LABELS[order.status as OrderStatus] ?? order.status}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newStatus} onValueChange={(val) => setNewStatus(val as OrderStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Select new status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FLOW.map((s) => (
                  <SelectItem key={s} value={s} disabled={s === order.status}>
                    {STATUS_LABELS[s]}{s === order.status ? ' (current)' : ''}
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

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelConfirm} onOpenChange={(open) => { if (!open) { setCancelConfirm(false); setCancelReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-danger" /> Cancel Order
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel <strong>{displayId}</strong> worth{' '}
              <strong>{formatCurrency(order.total / 100)}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-[var(--text-primary)]">Cancellation Reason</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer requested cancellation..."
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelConfirm(false); setCancelReason(''); }}>
              Keep Order
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
