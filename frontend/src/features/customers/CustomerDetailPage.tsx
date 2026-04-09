import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';
import { ArrowLeft, Mail, Phone, MapPin, ShoppingCart, DollarSign } from 'lucide-react';

interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  email: string;
  address?: string;
  totalOrders: number;
  totalSpent: number;
  createdAt: string;
  orders: {
    id: string;
    orderCode: string;
    status: string;
    total: number;
    createdAt: string;
  }[];
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: customer, isLoading } = useQuery({
    queryKey: queryKeys.customers.detail(id!),
    queryFn: async () => {
      const { data } = await apiClient.get<{ customer: Omit<CustomerDetail, 'orders'>; orders: CustomerDetail['orders'] }>(`/customers/${id}`);
      return { ...data.customer, orders: data.orders ?? [] } as CustomerDetail;
    },
    enabled: !!id,
  });

  if (isLoading) return <LoadingSpinner className="h-64" />;
  if (!customer) return <p className="text-[var(--text-secondary)]">Customer not found</p>;

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={`Customer since ${formatDate(customer.createdAt)}`}
        actions={
          <Link to="/customers">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-[var(--text-tertiary)]" />
              <span className="text-[var(--text-primary)]">{customer.phone}</span>
            </div>
            {customer.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span className="text-[var(--text-primary)]">{customer.email}</span>
              </div>
            )}
            {customer.address && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span className="text-[var(--text-primary)]">{customer.address}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-info/10 p-2">
                <ShoppingCart className="h-4 w-4 text-info" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">Total Orders</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{customer.totalOrders}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/10 p-2">
                <DollarSign className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">Total Spent</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{formatCurrency(customer.totalSpent / 100)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order History */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {customer.orders.length > 0 ? (
              <div className="space-y-3">
                {customer.orders.map((order) => (
                  <Link
                    key={order.id}
                    to={`/orders/${order.id}`}
                    className="block rounded-lg border border-[var(--border-default)] p-3 transition-colors hover:bg-[var(--surface-tertiary)]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-primary-500">{order.orderCode}</span>
                      <Badge variant={statusColor(order.status) as 'success' | 'warning' | 'danger' | 'info' | 'default'}>
                        {order.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                      <span>{formatDate(order.createdAt)}</span>
                      <span className="font-medium">{formatCurrency(order.total / 100)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">No orders yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
