import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  Plus, Search, Grid3X3, List, Pencil, Trash2, Eye,
  Package, Filter, ChevronLeft, ChevronRight, ImageIcon,
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

interface Product {
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
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProductListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(0);
  const pageSize = 12;

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: queryKeys.products.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ products: Product[] }>('/products');
      return data.products;
    },
  });

  // Fetch categories from DB
  const { data: dbCategories = [] } = useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ categories: { slug: string; name: string }[] }>('/categories');
      return data.categories;
    },
  });

  const categories = useMemo(() => {
    return dbCategories.map((c) => c.slug);
  }, [dbCategories]);

  const categoryLabelMap = useMemo(() =>
    Object.fromEntries(dbCategories.map((c) => [c.slug, c.name])),
    [dbCategories],
  );

  // ── Mutations ────────────────────────────────────────────────────────────

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/products/${id}`);
      return res.data as { hardDeleted?: boolean; reason?: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      if (data?.hardDeleted === false) {
        toast.success(`Product ${data.reason || 'archived (still referenced)'}`);
      } else {
        toast.success('Product deleted');
      }
      setDeleteTarget(null);
    },
  });

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteProduct.mutate(deleteTarget.id);
  }, [deleteTarget, deleteProduct]);

  // ── Client-side filtering ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = allProducts;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          (p.description || '').toLowerCase().includes(lower) ||
          (p.category || '').toLowerCase().includes(lower),
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((p) => p.category === categoryFilter);
    }

    return result;
  }, [allProducts, search, categoryFilter]);

  // Client-side pagination
  const paginatedProducts = useMemo(() => {
    const start = page * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // ── Table columns ────────────────────────────────────────────────────────

  const columns: ColumnDef<Product, unknown>[] = useMemo(() => [
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
      header: 'Product Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-[var(--text-primary)]">{row.original.name}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{row.original.unit}</p>
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ getValue }) => (
        <Badge variant="default">{categoryLabelMap[getValue() as string] || capitalize(getValue() as string)}</Badge>
      ),
    },
    {
      accessorKey: 'pricePerUnit',
      header: 'Price',
      cell: ({ getValue }) => (
        <span className="font-semibold text-[var(--text-primary)]">
          {formatCurrency((getValue() as number) / 100)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Badge variant={row.original.active ? 'success' : 'danger'}>
            {row.original.active ? 'Active' : 'Inactive'}
          </Badge>
          {!row.original.inStock && (
            <Badge variant="warning">Out of Stock</Badge>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 120,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon"
            onClick={(e) => { e.stopPropagation(); navigate(`/products/${row.original.id}`); }}
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={(e) => { e.stopPropagation(); navigate(`/products/${row.original.id}`); }}
            title="Edit product"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="text-danger hover:text-danger"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row.original); }}
            title="Delete product"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [navigate, categoryLabelMap]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage your product catalog and pricing."
        actions={
          <Button onClick={() => navigate('/products/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        }
      />

      {/* Filters bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />

          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {categoryLabelMap[cat] || capitalize(cat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="ml-auto flex rounded-lg border border-[var(--border-default)]">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No products found"
          description={
            search || categoryFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Get started by adding your first product.'
          }
        />
      ) : viewMode === 'grid' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginatedProducts.map((product) => (
              <Card
                key={product.id}
                className="group cursor-pointer overflow-hidden transition-colors hover:border-[var(--border-hover)]"
                onClick={() => navigate(`/products/${product.id}`)}
              >
                {/* Image area */}
                <div className="relative flex h-36 items-center justify-center bg-[var(--surface-tertiary)] overflow-hidden">
                  {product.imageUrl ? (
                    <img
                      src={resolveImageSrc(product.imageUrl)}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-12 w-12 text-[var(--text-tertiary)]" />
                  )}
                  <div className="absolute left-2 top-2">
                    <Badge variant={product.active ? 'success' : 'danger'}>
                      {product.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {!product.inStock && (
                    <div className="absolute right-2 top-2">
                      <Badge variant="warning">Out of Stock</Badge>
                    </div>
                  )}
                  {/* Hover actions */}
                  <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="secondary" size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); navigate(`/products/${product.id}`); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="secondary" size="icon"
                      className="h-7 w-7 text-danger hover:text-danger"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(product); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-[var(--text-primary)]">{product.name}</h3>
                      <p className="text-xs text-[var(--text-tertiary)]">{categoryLabelMap[product.category] || capitalize(product.category)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-primary-500">
                      {formatCurrency(product.pricePerUnit / 100)}/{product.unit}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Grid Pagination */}
          {filtered.length > pageSize && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-[var(--text-tertiary)]">
                Showing {page * pageSize + 1}&ndash;{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length} products
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                </Button>
                <span className="text-sm font-medium">Page {page + 1} of {totalPages}</span>
                <Button
                  variant="outline" size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <DataTable columns={columns} data={filtered} pageSize={12} />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteProduct.isPending}
            >
              {deleteProduct.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
