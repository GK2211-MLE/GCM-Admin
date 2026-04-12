import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp, TrendingDown, ShoppingCart, Users, DollarSign, Package,
  ArrowUpRight, ArrowDownRight, MapPin, Truck, CreditCard, BarChart3,
  ChevronRight, X, Calendar,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const STATUS_COLORS: Record<string, string> = {
  pending_payment: '#f59e0b',
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  ready: '#06b6d4',
  out_for_delivery: '#f97316',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

// ── Time range presets ─────────────────────────────────────────
const TIME_RANGES = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: '90d', label: '90 Days', days: 90 },
  { key: 'all', label: 'All Time', days: null },
] as const;

type RangeKey = (typeof TIME_RANGES)[number]['key'];

function getDateFrom(key: RangeKey): string | undefined {
  const preset = TIME_RANGES.find((r) => r.key === key);
  if (!preset || preset.days === null) return undefined;
  const d = new Date();
  if (preset.days === 0) {
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(d.getDate() - preset.days);
  }
  return d.toISOString();
}

// ── Types ──────────────────────────────────────────────────────
interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  avgOrderValue: number;
  revenueGrowth: number;
  ordersGrowth: number;
  ordersByStatus: { status: string; count: number }[];
  ordersByDelivery: { method: string; count: number }[];
  ordersByPayment: { method: string; count: number }[];
  dailyRevenue: { date: string; revenue: number; orders: number }[];
  revenueByMonth: { month: string; revenue: number; orders: number }[];
  topProducts: { productId: string; name: string; revenue: number; quantity: number; orderCount: number }[];
  recentOrders: { id: string; orderCode: string; total: number; status: string; paymentMethod: string; deliveryMethod: string; createdAt: string }[];
  ordersBySource: { source: string; count: number; revenue: number }[];
}

interface ProductDrillDown {
  product: { id: string; name: string; imageUrl: string; category: string; pricePerUnit: number } | null;
  totalRevenue: number;
  totalQuantity: number;
  totalOrders: number;
  avgQuantityPerOrder: number;
  daily: { date: string; revenue: number; quantity: number; orders: number }[];
  byLocation: { locationId: string | null; locationName: string; revenue: number; quantity: number; orders: number }[];
}

