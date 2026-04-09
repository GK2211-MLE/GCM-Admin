import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { DashboardSummary } from './api';

interface RevenueChartProps {
  dailyRevenue: DashboardSummary['dailyRevenue'];
  totalRevenue: number;
}

export function RevenueChart({ dailyRevenue, totalRevenue }: RevenueChartProps) {
  const data = (dailyRevenue || []).map((d) => ({
    date: d.date,
    label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
    revenue: d.revenue / 100,
  }));

  const dailyAvg = data.length > 0 ? data.reduce((sum, d) => sum + d.revenue, 0) / data.length : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-border-default bg-surface-secondary p-6"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Revenue Overview</h3>
          <p className="text-xs text-text-tertiary">Revenue by order date</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-lg font-bold text-text-primary">{formatCurrency(totalRevenue / 100)}</p>
            <p className="text-xs text-text-tertiary">Total revenue</p>
          </div>
          <div className="h-8 w-px bg-border-default" />
          <div className="flex items-center gap-1.5 text-right">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-text-primary">${dailyAvg.toFixed(0)}</p>
              <p className="text-xs text-text-tertiary">Daily avg</p>
            </div>
          </div>
        </div>
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default)" opacity={0.5} />
            <XAxis
              dataKey="label"
              stroke="var(--color-text-tertiary)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              interval={data.length > 14 ? 2 : 0}
            />
            <YAxis
              stroke="var(--color-text-tertiary)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border-default)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontSize: '12px',
              }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#revenueGrad)"
              animationDuration={2000}
              animationEasing="ease-out"
              dot={false}
              activeDot={{ r: 5, stroke: '#3b82f6', strokeWidth: 2, fill: 'var(--color-surface-secondary)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[280px] items-center justify-center text-sm text-text-tertiary">
          No order data available
        </div>
      )}
    </motion.div>
  );
}
