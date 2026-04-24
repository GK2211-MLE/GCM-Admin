import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  Package, Search, Filter, AlertTriangle, XCircle, CheckCircle2,
  Plus, Minus, ImageIcon, Eye, MapPin,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency, resolveImageSrc } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';
import { EmptyState } from '@/components/feedback/EmptyState';

// ── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  pricePerUnit: number;
  weightKg: number;
  imageUrl: string;
  active: boolean;
  inStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface InventorySummary {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

interface InventoryResponse {
  items: InventoryItem[];
  total: number;
  summary: InventorySummary;
}

type StockStatusFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

// ── Inline Editable Cell ─────────────────────────────────────────────────────

function InlineEditCell({
  value,
  onSave,
  min = 0,
  step,
}: {
  value: number;
  onSave: (newValue: number) => void;
  min?: number;
  step?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Sync draft when value changes externally
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const handleSave = () => {
    const num = parseFloat(draft);
    if (!isNaN(num) && num >= min) {
      onSave(num);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={min}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={handleSave}
        className="h-8 w-20 text-center"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="cursor-pointer rounded px-2 py-1 text-sm font-medium hover:bg-[var(--surface-tertiary)] transition-colors"
      title="Click to edit"
    >
      {value}
    </button>
  );
}

// ── Stock Adjustment Dialog ──────────────────────────────────────────────────

function StockAdjustmentDialog({
  product,
  open,
  onOpenChange,
  onSave,
  isPending,
}: {
  product: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (productId: string, adjustment: number) => void;
  isPending: boolean;
}) {
  const [adjustment, setAdjustment] = useState(0);

  // Reset adjustment when dialog opens
  useEffect(() => {
    if (open) setAdjustment(0);
  }, [open]);

  if (!product) return null;

  const newQty = Math.max(0, product.stockQuantity + adjustment);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            Adjust stock for <strong>{product.name}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Current Stock</span>
            <span className="font-semibold text-[var(--text-primary)]">{product.stockQuantity}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAdjustment((a) => a - 1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              value={adjustment}
              onChange={(e) => setAdjustment(parseInt(e.target.value, 10) || 0)}
              className="text-center"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAdjustment((a) => a + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">New Stock</span>
            <span className="font-semibold text-[var(--text-primary)]">{newQty}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onSave(product.id, adjustment)}
            disabled={adjustment === 0 || isPending}
          >
            {isPending ? 'Saving...' : 'Save Adjustment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function InventoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<StockStatusFilter>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');

  // Adjustment dialog
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null);

  // ── Locations query ──────────────────────────────────────────────────────
  const { data: locationsData } = useQuery({
    queryKey: queryKeys.settings.locations(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ locations: { id: string; name: string }[] }>('/locations/all');
      return data.locations;
    },
  });

  // ── Query params ──────────────────────────────────────────────────────────
  const queryParams = useMemo(() => ({
    search: search || undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    stockStatus: stockStatusFilter,
    limit: 100,
    ...(storeFilter !== 'all' ? { locationId: storeFilter } : {}),
  }), [search, categoryFilter, stockStatusFilter, storeFilter]);

  // ── Queries ───────────────────────────────────────────────────────────────
  // keepPreviousData is critical: each keystroke in the search box
  // changes queryParams → a new queryKey. Without it, isLoading flips
  // to true every keystroke, which unmounts the whole page (see the
  // `if (isLoading) return <LoadingSpinner />` below) — killing focus
  // on the input. With it, previous data is preserved while the new
  // fetch runs so isLoading only fires on the very first load.
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.inventory.list(queryParams),
    queryFn: async () => {
      const { data } = await apiClient.get<InventoryResponse>('/inventory', {
        params: queryParams,
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  // Derive categories from loaded products
  const { data: allProducts } = useQuery({
    queryKey: queryKeys.products.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ products: InventoryItem[] }>('/products');
      return data.products;
    },
  });

  const categories = useMemo(() => {
    if (!allProducts) return [];
    return [...new Set(allProducts.map((p) => p.category).filter(Boolean))].sort();
  }, [allProducts]);

  const items = data?.items ?? [];
  const summary = data?.summary ?? { totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0 };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateStock = useMutation({
    mutationFn: async ({ productId, stockQuantity }: { productId: string; stockQuantity: number }) => {
      const { data } = await apiClient.patch(`/inventory/${productId}/stock`, {
        stockQuantity,
        ...(storeFilter !== 'all' ? { locationId: storeFilter } : {}),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      toast.success('Stock updated');
    },
  });

  const adjustStock = useMutation({
    mutationFn: async ({ productId, adjustment }: { productId: string; adjustment: number }) => {
      const { data } = await apiClient.patch(`/inventory/${productId}/stock`, {
        adjustment,
        ...(storeFilter !== 'all' ? { locationId: storeFilter } : {}),
      });
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      const sign = vars.adjustment > 0 ? '+' : '';
      toast.success(`Stock adjusted by ${sign}${vars.adjustment}`);
      setAdjustTarget(null);
    },
  });

  const updateThreshold = useMutation({
    mutationFn: async ({ productId, lowStockThreshold }: { productId: string; lowStockThreshold: number }) => {
      const { data } = await apiClient.patch(`/inventory/${productId}/threshold`, {
        lowStockThreshold,
        ...(storeFilter !== 'all' ? { locationId: storeFilter } : {}),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      toast.success('Low stock threshold updated');
    },
  });

  const handleStockSave = useCallback((productId: string, newQuantity: number) => {
    updateStock.mutate({ productId, stockQuantity: newQuantity });
  }, [updateStock]);

  const handleThresholdSave = useCallback((productId: string, newThreshold: number) => {
    updateThreshold.mutate({ productId, lowStockThreshold: newThreshold });
  }, [updateThreshold]);

  const handleAdjustSave = useCallback((productId: string, adjustment: number) => {
    adjustStock.mutate({ productId, adjustment });
  }, [adjustStock]);

  const updatePrice = useMutation({
    mutationFn: async ({ productId, pricePerUnit }: { productId: string; pricePerUnit: number }) => {
      const { data } = await apiClient.put(`/products/${productId}`, { pricePerUnit });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      toast.success('Price updated');
    },
  });

  const handlePriceSave = useCallback((productId: string, priceInCents: number) => {
    updatePrice.mutate({ productId, pricePerUnit: priceInCents });
  }, [updatePrice]);

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: ColumnDef<InventoryItem, unknown>[] = useMemo(() => [
    {
      id: 'image',
      header: '',
      size: 64,
      cell: ({ row }) => (
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-tertiary)]">
          {row.original.imageUrl ? (
            <img src={resolveImageSrc(row.original.imageUrl)} alt={row.original.name} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-[var(--text-primary)]">{row.original.name}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{capitalize(row.original.category)}</p>
        </div>
      ),
    },
    {
      accessorKey: 'pricePerUnit',
      header: 'Price',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="text-[var(--text-tertiary)]">$</span>
          <InlineEditCell
            value={row.original.pricePerUnit / 100}
            onSave={(newVal) => handlePriceSave(row.original.id, Math.round(newVal * 100))}
            min={0}
            step={0.01}
          />
          <span className="text-xs text-[var(--text-tertiary)]">/ {row.original.unit}</span>
        </div>
      ),
    },
    {
      accessorKey: 'stockQuantity',
      header: 'Stock Qty',
      cell: ({ row }) => (
        <InlineEditCell
          value={row.original.stockQuantity}
          onSave={(newVal) => handleStockSave(row.original.id, newVal)}
        />
      ),
    },
    {
      accessorKey: 'lowStockThreshold',
      header: 'Low Threshold',
      cell: ({ row }) => (
        <InlineEditCell
          value={row.original.lowStockThreshold}
          onSave={(newVal) => handleThresholdSave(row.original.id, newVal)}
        />
      ),
    },
    {
      id: 'stockStatus',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.stockStatus;
        const variant = status === 'in_stock' ? 'success' : status === 'low_stock' ? 'warning' : 'danger';
        const label = status === 'in_stock' ? 'In Stock' : status === 'low_stock' ? 'Low Stock' : 'Out of Stock';
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      id: 'actions',
      header: '',
      size: 160,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={(e) => { e.stopPropagation(); handleStockSave(row.original.id, row.original.stockQuantity + 1); }}
            title="Add 1"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={(e) => { e.stopPropagation(); handleStockSave(row.original.id, Math.max(0, row.original.stockQuantity - 1)); }}
            title="Remove 1"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={(e) => { e.stopPropagation(); setAdjustTarget(row.original); }}
            title="Adjust stock"
          >
            <Package className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={(e) => { e.stopPropagation(); navigate(`/products/${row.original.id}`); }}
            title="View product"
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [handleStockSave, handleThresholdSave, navigate]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Track stock levels and manage inventory across your products."
      />

      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-tertiary)]">
              <Package className="h-5 w-5 text-[var(--text-secondary)]" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-tertiary)]">Total Products</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{summary.totalProducts}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-tertiary)]">In Stock</p>
              <p className="text-2xl font-bold text-success">{summary.inStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-tertiary)]">Low Stock</p>
              <p className="text-2xl font-bold text-warning">{summary.lowStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger/10">
              <XCircle className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="text-sm text-[var(--text-tertiary)]">Out of Stock</p>
              <p className="text-2xl font-bold text-danger">{summary.outOfStock}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {capitalize(cat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stockStatusFilter} onValueChange={(v) => setStockStatusFilter(v as StockStatusFilter)}>
            <SelectTrigger className="w-[160px] h-10">
              <SelectValue placeholder="Stock Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="low_stock">Low Stock</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>

          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-[180px] shrink-0">
              <SelectValue placeholder="All Stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores (Global)</SelectItem>
              {(locationsData ?? []).map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {storeFilter !== 'all' && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <MapPin className="h-4 w-4" />
          <span>Showing inventory for: <strong>{(locationsData ?? []).find(l => l.id === storeFilter)?.name}</strong></span>
        </div>
      )}

      {/* Content */}
      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No inventory items found"
          description={
            search || categoryFilter !== 'all' || stockStatusFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Products will appear here once stock levels are configured.'
          }
        />
      ) : (
        <DataTable columns={columns} data={items} pageSize={20} />
      )}

      {/* Stock Adjustment Dialog */}
      <StockAdjustmentDialog
        product={adjustTarget}
        open={!!adjustTarget}
        onOpenChange={(open) => { if (!open) setAdjustTarget(null); }}
        onSave={handleAdjustSave}
        isPending={adjustStock.isPending}
      />
    </div>
  );
}
