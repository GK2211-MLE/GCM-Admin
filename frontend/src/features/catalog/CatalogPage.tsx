import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import {
  Plus, Pencil, Trash2, ImageIcon, Grid3X3, List, GripVertical,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ImageField } from '@/components/ui/image-field';

// ── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  imageUrl: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  slug: string;
  imageUrl: string;
  sortOrder: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  imageUrl: '',
  sortOrder: '0',
  active: true,
};

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ── Component ────────────────────────────────────────────────────────────────

export function CatalogPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [autoSlug, setAutoSlug] = useState(true);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: categories = [], isLoading } = useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ categories: Category[] }>('/categories');
      return data.categories;
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const createCategory = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await apiClient.post('/categories', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
      closeDialog();
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { data } = await apiClient.put(`/categories/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
      closeDialog();
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      setDeleteTarget(null);
    },
  });

  const toggleCategory = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.patch(`/categories/${id}/toggle`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  const openAdd = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setAutoSlug(true);
    setShowDialog(true);
  }, []);

  const openEdit = useCallback((cat: Category) => {
    setEditTarget(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      imageUrl: cat.imageUrl,
      sortOrder: String(cat.sortOrder),
      active: cat.active,
    });
    setAutoSlug(false);
    setShowDialog(true);
  }, []);

  const closeDialog = useCallback(() => {
    setShowDialog(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setAutoSlug(true);
  }, []);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-generate slug from name
      if (key === 'name' && autoSlug) {
        next.slug = toSlug(value as string);
      }
      return next;
    });
  }, [autoSlug]);

  const onSlugManualChange = useCallback((value: string) => {
    setAutoSlug(false);
    setForm((prev) => ({ ...prev, slug: value }));
  }, []);

  const onSave = useCallback(() => {
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || toSlug(form.name),
      imageUrl: form.imageUrl.trim(),
      sortOrder: parseInt(form.sortOrder, 10) || 0,
      active: form.active,
    };
    if (editTarget) {
      updateCategory.mutate({ id: editTarget.id, payload });
    } else {
      createCategory.mutate(payload);
    }
  }, [form, editTarget, createCategory, updateCategory]);

  const isSaving = createCategory.isPending || updateCategory.isPending;
  const isFormValid = form.name.trim().length > 0;

  // ── Table columns ────────────────────────────────────────────────────────

  const columns: ColumnDef<Category, unknown>[] = useMemo(() => [
    {
      id: 'sortOrder',
      header: '#',
      size: 50,
      cell: ({ row }) => (
        <span className="flex items-center gap-1 text-[var(--text-tertiary)]">
          <GripVertical className="h-3.5 w-3.5" />
          {row.original.sortOrder}
        </span>
      ),
    },
    {
      id: 'image',
      header: '',
      size: 64,
      cell: ({ row }) => (
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-tertiary)]">
          {row.original.imageUrl ? (
            <img src={row.original.imageUrl} alt={row.original.name} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Category',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-[var(--text-primary)]">{row.original.name}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{row.original.slug}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.active ? 'success' : 'danger'}>
          {row.original.active ? 'Active' : 'Inactive'}
        </Badge>
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
            onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}
            title="Edit category"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="text-danger hover:text-danger"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row.original); }}
            title="Delete category"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [openEdit]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        description="Manage product categories"
        actions={
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        }
      />

      {/* View toggle */}
      <div className="flex items-center justify-end">
        <div className="flex rounded-lg border border-[var(--border-default)]">
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

      {/* Content */}
      {categories.length === 0 ? (
        <EmptyState
          icon={<Grid3X3 className="h-8 w-8" />}
          title="No categories yet"
          description="Get started by adding your first product category."
        />
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((cat) => (
            <Card
              key={cat.id}
              className="group cursor-pointer overflow-hidden transition-colors hover:border-[var(--border-hover)]"
              onClick={() => openEdit(cat)}
            >
              {/* Image area */}
              <div className="relative flex h-36 items-center justify-center bg-[var(--surface-tertiary)] overflow-hidden">
                {cat.imageUrl ? (
                  <img
                    src={cat.imageUrl}
                    alt={cat.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-12 w-12 text-[var(--text-tertiary)]" />
                )}
                <div className="absolute left-2 top-2">
                  <Badge variant={cat.active ? 'success' : 'danger'}>
                    {cat.active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                {/* Hover actions */}
                <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="secondary" size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); openEdit(cat); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="secondary" size="icon"
                    className="h-7 w-7 text-danger hover:text-danger"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(cat); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-[var(--text-primary)]">{cat.name}</h3>
                    <p className="text-xs text-[var(--text-tertiary)]">{cat.slug}</p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--text-tertiary)]">#{cat.sortOrder}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <DataTable columns={columns} data={categories} pageSize={20} />
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>
              {editTarget ? 'Update this category\'s details.' : 'Create a new product category.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text-primary)]">Name *</label>
              <Input
                placeholder="e.g. Chicken"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text-primary)]">Slug</label>
              <Input
                placeholder="auto-generated-from-name"
                value={form.slug}
                onChange={(e) => onSlugManualChange(e.target.value)}
              />
              <p className="text-xs text-[var(--text-tertiary)]">
                URL-friendly identifier. Auto-generated from name if left empty.
              </p>
            </div>

            {/* Image (URL or upload) */}
            <ImageField
              label="Category Image"
              value={form.imageUrl}
              onChange={(url) => updateField('imageUrl', url)}
              helper="Paste a direct image URL or upload a file."
            />


            {/* Sort Order */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text-primary)]">Sort Order</label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.sortOrder}
                onChange={(e) => updateField('sortOrder', e.target.value)}
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-default)] p-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Active</p>
                <p className="text-xs text-[var(--text-tertiary)]">Show this category to customers</p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(checked) => updateField('active', checked)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={onSave}
              disabled={!isFormValid || isSaving}
            >
              {isSaving ? 'Saving...' : editTarget ? 'Save Changes' : 'Create Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? All products currently in this category will have their category cleared and will need to be reassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteCategory.mutate(deleteTarget.id)}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending ? 'Deleting...' : 'Delete Category & Clear Products'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
