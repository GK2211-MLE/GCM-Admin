import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { DashboardSummary } from './api';

const BAR_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'];

interface PopularProductsProps {
  topProducts: DashboardSummary['topProducts'];
}

/* Custom tooltip matching the B2B screenshot style */
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullName: string; orders: number; quantity: number } }> }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div
      className="rounded-lg border bg-white px-3 py-2 shadow-lg"
      style={{
        borderColor: '#e5e7eb',
      }}
    >
      <p className="text-sm font-semibold text-gray-900">{data.fullName}</p>
      <p className="text-sm font-bold text-gray-900">{data.orders} orders</p>
      <p className="text-xs text-gray-500">{data.quantity} total qty</p>
    </div>
  );
}

export function PopularProducts({ topProducts }: PopularProductsProps) {
  const data = (topProducts || []).map((p) => ({
    name: p.productName.length > 20 ? p.productName.slice(0, 18) + '...' : p.productName,
    fullName: p.productName,
    orders: Number(p.orderCount),
    quantity: Number(p.totalQty),
  }));

  // Find max for XAxis domain
  const maxOrders = Math.max(...data.map((d) => d.orders), 1);
  // Round up to nearest nice number for axis
  const xMax = Math.ceil(maxOrders / 5) * 5 || 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-border-default bg-surface-secondary p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Popular Products</h3>
        <Badge variant="info">By Orders</Badge>
      </div>

      {data.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
              barCategoryGap="25%"
            >
              <XAxis
                type="number"
                stroke="var(--color-text-tertiary, #9ca3af)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, xMax]}
                tickFormatter={(v) => String(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="var(--color-text-tertiary, #9ca3af)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={140}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'transparent' }}
              />
              <Bar
                dataKey="orders"
                radius={[0, 6, 6, 0]}
                animationDuration={1800}
                maxBarSize={28}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend list below chart */}
          <div className="mt-4 space-y-2">
            {data.map((item, i) => (
              <motion.div
                key={item.fullName}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 + i * 0.06 }}
                className="flex items-center gap-2 text-xs"
              >
                <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                <span className="flex-1 text-text-secondary">{item.fullName}</span>
                <span className="font-medium text-text-primary">{item.orders} orders</span>
                <span className="text-text-tertiary">({item.quantity} qty)</span>
              </motion.div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex h-[220px] items-center justify-center text-sm text-text-tertiary">
          No product data
        </div>
      )}
    </motion.div>
  );
}
