import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Download, ShoppingCart, DollarSign, Truck, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { useDashboardSummary } from './api';
import { KPISection } from './KPISection';
import { RevenueChart } from './RevenueChart';
import { OrderStatusChart } from './OrderStatusChart';
import { RecentOrders } from './RecentOrders';
import { PopularProducts } from './PopularProducts';
import { PendingActions } from './PendingActions';


function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getDateString(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const { data: summary, isLoading } = useDashboardSummary();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleExport = () => {
    if (!summary) return;
    const rows = [
      ['Metric', 'Value'],
      ['Total Revenue', formatCurrency(summary.totalRevenue / 100)],
      ['Total Orders', String(summary.totalOrders)],
      ['Today Orders', String(summary.todayOrders)],
      ['Today Revenue', formatCurrency(summary.todayRevenue / 100)],
      ['Total Customers', String(summary.totalCustomers)],
      ['Active Products', String(summary.totalProducts)],
      ['Pending Orders', String(summary.pendingCount)],
      ['Active Deliveries', String(summary.activeDeliveries)],
      ['Revenue Growth (WoW)', `${summary.revenueGrowth}%`],
      ['Orders Growth (WoW)', `${summary.ordersGrowth}%`],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gcm-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Today's activity computed
  const pickupCount = summary?.deliveryMethodBreakdown?.['pickup'] || 0;
  const deliveryCount = summary?.deliveryMethodBreakdown?.['delivery'] || 0;

  return (
    <div>
      {/* Greeting & Controls */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 flex flex-wrap items-start justify-between gap-4"
      >
        {/* LEFT: Greeting */}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-primary">
            {getGreeting()} 👋
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Here's what's happening with your fresh meat business today.
          </p>
        </div>

        {/* RIGHT: Date + Refresh + Export */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-surface-tertiary px-3 py-1 text-xs text-text-secondary">
            {getDateString()}
          </span>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!summary}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <KPISection summary={summary} isLoading={isLoading} />

      {/* Today's Activity */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8 grid gap-4 grid-cols-2 md:grid-cols-4"
      >
        <TodayCard
          icon={ShoppingCart}
          label="Orders Today"
          value={String(summary?.todayOrders ?? 0)}
          color="bg-blue-500/10 text-blue-400"
        />
        <TodayCard
          icon={DollarSign}
          label="Revenue Today"
          value={formatCurrency((summary?.todayRevenue ?? 0) / 100)}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <TodayCard
          icon={Truck}
          label="Home Delivery"
          value={String(deliveryCount)}
          color="bg-cyan-500/10 text-cyan-400"
        />
        <TodayCard
          icon={Store}
          label="Store Pickup"
          value={String(pickupCount)}
          color="bg-violet-500/10 text-violet-400"
        />
      </motion.div>

      {/* Revenue Chart (full width) */}
      <div className="mb-8">
        <RevenueChart
          dailyRevenue={summary?.dailyRevenue || []}
          totalRevenue={summary?.totalRevenue || 0}
        />
      </div>

      {/* Order Status + Recent Orders */}
      <div className="mb-8 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <OrderStatusChart statusBreakdown={summary?.statusBreakdown || {}} />
        </div>
        <div className="lg:col-span-3">
          <RecentOrders orders={summary?.recentOrders || []} />
        </div>
      </div>

      {/* Popular Products */}
      <div className="mb-8">
        <PopularProducts topProducts={summary?.topProducts || []} />
      </div>

      {/* Pending Actions */}
      <div className="mb-8">
        <motion.h3
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mb-4 text-sm font-semibold text-text-primary"
        >
          Pending Actions
        </motion.h3>
        {summary ? (
          <PendingActions summary={summary} />
        ) : null}
      </div>
    </div>
  );
}

function TodayCard({ icon: Icon, label, value, color }: {
  icon: typeof ShoppingCart;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-text-tertiary">{label}</p>
          <p className="text-lg font-bold text-text-primary">{value}</p>
        </div>
      </div>
    </div>
  );
}
