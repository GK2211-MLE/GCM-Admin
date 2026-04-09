import { motion } from 'framer-motion';
import { Link } from 'react-router';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';
import type { DashboardSummary } from './api';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  delivered: { label: 'Delivered', bg: 'bg-emerald-500/15', text: 'text-emerald-600' },
  out_for_delivery: { label: 'In Transit', bg: 'bg-cyan-500/15', text: 'text-cyan-600' },
  ready: { label: 'Ready', bg: 'bg-violet-500/15', text: 'text-violet-600' },
  processing: { label: 'Processing', bg: 'bg-blue-500/15', text: 'text-blue-600' },
  confirmed: { label: 'Confirmed', bg: 'bg-blue-500/15', text: 'text-blue-600' },
  pending_payment: { label: 'Pending', bg: 'bg-amber-500/15', text: 'text-amber-600' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-500/15', text: 'text-red-600' },
};

interface RecentOrdersProps {
  orders: DashboardSummary['recentOrders'];
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-border-default bg-surface-secondary p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Recent Orders</h3>
          <p className="text-xs text-text-tertiary mt-0.5">Latest 10 orders</p>
        </div>
        <Link
          to="/orders"
          className="flex items-center gap-1 text-xs font-medium text-primary-400 transition-colors hover:text-primary-300"
        >
          View All <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {orders && orders.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default">
                <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">Order #</th>
                <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">Customer</th>
                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">Total</th>
                <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary pl-4">Status</th>
                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, i) => {
                const cfg = STATUS_CONFIG[order.status] || { label: order.status, bg: 'bg-gray-500/15', text: 'text-gray-600' };
                return (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.7 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                    className="border-b border-border-default/50 transition-colors hover:bg-surface-tertiary/50"
                  >
                    <td className="py-2.5">
                      <Link to={`/orders/${order.id}`} className="font-medium text-primary-400 hover:underline">
                        {order.orderCode}
                      </Link>
                    </td>
                    <td className="py-2.5">
                      <span className="max-w-[180px] truncate text-text-primary">
                        {order.customerName || 'Walk-in'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-text-primary">
                      {formatCurrency(order.total / 100)}
                    </td>
                    <td className="py-2.5 pl-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-xs text-text-tertiary whitespace-nowrap">
                      {formatRelativeTime(order.createdAt)}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center text-sm text-text-tertiary">
          No orders yet
        </div>
      )}
    </motion.div>
  );
}