// ── Page ───────────────────────────────────────────────────────
export function AnalyticsPage() {
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<RangeKey>('30d');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const dateFrom = getDateFrom(timeRange);

  const { data: locationsList } = useQuery({
    queryKey: queryKeys.settings.locations(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ locations: { id: string; name: string }[] }>('/locations/all');
      return data.locations;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.analytics.summary(), storeFilter, timeRange],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (storeFilter !== 'all') params.locationId = storeFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      const { data } = await apiClient.get<AnalyticsData>('/analytics/summary', { params });
      return data;
    },
  });

  const { data: drillDown, isLoading: drillLoading } = useQuery({
    queryKey: ['analytics', 'product', selectedProductId, storeFilter, timeRange],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (storeFilter !== 'all') params.locationId = storeFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      const { data } = await apiClient.get<ProductDrillDown>(`/analytics/product/${selectedProductId}`, { params });
      return data;
    },
    enabled: !!selectedProductId,
  });

  const storeName = useMemo(() => {
    if (storeFilter === 'all') return null;
    return locationsList?.find((l) => l.id === storeFilter)?.name;
  }, [storeFilter, locationsList]);

  if (isLoading) return <LoadingSpinner className="h-64" />;

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: 'var(--surface-elevated)',
      border: '1px solid var(--border-default)',
      borderRadius: '8px',
      color: 'var(--text-primary)',
      fontSize: '12px',
    },
  };

  const kpis = [
    { label: 'Total Revenue', value: formatCurrency(data?.totalRevenue ?? 0), icon: DollarSign, color: 'bg-emerald-500/10 text-emerald-600', growth: data?.revenueGrowth ?? 0 },
    { label: 'Total Orders', value: String(data?.totalOrders ?? 0), icon: ShoppingCart, color: 'bg-blue-500/10 text-blue-600', growth: data?.ordersGrowth ?? 0 },
    { label: 'Customers', value: String(data?.totalCustomers ?? 0), icon: Users, color: 'bg-violet-500/10 text-violet-600' },
    { label: 'Avg Order Value', value: formatCurrency(data?.avgOrderValue ?? 0), icon: TrendingUp, color: 'bg-amber-500/10 text-amber-600' },
  ];

  const rangeLabel = TIME_RANGES.find((r) => r.key === timeRange)?.label ?? '30 Days';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={storeName ? `Insights for ${storeName}` : 'Business insights and performance metrics'}
        actions={
          <div className="flex items-center gap-3">
            {/* Time range pills */}
            <div className="flex items-center gap-1 rounded-lg border border-(--border-default) bg-(--surface-secondary) p-1">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setTimeRange(r.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    timeRange === r.key
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-tertiary)'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-[200px]">
                <MapPin className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {(locationsList ?? []).map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {storeName && (
        <div className="flex items-center gap-2 text-sm text-(--text-secondary)">
          <MapPin className="h-4 w-4" />
          <span>Filtered by: <strong>{storeName}</strong></span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className={`rounded-xl p-3 ${kpi.color.split(' ')[0]}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color.split(' ')[1]}`} />
                </div>
                {kpi.growth !== undefined && (
                  <div className={`flex items-center gap-1 text-xs font-semibold ${kpi.growth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {kpi.growth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(kpi.growth)}%
                  </div>
                )}
              </div>
              <p className="mt-4 text-2xl font-bold text-(--text-primary)">{kpi.value}</p>
              <p className="mt-1 text-sm text-(--text-tertiary)">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Trend + Order Status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-(--text-tertiary)" />
              Revenue Trend ({rangeLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.dailyRevenue && data.dailyRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.dailyRevenue}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} />
                  <YAxis stroke="var(--text-tertiary)" fontSize={11} tickFormatter={(v) => `$${v}`} />
                  <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-(--text-tertiary)">No revenue data for this period</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Order Status</CardTitle></CardHeader>
          <CardContent>
            {data?.ordersByStatus && data.ordersByStatus.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.ordersByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="status">
                      {data.ordersByStatus.map((entry, idx) => (
                        <Cell key={idx} fill={STATUS_COLORS[entry.status] || COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {data.ordersByStatus.map((s, i) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] || COLORS[i % COLORS.length] }} />
                        <span className="capitalize text-(--text-secondary)">{s.status.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="font-semibold text-(--text-primary)">{s.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-(--text-tertiary)">No orders yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════
          TOP PRODUCTS TABLE + DRILL-DOWN
          ══════════════════════════════════════════════════════════ */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Products — clickable */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-(--text-tertiary)" />
              Top Products ({rangeLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topProducts && data.topProducts.length > 0 ? (
              <div className="divide-y divide-(--border-default)">
                {data.topProducts.map((p, i) => {
                  const isSelected = selectedProductId === p.productId;
                  const maxRev = data.topProducts[0].revenue;
                  const pct = maxRev > 0 ? (p.revenue / maxRev) * 100 : 0;
                  return (
                    <button
                      key={p.productId}
                      onClick={() => setSelectedProductId(isSelected ? null : p.productId)}
                      className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-colors ${
                        isSelected
                          ? 'bg-primary-500/10'
                          : 'hover:bg-(--surface-tertiary)/50'
                      }`}
                    >
                      <span className="text-xs font-bold text-(--text-tertiary) w-5 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-(--text-primary) truncate">{p.name}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-(--surface-tertiary) overflow-hidden">
                          <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-(--text-primary)">{formatCurrency(p.revenue)}</p>
                        <p className="text-[10px] text-(--text-tertiary)">{p.quantity} units · {p.orderCount} orders</p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 text-(--text-tertiary) transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-(--text-tertiary)">No product sales in this period</p>
            )}
          </CardContent>
        </Card>

        {/* Product Drill-Down Panel */}
        <Card>
          <CardContent className="p-6">
            {!selectedProductId ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Package className="h-12 w-12 text-(--text-tertiary)/30 mb-3" />
                <p className="text-sm font-medium text-(--text-secondary)">Select a product to see its sales breakdown</p>
                <p className="text-xs text-(--text-tertiary) mt-1">Click any row in the Top Products table</p>
              </div>
            ) : drillLoading ? (
              <LoadingSpinner className="h-48" />
            ) : drillDown ? (
              <div className="space-y-6">
                {/* Product header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {drillDown.product?.imageUrl && (
                      <img
                        src={drillDown.product.imageUrl}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover border border-(--border-default) shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-(--text-primary) truncate">{drillDown.product?.name}</p>
                      <p className="text-xs text-(--text-tertiary) capitalize">
                        {drillDown.product?.category} · {formatCurrency((drillDown.product?.pricePerUnit ?? 0) / 100)}/unit
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedProductId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Revenue', value: formatCurrency(drillDown.totalRevenue) },
                    { label: 'Units Sold', value: String(drillDown.totalQuantity) },
                    { label: 'Orders', value: String(drillDown.totalOrders) },
                    { label: 'Avg Qty/Order', value: String(drillDown.avgQuantityPerOrder) },
                  ].map((s) => (
                    <div key={s.label} className="text-center p-2 rounded-lg bg-(--surface-tertiary)/50">
                      <p className="text-lg font-bold text-(--text-primary)">{s.value}</p>
                      <p className="text-[10px] text-(--text-tertiary) uppercase tracking-wider">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Daily timeline chart */}
                {drillDown.daily.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-(--text-tertiary) uppercase tracking-wider mb-2">
                      Sales Timeline
                    </p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={drillDown.daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                        <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={10} />
                        <YAxis stroke="var(--text-tertiary)" fontSize={10} tickFormatter={(v) => `$${v}`} />
                        <Tooltip {...tooltipStyle} formatter={(value, name) => [
                          name === 'revenue' ? `$${Number(value).toFixed(2)}` : value,
                          name === 'revenue' ? 'Revenue' : 'Units',
                        ]} />
                        <Bar dataKey="revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-(--text-tertiary)">No daily data</p>
                )}

                {/* Location breakdown */}
                {drillDown.byLocation.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-(--text-tertiary) uppercase tracking-wider mb-2">
                      Sales by Location
                    </p>
                    <div className="space-y-2">
                      {drillDown.byLocation.map((loc) => {
                        const maxLocRev = drillDown.byLocation[0].revenue;
                        const pct = maxLocRev > 0 ? (loc.revenue / maxLocRev) * 100 : 0;
                        return (
                          <div key={loc.locationId ?? 'null'} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-(--text-secondary) truncate">{loc.locationName}</span>
                              <span className="font-semibold shrink-0">{formatCurrency(loc.revenue)} · {loc.quantity} units</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-(--surface-tertiary)">
                              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Delivery / Payment + Monthly Revenue */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-(--text-tertiary)" /> Delivery Methods</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(data?.ordersByDelivery ?? []).map((d) => {
                  const total = (data?.ordersByDelivery ?? []).reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                  return (
                    <div key={d.method} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize text-(--text-secondary)">{d.method === 'pickup' ? 'Store Pickup' : 'Home Delivery'}</span>
                        <span className="font-semibold">{d.count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-(--surface-tertiary)"><div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
                {(!data?.ordersByDelivery || data.ordersByDelivery.length === 0) && (
                  <p className="py-4 text-center text-sm text-(--text-tertiary)">No data</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-(--text-tertiary)" /> Payment Methods</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(data?.ordersByPayment ?? []).map((p) => {
                  const total = (data?.ordersByPayment ?? []).reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
                  const label = p.method === 'cod' ? 'Cash on Delivery' : p.method === 'stripe' ? 'Card (Stripe)' : p.method === 'test_bypass' ? 'Test Bypass' : p.method;
                  return (
                    <div key={p.method} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-(--text-secondary)">{label}</span>
                        <span className="font-semibold">{p.count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-(--surface-tertiary)"><div className="h-2 rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
                {(!data?.ordersByPayment || data.ordersByPayment.length === 0) && (
                  <p className="py-4 text-center text-sm text-(--text-tertiary)">No data</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Monthly Revenue</CardTitle></CardHeader>
          <CardContent>
            {data?.revenueByMonth && data.revenueByMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="month" stroke="var(--text-tertiary)" fontSize={11} />
                  <YAxis stroke="var(--text-tertiary)" fontSize={11} tickFormatter={(v) => `$${v}`} />
                  <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-(--text-tertiary)">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Sources + Recent Orders */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Order Sources</CardTitle></CardHeader>
          <CardContent>
            {data?.ordersBySource && data.ordersBySource.length > 0 ? (
              <div className="space-y-4">
                {data.ordersBySource.map((s) => (
                  <div key={s.source} className="flex items-center justify-between">
                    <Badge variant={s.source === 'whatsapp' ? 'success' : s.source === 'web' ? 'info' : 'default'}>
                      {s.source === 'whatsapp' ? 'WhatsApp' : s.source === 'web' ? 'Website' : s.source === 'app' ? 'App' : s.source}
                    </Badge>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{s.count} orders</p>
                      <p className="text-xs text-(--text-tertiary)">{formatCurrency(s.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-(--text-tertiary)">No data</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
          <CardContent>
            {data?.recentOrders && data.recentOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-(--text-tertiary)">
                      <th className="pb-3 pr-4">Order</th>
                      <th className="pb-3 pr-4">Total</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Payment</th>
                      <th className="pb-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((o) => (
                      <tr key={o.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium"><Link to={`/orders/${o.id}`} className="text-primary-500 hover:underline">{o.orderCode}</Link></td>
                        <td className="py-3 pr-4 font-semibold">{formatCurrency(o.total)}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={o.status === 'delivered' ? 'success' : o.status === 'cancelled' ? 'danger' : 'info'}>
                            {o.status.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 capitalize text-(--text-secondary)">{o.paymentMethod === 'cod' ? 'COD' : o.paymentMethod}</td>
                        <td className="py-3 text-(--text-tertiary)">{formatDate(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-(--text-tertiary)">No orders in this period</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
