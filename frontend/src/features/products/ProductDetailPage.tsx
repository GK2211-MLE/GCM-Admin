import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, X, ArrowLeft, Package, Trash2, ImageIcon, Upload,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatCurrency, resolveImageSrc } from '@/lib/utils';
import { useAuthStore } from '@/features/auth/store';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';
import { ImageField } from '@/components/ui/image-field';

// ── Types ────────────────────────────────────────────────────────────────────

interface HalalInfo {
  certifyingBody: string;
  certificateNumber: string;
  validUntil: string;
  slaughterMethod: string;
  productionDate: string;
  lotNumber: string;
  distributor: string;
  weightRange: string;
  processorName: string;
  processorClaims: string;
  verifiedClaims: string;
}

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
  isHalal?: boolean;
  halalInfo?: Record<string, unknown>;
  badgeNoAntibiotics?: boolean;
  badgeColdChain?: boolean;
  badgeFresh?: boolean;
  badgeHandSlaughtered?: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // Locations the product is tagged for. Empty array = "all locations"
  // (catalog-wide). Backend is the source of truth via product_locations.
  locationIds?: string[];
  // Per-location price overrides keyed by locationId, in cents. Missing
  // keys (or null values) inherit pricePerUnit. Only meaningful when the
  // product has specific locations set.
  locationPrices?: Record<string, number | null>;
}

interface LocationOption {
  id: string;
  name: string;
}

type LocationMode = 'all' | 'specific';

const EMPTY_HALAL_INFO: HalalInfo = {
  certifyingBody: '',
  certificateNumber: '',
  validUntil: '',
  slaughterMethod: '',
  productionDate: '',
  lotNumber: '',
  distributor: '',
  weightRange: '',
  processorName: '',
  processorClaims: '',
  verifiedClaims: '',
};

interface FormState {
  name: string;
  description: string;
  category: string;
  priceDollars: string;
  unit: string;
  imageUrl: string;
  active: boolean;
  inStock: boolean;
  sortOrder: string;
  isHalal: boolean;
  halalInfo: HalalInfo;
  badgeNoAntibiotics: boolean;
  badgeColdChain: boolean;
  badgeFresh: boolean;
  badgeHandSlaughtered: boolean;
  // Per-location availability. 'all' = catalog-wide; 'specific' = list.
  locationMode: LocationMode;
  locationIds: string[];
  // UI representation of per-location price overrides. Stored as a
  // string per location (the dollar input the admin types). Empty
  // string = inherit base price. Converted to cents (or null) on save.
  locationPriceDollars: Record<string, string>;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  category: '',
  priceDollars: '',
  unit: 'lb',
  imageUrl: '',
  active: true,
  inStock: true,
  sortOrder: '0',
  isHalal: false,
  halalInfo: { ...EMPTY_HALAL_INFO },
  badgeNoAntibiotics: true,
  badgeColdChain: true,
  badgeFresh: true,
  badgeHandSlaughtered: false,
  locationMode: 'all',
  locationIds: [],
  locationPriceDollars: {},
};

