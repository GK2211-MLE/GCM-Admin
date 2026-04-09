import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, ShoppingCart, Clock, Users } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import type { DashboardSummary } from './api';

// Animated counter hook
function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = ref.current;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (target - start) * eased);
      setValue(current);
      if (progress < 1) requestAnimationFrame(tick);
      else ref.current = target;
    }

    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
}

// Generate sparkline data from daily revenue
function generateSparkline(dailyRevenue: DashboardSummary['dailyRevenue']) {
  if (!dailyRevenue?.length) {
    return Array.from({ length: 7 }, (_, i) => ({ x: i, y: Math.random() * 50 + 20 }));
  }
  const last7 = dailyRevenue.slice(-7);
  return last7.map((d, i) => ({ x: i, y: d.revenue / 100 }));
}

interface KPICardProps {
  title: string;
  value: number;
  isCurrency?: boolean;
  growth: number;
  growthLabel?: string;
  color: 'emerald' | 'blue' | 'amber' | 'rose';
  icon: typeof DollarSign;
  sparkData: Array<{ x: number; y: number }>;
  delay: number;
}

const colorMap = {
  emerald: { stroke: '#10b981', fill: '#10b98130', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: 'text-emerald-500' },
  blue: { stroke: '#3b82f6', fill: '#3b82f630', bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'text-blue-500' },
  amber: { stroke: '#f59e0b', fill: '#f59e0b30', bg: 'bg-amber-500/10', text: 'text-amber-400', icon: 'text-amber-500' },
  rose: { stroke: '#f43f5e', fill: '#f43f5e30', bg: 'bg-rose-500/10', text: 'text-rose-400', icon: 'text-rose-500' },
};

function KPICard({ title, value, isCurrency, growth, growthLabel, color, icon: Icon, sparkData, delay }: KPICardProps) {
  const animatedValue = useCountUp(isCurrency ? Math.round(value / 100) : value);
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="group relative overflow-hidden rounded-xl border border-border-default bg-surface-secondary p-5 transition-all hover:border-border-hover">
        {/* Hover gradient accent */}
        <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full ${c.bg} opacity-0 blur-2xl transition-opacity group-hover:opacity-100`} />

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className={`rounded-lg p-2 ${c.bg}`}>
                <Icon className={`h-4 w-4 ${c.icon}`} />
              </div>
              <span className="text-xs font-medium text-text-secondary">{title}</span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-text-primary">
              {isCurrency ? `$${animatedValue.toLocaleString()}` : animatedValue.toLocaleString()}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              {growth !== 0 ? (
                <>
                  <span className={`text-xs font-medium ${growth > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {growth > 0 ? '↑' : '↓'} {Math.abs(growth)}%
                  </span>
                  <span className="text-xs text-text-tertiary">{growthLabel || 'vs last week'}</span>
                </>
              ) : (
                <span className="text-xs text-text-tertiary">No change</span>
              )}
            </div>
          </div>

          {/* Sparkline */}
          <div className="h-12 w-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData}>
                <defs>
                  <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.stroke} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={c.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="y"
                  stroke={c.stroke}
                  fill={`url(#spark-${color})`}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Loading skeleton
function KPISkeleton() {
  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-surface-tertiary" />
            <div className="h-3 w-20 animate-pulse rounded bg-surface-tertiary" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded bg-surface-tertiary" />
          <div className="h-3 w-24 animate-pulse rounded bg-surface-tertiary" />
        </div>
        <div className="h-12 w-20 animate-pulse rounded bg-surface-tertiary" />
      </div>
    </div>
  );
}

interface KPISectionProps {
  summary: DashboardSummary | undefined;
  isLoading: boolean;
}

export function KPISection({ summary, isLoading }: KPISectionProps) {
  if (isLoading || !summary) {
    return (
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <KPISkeleton key={i} />)}
      </div>
    );
  }

  const sparkData = generateSparkline(summary.dailyRevenue);
  // Vary spark data slightly for each card
  const orderSpark = sparkData.map((d, i) => ({ ...d, y: summary.dailyRevenue?.[summary.dailyRevenue.length - 7 + i]?.count || d.y / 10 }));
  const pendingSpark = sparkData.map((d) => ({ ...d, y: Math.max(1, d.y * 0.3) }));
  const customerSpark = sparkData.map((d) => ({ ...d, y: Math.max(1, d.y * 0.5 + Math.random() * 5) }));

  const kpis: KPICardProps[] = [
    {
      title: 'Total Revenue',
      value: summary.totalRevenue,
      isCurrency: true,
      growth: summary.revenueGrowth,
      color: 'emerald',
      icon: DollarSign,
      sparkData,
      delay: 0,
    },
    {
      title: 'Total Orders',
      value: summary.totalOrders,
      growth: summary.ordersGrowth,
      color: 'blue',
      icon: ShoppingCart,
      sparkData: orderSpark,
      delay: 0.1,
    },
    {
      title: 'Pending Orders',
      value: summary.pendingCount,
      growth: summary.pendingCount > 0 ? Math.round((summary.pendingCount / Math.max(summary.totalOrders, 1)) * 100) : 0,
      growthLabel: 'of total',
      color: 'amber',
      icon: Clock,
      sparkData: pendingSpark,
      delay: 0.2,
    },
    {
      title: 'Active Customers',
      value: summary.totalCustomers,
      growth: summary.totalCustomers > 0 ? Math.round((summary.todayOrders / Math.max(summary.totalCustomers, 1)) * 100) : 0,
      growthLabel: 'ordered today',
      color: 'rose',
      icon: Users,
      sparkData: customerSpark,
      delay: 0.3,
    },
  ];

  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <KPICard key={kpi.title} {...kpi} />
      ))}
    </div>
  );
}
