import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency, cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, ShoppingCart, ArrowLeft, X, Trash2 } from 'lucide-react';
import { useCreateOrder } from './api';
import type { OrderCreate, PaymentMethod, DeliveryMethod } from './types';

interface Customer { id: string; name: string | null; phone: string; email: string | null; address: string | null }
interface Product { id: string; name: string; category: string; unit: string; pricePerUnit: number; active: boolean; inStock: boolean }
interface Location { id: string; name: string; address: string }

interface LineItem {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string;
}

export function CreateOrderPage() {
  const navigate = useNavigate();
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [notes, setNotes] = useState('');

  const createOrder = useCreateOrder();

  const { data: customerData } = useQuery({
    queryKey: ['customers', 'list'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ customers: Customer[] }>('/customers');
      return data.customers;
    },
  });

  const { data: productData } = useQuery({
    queryKey: ['products', 'list'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ products: Product[] }>('/products');
      return data.products;
    },
  });

  const { data: locationData } = useQuery({
    queryKey: ['locations', 'list'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ locations: Location[] }>('/locations');
      return data.locations;
    },
  });

  const customers = customerData ?? [];
  const products = (productData ?? []).filter((p) => p.active && p.inStock);
  const locations = locationData ?? [];

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) => (c.name ?? '').toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [customerSearch, customers]);

  const addedProductIds = useMemo(() => new Set(lineItems.map((li) => li.productId)), [lineItems]);
  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => !addedProductIds.has(p.id));
    if (productSearch) {
      const q = productSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    return list;
  }, [productSearch, addedProductIds, products]);

  // Totals (amounts in cents)
  const subtotal = useMemo(
    () => lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0),
    [lineItems],
  );
  const taxRate = 0.085; // 8.5% US sales tax
  const taxAmount = Math.round(subtotal * taxRate);
  const total = subtotal + taxAmount;

  const selectCustomer = useCallback((c: Customer) => {
    setSelectedCustomer(c);
    setCustomerSearch('');
    setShowCustomerDropdown(false);
    if (c.address) setDeliveryAddress(c.address);
  }, []);

  const addProduct = useCallback((p: Product) => {
    setLineItems((prev) => [
      ...prev,
      {
        key: `${p.id}-${Date.now()}`,
        productId: p.id,
        productName: p.name,
        quantity: 1,
        unitPrice: p.pricePerUnit,
        unit: p.unit,
      },
    ]);
    setProductSearch('');
    setShowProductDropdown(false);
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    if (quantity < 1) return;
    setLineItems((prev) => prev.map((li) => li.key === key ? { ...li, quantity } : li));
  }, []);

  const removeItem = useCallback((key: string) => {
    setLineItems((prev) => prev.filter((li) => li.key !== key));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedCustomer || lineItems.length === 0 || !selectedLocation) return;

    const payload: OrderCreate = {
      customerId: selectedCustomer.id,
      locationId: selectedLocation,
      items: lineItems.map((li) => ({ productId: li.productId, quantity: li.quantity })),
      deliveryMethod,
      deliveryAddress: deliveryMethod === 'delivery' ? deliveryAddress : undefined,
      paymentMethod,
      notes: notes || undefined,
    };

    createOrder.mutate(payload, { onSuccess: () => navigate('/orders') });
  }, [selectedCustomer, lineItems, selectedLocation, deliveryMethod, deliveryAddress, paymentMethod, notes, createOrder, navigate]);

  const canSubmit = selectedCustomer && lineItems.length > 0 && selectedLocation && lineItems.every((li) => li.quantity > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Order"
        description="Create a new order for a customer."
        actions={
          <Link to="/orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <Card>
            <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
            <CardContent>
              {selectedCustomer ? (
                <div className="flex items-start justify-between rounded-lg border border-[var(--border-default)] p-4 bg-[var(--surface-tertiary)]">
                  <div>
                    <p className="font-medium text-sm">{selectedCustomer.name || 'Unknown'}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{selectedCustomer.phone}</p>
                    {selectedCustomer.email && <p className="text-xs text-[var(--text-secondary)]">{selectedCustomer.email}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedCustomer(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <Input
                      placeholder="Search customer by name or phone..."
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      className="pl-9"
                    />
                  </div>
                  {showCustomerDropdown && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.length === 0 ? (
                        <div className="p-4 text-center text-sm text-[var(--text-secondary)]">No customers found</div>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            className="w-full text-left px-4 py-3 hover:bg-[var(--surface-tertiary)] transition-colors border-b border-[var(--border-default)] last:border-0"
                            onClick={() => selectCustomer(c)}
                          >
                            <p className="text-sm font-medium">{c.name || 'Unknown'}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{c.phone}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Product Line Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Products</span>
                <Badge>{lineItems.length} items</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <Input
                    placeholder="Search products to add..."
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="pl-9"
                  />
                </div>
                {showProductDropdown && productSearch.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] shadow-lg max-h-60 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <div className="p-4 text-center text-sm text-[var(--text-secondary)]">No products found</div>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-4 py-3 hover:bg-[var(--surface-tertiary)] transition-colors border-b border-[var(--border-default)] last:border-0 flex items-center justify-between"
                          onClick={() => addProduct(p)}
                        >
                          <div>
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{p.category} - per {p.unit}</p>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <p className="text-sm font-semibold tabular-nums">{formatCurrency(p.pricePerUnit / 100)}</p>
                            <p className="text-xs text-[var(--text-secondary)]">per {p.unit}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {lineItems.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-[var(--border-default)] rounded-lg">
                  <ShoppingCart className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
                  <p className="text-sm text-[var(--text-secondary)]">No products added yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {lineItems.map((item, idx) => (
                    <div key={item.key} className="flex items-center gap-4 rounded-lg border border-[var(--border-default)] p-3 hover:bg-[var(--surface-tertiary)] transition-colors">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/10 text-primary-500 font-semibold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{formatCurrency(item.unitPrice / 100)} / {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => updateQuantity(item.key, item.quantity - 1)} disabled={item.quantity <= 1}>-</Button>
                        <Input type="number" value={item.quantity} onChange={(e) => updateQuantity(item.key, Number(e.target.value))} className="w-16 h-7 text-center text-sm" min={1} />
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => updateQuantity(item.key, item.quantity + 1)}>+</Button>
                        <span className="text-xs text-[var(--text-secondary)] w-6">{item.unit}</span>
                      </div>
                      <div className="text-right shrink-0 w-20">
                        <p className="text-sm font-semibold tabular-nums">{formatCurrency((item.quantity * item.unitPrice) / 100)}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[var(--text-tertiary)] hover:text-danger" onClick={() => removeItem(item.key)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery & Payment */}
          <Card>
            <CardHeader><CardTitle className="text-base">Delivery & Payment</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Location</label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger><SelectValue placeholder="Select store location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Delivery Method</label>
                  <Select value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as DeliveryMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pickup">Store Pickup</SelectItem>
                      <SelectItem value="delivery">Home Delivery</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {deliveryMethod === 'delivery' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Delivery Address</label>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter delivery address"
                    rows={2}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-primary)]">Payment Method</label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe">Card (Online)</SelectItem>
                    <SelectItem value="cod">Cash on Delivery</SelectItem>
                    <SelectItem value="pay_at_store">Pay at Store</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-primary)]">Notes</label>
                <textarea
                  className="w-full rounded-lg border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add order notes, special instructions..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right - Summary */}
        <div>
          <Card className="sticky top-6">
            <CardHeader><CardTitle className="text-base">Order Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {selectedCustomer ? (
                <div className="rounded-lg bg-[var(--surface-tertiary)] p-3">
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Customer</p>
                  <p className="text-sm font-medium mt-1">{selectedCustomer.name || 'Unknown'}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{selectedCustomer.phone}</p>
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-[var(--border-default)] p-3 text-center">
                  <p className="text-xs text-[var(--text-secondary)]">No customer selected</p>
                </div>
              )}

              <div className="rounded-lg bg-[var(--surface-tertiary)] p-3">
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Items</p>
                <p className="text-sm font-medium mt-1">
                  {lineItems.length} products, {lineItems.reduce((s, li) => s + li.quantity, 0)} total qty
                </p>
              </div>

              <div className="border-t border-[var(--border-default)] pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(subtotal / 100)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Tax (8.5%)</span>
                  <span className="tabular-nums">{formatCurrency(taxAmount / 100)}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border-default)] pt-2 text-lg font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums text-primary-500">{formatCurrency(total / 100)}</span>
                </div>
              </div>

              <div className="border-t border-[var(--border-default)] pt-4 space-y-2">
                <Button className="w-full" size="lg" onClick={handleSubmit} disabled={!canSubmit}>
                  <ShoppingCart className="mr-2 h-4 w-4" /> Place Order
                </Button>
                <Link to="/orders" className="block">
                  <Button variant="outline" className="w-full">Cancel</Button>
                </Link>
              </div>

              {!canSubmit && (
                <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
                  <p className="text-xs text-warning">
                    {!selectedCustomer && 'Select a customer. '}
                    {lineItems.length === 0 && 'Add at least one product. '}
                    {!selectedLocation && 'Select a location. '}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