// ── Component ────────────────────────────────────────────────────────────────

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = id === 'new';

  // Auth context — used to lock the location selector for non-admin roles.
  const authUser = useAuthStore((s) => s.user);
  const isAdmin = authUser?.role === 'admin' || authUser?.role === 'owner';
  const myLocationId = authUser?.assignedLocationId ?? null;

  const [form, setForm] = useState<FormState>(() => {
    // For non-admins creating a new product, force the location set to
    // their assigned store from the start. They can't change it.
    if (!isAdmin && myLocationId) {
      return { ...EMPTY_FORM, locationMode: 'specific', locationIds: [myLocationId] };
    }
    return EMPTY_FORM;
  });
  const [isDirty, setIsDirty] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: product, isLoading } = useQuery({
    queryKey: queryKeys.products.detail(id ?? ''),
    queryFn: async () => {
      const { data } = await apiClient.get<{ product: Product }>(`/products/${id}`);
      return data.product;
    },
    enabled: !isNew && !!id,
  });

  // Fetch categories from DB
  const { data: dbCategories = [] } = useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ categories: { slug: string; name: string; active: boolean }[] }>('/categories?includeInactive=1');
      return data.categories;
    },
  });

  // Fetch all locations for the location selector.
  const { data: allLocations = [] } = useQuery({
    queryKey: queryKeys.settings.locations(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ locations: LocationOption[] }>('/locations/all');
      return data.locations;
    },
  });

  // Sync product data into form
  useEffect(() => {
    if (product && !isNew) {
      const hi = product.halalInfo as Record<string, unknown> | undefined;
      const productLocationIds = product.locationIds ?? [];
      setForm({
        name: product.name,
        description: product.description ?? '',
        category: product.category ?? '',
        priceDollars: (product.pricePerUnit / 100).toFixed(2),
        unit: product.unit ?? 'lb',
        imageUrl: product.imageUrl ?? '',
        active: product.active ?? true,
        inStock: product.inStock ?? true,
        sortOrder: String(product.sortOrder ?? 0),
        isHalal: product.isHalal ?? false,
        badgeNoAntibiotics: product.badgeNoAntibiotics ?? true,
        badgeColdChain: product.badgeColdChain ?? true,
        badgeFresh: product.badgeFresh ?? true,
        badgeHandSlaughtered: product.badgeHandSlaughtered ?? false,
        locationMode: productLocationIds.length === 0 ? 'all' : 'specific',
        locationIds: productLocationIds,
        locationPriceDollars: Object.fromEntries(
          Object.entries(product.locationPrices ?? {}).map(([locId, cents]) => [
            locId,
            cents == null ? '' : (cents / 100).toFixed(2),
          ]),
        ),
        halalInfo: {
          certifyingBody: (hi?.certifyingBody as string) ?? '',
          certificateNumber: (hi?.certificateNumber as string) ?? '',
          validUntil: (hi?.validUntil as string) ?? '',
          slaughterMethod: (hi?.slaughterMethod as string) ?? '',
          productionDate: (hi?.productionDate as string) ?? '',
          lotNumber: (hi?.lotNumber as string) ?? '',
          distributor: (hi?.distributor as string) ?? '',
          weightRange: (hi?.weightRange as string) ?? '',
          processorName: (hi?.processorName as string) ?? '',
          processorClaims: Array.isArray(hi?.processorClaims)
            ? (hi.processorClaims as string[]).join(', ')
            : (hi?.processorClaims as string) ?? '',
          verifiedClaims: Array.isArray(hi?.verifiedClaims)
            ? (hi.verifiedClaims as string[]).join(', ')
            : (hi?.verifiedClaims as string) ?? '',
        },
      });
      setIsDirty(false);
    }
  }, [product, isNew]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const createProduct = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await apiClient.post('/products', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      toast.success('Product created');
      navigate('/products');
    },
  });

  const updateProduct = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await apiClient.put(`/products/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id!) });
      toast.success('Product saved');
      setIsDirty(false);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async () => {
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
      navigate('/products');
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const updateHalalField = useCallback(<K extends keyof HalalInfo>(key: K, value: HalalInfo[K]) => {
    setForm((prev) => ({ ...prev, halalInfo: { ...prev.halalInfo, [key]: value } }));
    setIsDirty(true);
  }, []);

  const buildPayload = useCallback(() => {
    const dollars = parseFloat(form.priceDollars);
    // Resolve location set:
    //   - admin in 'all' mode → empty array (= catalog-wide)
    //   - admin in 'specific' → whatever they picked
    //   - non-admin → forced to their assigned location, regardless of UI
    let locationIds: string[];
    if (isAdmin) {
      locationIds = form.locationMode === 'all' ? [] : form.locationIds;
    } else {
      locationIds = myLocationId ? [myLocationId] : [];
    }
    return {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      pricePerUnit: Math.round((isNaN(dollars) ? 0 : dollars) * 100),
      unit: form.unit,
      imageUrl: form.imageUrl.trim(),
      active: form.active,
      inStock: form.inStock,
      // New products ship with 100 units so they're immediately visible
      // on the customer site. Editing an existing product does NOT touch
      // stockQuantity — that's managed from the Inventory page. This
      // keeps the backend zod default of 100 explicit at the call site.
      ...(isNew ? { stockQuantity: 100 } : {}),
      sortOrder: parseInt(form.sortOrder, 10) || 0,
      isHalal: form.isHalal,
      badgeNoAntibiotics: form.badgeNoAntibiotics,
      badgeColdChain: form.badgeColdChain,
      badgeFresh: form.badgeFresh,
      badgeHandSlaughtered: form.badgeHandSlaughtered,
      locationIds,
      // Per-location price overrides. Convert each dollar string to
      // cents (or null for "inherit"). Only sent when the admin is in
      // 'specific' mode — in 'all' mode there are no per-location rows,
      // so per-location prices don't apply.
      locationPrices: isAdmin && form.locationMode === 'specific'
        ? Object.fromEntries(
            locationIds.map((locId) => {
              const raw = form.locationPriceDollars[locId];
              if (!raw || raw.trim() === '') return [locId, null];
              const dollars = parseFloat(raw);
              return [locId, isNaN(dollars) ? null : Math.round(dollars * 100)];
            }),
          )
        : {},
      halalInfo: form.isHalal
        ? {
            ...form.halalInfo,
            processorClaims: form.halalInfo.processorClaims
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            verifiedClaims: form.halalInfo.verifiedClaims
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : {},
    };
  }, [form, isAdmin, myLocationId, isNew]);

  const onSave = useCallback(() => {
    const payload = buildPayload();
    if (isNew) {
      createProduct.mutate(payload);
    } else {
      updateProduct.mutate(payload);
    }
  }, [buildPayload, isNew, createProduct, updateProduct]);

  const onDelete = useCallback(() => {
    deleteProduct.mutate();
  }, [deleteProduct]);

  const isSaving = updateProduct.isPending || createProduct.isPending;
  const isFormValid = form.name.trim().length > 0 && form.category.length > 0 && form.priceDollars.length > 0;

  const displayPrice = form.priceDollars && !isNaN(parseFloat(form.priceDollars))
    ? formatCurrency(parseFloat(form.priceDollars))
    : '$0.00';

  // Only show DB categories in dropdown
  const allCategories = dbCategories.map((c) => c.slug);
  const categoryLabelMap = Object.fromEntries(dbCategories.map((c) => [c.slug, c.name]));

  function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  }

  // ── Loading / Not Found ──────────────────────────────────────────────────

  if (isLoading && !isNew) {
    return <LoadingSpinner className="h-64" />;
  }

  if (!product && !isNew) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Package className="h-16 w-16 text-[var(--text-tertiary)] mb-4" />
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Product not found</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          This product may have been deleted or does not exist.
        </p>
        <Button variant="outline" onClick={() => navigate('/products')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Products
        </Button>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? 'New Product' : (product?.name ?? '')}
        description={
          isNew
            ? 'Create a new product in your catalog.'
            : `Category: ${
                product?.category
                  ? product.category.charAt(0).toUpperCase() + product.category.slice(1).toLowerCase()
                  : ''
              }`
        }
        actions={
          <div className="flex items-center gap-2">
            {!isNew && (
              <Button
                variant="outline"
                className="text-danger hover:text-danger"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/products')}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={isNew ? !isFormValid || isSaving : (!isDirty || !isFormValid || isSaving)}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : isNew ? 'Create Product' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Product Image Display */}
        <div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-tertiary)] flex items-center justify-center">
            {form.imageUrl ? (
              <img
                src={resolveImageSrc(form.imageUrl)}
                alt={form.name || 'Product'}
                className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-[var(--text-tertiary)]">
                <ImageIcon className="h-16 w-16" />
                <span className="text-sm">No image</span>
              </div>
            )}
            <div className="absolute left-3 top-3">
              <Badge variant={form.active ? 'success' : 'danger'}>
                {form.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {!form.inStock && (
              <div className="absolute right-3 top-3">
                <Badge variant="warning">Out of Stock</Badge>
              </div>
            )}
          </div>
          <div className="mt-4 text-center">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{displayPrice}</p>
            <p className="text-sm text-[var(--text-secondary)]">{form.unit}</p>
          </div>
        </div>

        {/* Right: Edit Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Product Name - full width */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Product Name *</label>
                  <Input
                    placeholder="e.g. Chicken Breast Boneless"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                  />
                </div>

                {/* Description - full width */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Description</label>
                  <textarea
                    rows={3}
                    className="flex w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                    placeholder="Describe the product..."
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                  />
                </div>

                {/* Image (URL or upload) — full width */}
                <div className="md:col-span-2">
                  <ImageField
                    label="Product Image"
                    value={form.imageUrl}
                    onChange={(url) => updateField('imageUrl', url)}
                    helper="Paste a direct image URL or upload a file (auto-resized to 1600px, JPEG)."
                  />
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Category *</label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => updateField('category', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {allCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {categoryLabelMap[cat] || capitalize(cat)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Price */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Price (USD) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)]">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="pl-7"
                      placeholder="3.99"
                      value={form.priceDollars}
                      onChange={(e) => updateField('priceDollars', e.target.value)}
                    />
                  </div>
                  {form.priceDollars && !isNaN(parseFloat(form.priceDollars)) && (
                    <p className="text-xs text-[var(--text-tertiary)]">
                      = {Math.round(parseFloat(form.priceDollars) * 100)} cents
                    </p>
                  )}
                </div>

                {/* Unit */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Unit</label>
                  <Select
                    value={form.unit}
                    onValueChange={(v) => updateField('unit', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lb">Pound (lb)</SelectItem>
                      <SelectItem value="kg">Kilogram (kg)</SelectItem>
                      <SelectItem value="each">Each</SelectItem>
                      <SelectItem value="piece">Piece</SelectItem>
                      <SelectItem value="pack">Pack</SelectItem>
                      <SelectItem value="dozen">Dozen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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

                {/* Status */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Status</label>
                  <Select
                    value={form.active ? 'active' : 'inactive'}
                    onValueChange={(v) => updateField('active', v === 'active')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* In Stock toggle - full width */}
                <div className="flex items-center justify-between rounded-lg border border-[var(--border-default)] p-3 md:col-span-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">In Stock</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Product available for ordering</p>
                  </div>
                  <Switch
                    checked={form.inStock}
                    onCheckedChange={(checked) => updateField('inStock', checked)}
                  />
                </div>

                {/* Trust badges — shown on the customer product detail page.
                    No Antibiotics / Cold Chain / Fresh default ON.
                    Hand Slaughtered defaults OFF and is independent from
                    the Halal Certification section below — admin can flip
                    one without affecting the other. */}
                <div className="rounded-lg border border-[var(--border-default)] p-4 md:col-span-2 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">Trust Badges</p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Shown on the product detail page. Untoggle if this SKU doesn't qualify.
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-[var(--border-default)]/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">&#128016;</span>
                      <div>
                        <p className="text-sm text-[var(--text-primary)]">Hand Slaughtered</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Halal-certified processing</p>
                      </div>
                    </div>
                    <Switch
                      checked={form.badgeHandSlaughtered}
                      onCheckedChange={(checked) => updateField('badgeHandSlaughtered', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-[var(--border-default)]/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">&#128138;</span>
                      <div>
                        <p className="text-sm text-[var(--text-primary)]">No Antibiotics</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Pasture-raised, antibiotic-free</p>
                      </div>
                    </div>
                    <Switch
                      checked={form.badgeNoAntibiotics}
                      onCheckedChange={(checked) => updateField('badgeNoAntibiotics', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-[var(--border-default)]/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">&#129482;</span>
                      <div>
                        <p className="text-sm text-[var(--text-primary)]">Cold Chain</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Temperature-controlled farm to door</p>
                      </div>
                    </div>
                    <Switch
                      checked={form.badgeColdChain}
                      onCheckedChange={(checked) => updateField('badgeColdChain', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-[var(--border-default)]/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">&#10003;</span>
                      <div>
                        <p className="text-sm text-[var(--text-primary)]">100% Fresh</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Never frozen</p>
                      </div>
                    </div>
                    <Switch
                      checked={form.badgeFresh}
                      onCheckedChange={(checked) => updateField('badgeFresh', checked)}
                    />
                  </div>
                </div>

                {/* ── Available at locations ──────────────────────────── */}
                <div className="rounded-lg border border-[var(--border-default)] p-4 md:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Available at locations
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Choose where this product can be ordered. "All locations" makes it
                        catalog-wide.
                      </p>
                    </div>
                  </div>

                  {!isAdmin && (
                    <p className="mb-3 rounded-md bg-[var(--surface-tertiary)]/40 px-3 py-2 text-xs text-[var(--text-tertiary)]">
                      As a store {authUser?.role === 'store_manager' ? 'manager' : 'staff'}, this
                      product is locked to your assigned store
                      {authUser?.assignedLocationName ? ` (${authUser.assignedLocationName})` : ''}
                      . Only an admin can list it at multiple stores.
                    </p>
                  )}

                  {/* Mode toggle */}
                  <div className="mb-4 flex gap-2">
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => updateField('locationMode', 'all')}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                        form.locationMode === 'all'
                          ? 'border-primary-500 bg-primary-500/10 text-primary-500'
                          : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
                      } ${!isAdmin ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      All locations
                    </button>
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => {
                        // When switching to specific, default to whatever's
                        // already in form.locationIds; if empty, leave empty
                        // and let the user pick.
                        updateField('locationMode', 'specific');
                      }}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                        form.locationMode === 'specific'
                          ? 'border-primary-500 bg-primary-500/10 text-primary-500'
                          : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
                      } ${!isAdmin ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      Specific locations
                    </button>
                  </div>

                  {/* Location checkboxes + per-location price overrides.
                      The price input next to a checked store lets admin
                      charge a different amount at that location. Empty
                      means "inherit the base price". Only visible when
                      'specific' mode is active. */}
                  {form.locationMode === 'specific' && (
                    <>
                      <p className="mb-2 text-xs text-[var(--text-tertiary)]">
                        Price column is optional. Leave blank to use the base price (${form.priceDollars || '0.00'}). Set a value to charge a different amount at that store.
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {allLocations.map((loc) => {
                          const checked = form.locationIds.includes(loc.id);
                          const lockedToOther =
                            !isAdmin && myLocationId !== null && loc.id !== myLocationId;
                          return (
                            <div
                              key={loc.id}
                              className={`flex items-center gap-2 rounded-md border border-[var(--border-default)] px-3 py-2 text-sm transition-colors ${
                                checked
                                  ? 'border-primary-500/50 bg-primary-500/5'
                                  : 'hover:bg-[var(--surface-tertiary)]/40'
                              } ${lockedToOther ? 'opacity-40' : ''}`}
                            >
                              <label className={`flex flex-1 items-center gap-2 ${lockedToOther ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={lockedToOther}
                                  onChange={(e) => {
                                    if (lockedToOther) return;
                                    const next = e.target.checked
                                      ? [...form.locationIds, loc.id]
                                      : form.locationIds.filter((x) => x !== loc.id);
                                    updateField('locationIds', next);
                                  }}
                                  className="h-4 w-4 accent-primary-500"
                                />
                                <span className="truncate text-[var(--text-primary)]">{loc.name}</span>
                              </label>
                              <div className="relative w-28 shrink-0">
                                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="base"
                                  disabled={!checked || lockedToOther}
                                  value={form.locationPriceDollars[loc.id] ?? ''}
                                  onChange={(e) => {
                                    setForm((prev) => ({
                                      ...prev,
                                      locationPriceDollars: {
                                        ...prev.locationPriceDollars,
                                        [loc.id]: e.target.value,
                                      },
                                    }));
                                    setIsDirty(true);
                                  }}
                                  className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-tertiary)] py-1.5 pl-5 pr-2 text-xs text-[var(--text-primary)] focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {form.locationMode === 'specific' && form.locationIds.length === 0 && (
                    <p className="mt-2 text-xs text-danger">
                      Pick at least one location, or switch to "All locations".
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Halal Certification Section ──────────────────────────────────── */}
      <Card
        className={`transition-colors ${
          form.isHalal
            ? 'border-green-500/40 bg-green-50/60 dark:bg-green-950/20'
            : ''
        }`}
      >
        <CardContent className="p-6 space-y-5">
          {/* Halal Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">&#9770;&#65039;</span>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Halal Certification
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Enable to add halal certification details for this product
                </p>
              </div>
            </div>
            <Switch
              checked={form.isHalal}
              onCheckedChange={(checked) => updateField('isHalal', checked)}
            />
          </div>

          {form.isHalal && (
            <div className="space-y-6 pt-2">
              {/* Production Details */}
              <div>
                <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">
                  Production Details
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Production Date</label>
                    <Input
                      placeholder="e.g. 2025-03-15"
                      value={form.halalInfo.productionDate}
                      onChange={(e) => updateHalalField('productionDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Lot Number</label>
                    <Input
                      placeholder="e.g. LOT-2025-0342"
                      value={form.halalInfo.lotNumber}
                      onChange={(e) => updateHalalField('lotNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Distributor</label>
                    <Input
                      placeholder="e.g. Good Crazy Meat Distribution"
                      value={form.halalInfo.distributor}
                      onChange={(e) => updateHalalField('distributor', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Weight Range</label>
                    <Input
                      placeholder="e.g. 3.5 - 4.5 lbs"
                      value={form.halalInfo.weightRange}
                      onChange={(e) => updateHalalField('weightRange', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Processor Information */}
              <div>
                <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">
                  Processor Information
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Processor Name</label>
                    <Input
                      placeholder="e.g. Sanderson Farms"
                      value={form.halalInfo.processorName}
                      onChange={(e) => updateHalalField('processorName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Processor Claims</label>
                    <Input
                      placeholder="e.g. No Antibiotics Ever, Humanely Raised"
                      value={form.halalInfo.processorClaims}
                      onChange={(e) => updateHalalField('processorClaims', e.target.value)}
                    />
                    <p className="text-xs text-[var(--text-tertiary)]">Comma-separated list</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Verified Claims</label>
                    <Input
                      placeholder="e.g. USDA Inspected, No Added Hormones"
                      value={form.halalInfo.verifiedClaims}
                      onChange={(e) => updateHalalField('verifiedClaims', e.target.value)}
                    />
                    <p className="text-xs text-[var(--text-tertiary)]">Comma-separated list</p>
                  </div>
                </div>
              </div>

              {/* Halal Certification Details */}
              <div>
                <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">
                  Halal Certification Details
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Certifying Body</label>
                    <Input
                      placeholder="e.g. Islamic Society of North America (ISNA)"
                      value={form.halalInfo.certifyingBody}
                      onChange={(e) => updateHalalField('certifyingBody', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Certificate Number</label>
                    <Input
                      placeholder="e.g. ISNA-2025-00142"
                      value={form.halalInfo.certificateNumber}
                      onChange={(e) => updateHalalField('certificateNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Valid Until</label>
                    <Input
                      placeholder="e.g. 2026-03-15"
                      value={form.halalInfo.validUntil}
                      onChange={(e) => updateHalalField('validUntil', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Slaughter Method Details</label>
                    <textarea
                      rows={3}
                      className="flex w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                      placeholder="Describe the halal slaughter method and any relevant details..."
                      value={form.halalInfo.slaughterMethod}
                      onChange={(e) => updateHalalField('slaughterMethod', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{product?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={onDelete}
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
