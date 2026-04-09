import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  pending_payment: '#94a3b8',
  confirmed: '#38bdf8',
  processing: '#3b82f6',
  ready: '#94a3b8',
  out_for_delivery: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pending_payment',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

interface OrderStatusChartProps {
  statusBreakdown: Record<string, number>;
}

export function OrderStatusChart({ statusBreakdown }: OrderStatusChartProps) {
  const data = Object.entries(statusBreakdown)
    .map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      status,
      value: Number(count),
      color: STATUS_COLORS[status] || '#6b7280',
    }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-border-default bg-surface-secondary p-6 h-full"
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">Order Status</h3>
        <p className="text-xs text-text-tertiary mt-0.5">Distribution of current orders</p>
      </div>

      {data.length > 0 ? (
        <div className="flex flex-col items-center">
          {/* Donut chart with center text */}
          <div className="relative h-[200px] w-[200px] mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  dataKey="value"
                  paddingAngle={2}
                  strokeWidth={0}
                  animationDuration={1500}
                  animationBegin={400}
                >
                  {data.map((entry) => (
                    <Cell key={entry.status} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-elevated, #fff)',
                    border: '1px solid var(--color-border-default, #e5e7eb)',
                    borderRadius: '8px',
                    color: 'var(--color-text-primary, #111)',
                    fontSize: '12px',
                  }}
                  formatter={(value, name) => {
                    const v = Number(value);
                    const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
                    return [`${v} (${pct}%)`, String(name)];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center text */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-text-primary">{total}</span>
              <span className="text-xs text-text-tertiary">Total Orders</span>
            </div>
          </div>

          {/* Legend - two columns below chart */}
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 w-full">
            {data.map((item) => (
              <div key={item.status} className="flex items-center gap-2 text-sm">
                <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-text-secondary flex-1 truncate">{item.name}</span>
                <span className="font-semibold tabular-nums text-text-primary">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center text-sm text-text-tertiary">
          No order data
        </div>
      )}
    </motion.div>
  );
}
