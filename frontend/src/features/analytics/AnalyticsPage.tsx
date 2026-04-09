import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp, TrendingDown, ShoppingCart, Users, DollarSign, Package,
  ArrowUpRight, ArrowDownRight, MapPin, Truck, CreditCard, BarChart3,
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
  topProducts: { name: string; revenue: number; quantity: number }[];
  recentOrders: { id: string; orderCode: string; total: number; status: string; paymentMethod: string; deliveryMethod: string; createdAt: string }[];
  ordersBySource: { source: string; count: number; revenue: number }[];
}

export function AnalyticsPage() {
  const [storeFilter, setStoreFilter] = useState<string>('all');

  const { data: locations } = useQuery({
    queryKey: queryKeys.settings.locations(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ locations: { id: string; name: string }[] }>('/locations/all');
      return data.locations;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.analytics.summary(), storeFilter],
    queryFn: async () => {
      const params = storeFilter !== 'all' ? { locationId: storeFilter } : {};
      const { data } = await apiClient.get<AnalyticsData>('/analytics/summary', { params });
      return data;
    },
  });

  const storeName = useMemo(() => {
    if (storeFilter === 'all') return null;
    return locations?.find(l => l.id === storeFilter)?.name;
  }, [storeFilter, locations]);

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
    {
      label: 'Total Revenue', value: formatCurrency(data?.totalRevenue ?? 0),
      icon: DollarSign, color: 'bg-emerald-500/10 text-emerald-600',
      growth: data?.revenueGrowth ?? 0,
    },
    {
      label: 'Total Orders', value: String(data?.totalOrders ?? 0),
      icon: ShoppingCart, color: 'bg-blue-500/10 text-blue-600',
      growth: data?.ordersGrowth ?? 0,
    },
    {
      label: 'Customers', value: String(data?.totalCustomers ?? 0),
      icon: Users, color: 'bg-violet-500/10 text-violet-600',
    },
    {
      label: 'Avg Order Value', value: formatCurrency(data?.avgOrderValue ?? 0),
      icon: TrendingUp, color: 'bg-amber-500/10 text-amber-600',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={storeName ? `Insights for ${storeName}` : 'Business insights and performance metrics'}
        actions={
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-[200px]">
              <MapPin className="mr-2 h-4 w-4" />
              <SelectValue placeholder="All Stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {(locations ?? []).map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {storeName && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
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
              <p className="mt-4 text-2xl font-bold text-[var(--text-primary)]">{kpi.value}</p>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Trend + Order Status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[var(--text-tertiary)]" />
              Revenue Trend (30 days)
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
              <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">No revenue data yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
          </CardHeader>
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
                        <span className="capitalize text-[var(--text-secondary)]">{s.status.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="font-semibold text-[var(--text-primary)]">{s.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-[var(--text-tertiary)]">No orders yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products + Delivery/Payment Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-[var(--text-tertiary)]" />
              Top Products by Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topProducts && data.topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis type="number" stroke="var(--text-tertiary)" fontSize={11} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" stroke="var(--text-tertiary)" fontSize={11} width={120} tick={{ fill: 'var(--text-secondary)' }} />
                  <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-[var(--text-tertiary)]">No data</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Delivery Methods */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-[var(--text-tertiary)]" />
                Delivery Methods
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(data?.ordersByDelivery ?? []).map((d) => {
                  const total = (data?.ordersByDelivery ?? []).reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                  return (
                    <div key={d.method} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize text-[var(--text-secondary)]">{d.method === 'pickup' ? 'Store Pickup' : 'Home Delivery'}</span>
                        <span className="font-semibold">{d.count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--surface-tertiary)]">
                        <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {(!data?.ordersByDelivery || data.ordersByDelivery.length === 0) && (
                  <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">No data</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[var(--text-tertiary)]" />
                Payment Methods
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(data?.ordersByPayment ?? []).map((p) => {
                  const total = (data?.ordersByPayment ?? []).reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
                  const label = p.method === 'cod' ? 'Cash on Delivery' : p.method === 'stripe' ? 'Card (Stripe)' : p.method;
                  return (
                    <div key={p.method} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">{label}</span>
                        <span className="font-semibold">{p.count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--surface-tertiary)]">
                        <div className="h-2 rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {(!data?.ordersByPayment || data.ordersByPayment.length === 0) && (
                  <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">No data</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Monthly Revenue + Order Sources */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
          </CardHeader>
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
              <p className="py-12 text-center text-sm text-[var(--text-tertiary)]">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.ordersBySource && data.ordersBySource.length > 0 ? (
              <div className="space-y-4">
                {data.ordersBySource.map((s) => (
                  <div key={s.source} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant={s.source === 'whatsapp' ? 'success' : 'info'}>
                        {s.source === 'whatsapp' ? 'WhatsApp' : 'App'}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{s.count} orders</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{formatCurrency(s.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-[var(--text-tertiary)]">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recentOrders && data.recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-[var(--text-tertiary)]">
                    <th className="pb-3 pr-4">Order</th>
                    <th className="pb-3 pr-4">Total</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Payment</th>
                    <th className="pb-3 pr-4">Delivery</th>
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
                      <td className="py-3 pr-4 capitalize text-[var(--text-secondary)]">
                        {o.paymentMethod === 'cod' ? 'COD' : o.paymentMethod}
                      </td>
                      <td className="py-3 pr-4 capitalize text-[var(--text-secondary)]">
                        {o.deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery'}
                      </td>
                      <td className="py-3 text-[var(--text-tertiary)]">{formatDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">No orders yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
