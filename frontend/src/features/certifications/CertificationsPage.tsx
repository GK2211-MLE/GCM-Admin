import { useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck, Save, ChevronDown, ChevronRight, ImageIcon, Search } from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { resolveImageSrc } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';
import { Badge } from '@/components/ui/badge';

// Mirrors the HalalInfo shape on ProductDetailPage so the cert details
// admin types here are byte-compatible with what individual products
// already store. (Source-of-truth field names live on the backend
// products.halalInfo jsonb.)
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

interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  category: string;
  imageUrl: string;
  isHalal?: boolean;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export function CertificationsPage() {
  const queryClient = useQueryClient();

  // ── Cert detail form state ────────────────────────────────────
  const [info, setInfo] = useState<HalalInfo>(EMPTY_HALAL_INFO);
  const updateInfo = useCallback(<K extends keyof HalalInfo>(k: K, v: HalalInfo[K]) => {
    setInfo((prev) => ({ ...prev, [k]: v }));
  }, []);

  // ── Selection state ───────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  // Track collapsed category groups so admin can fold long lists.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // ── Products query ────────────────────────────────────────────
  // Fetch every product (active or not) so admin can certify
  // archived SKUs too if needed. Cap at 500 — we'll paginate later if
  // a tenant grows past that.
  const { data: products = [], isLoading } = useQuery({
    queryKey: queryKeys.products.list({ all: true }),
    queryFn: async () => {
      const { data } = await apiClient.get<{ products: AdminProduct[] }>('/products?limit=500');
      return data.products;
    },
  });

  // Group by category, alphabetically inside each group, categories
  // alphabetical themselves. Search filter is applied client-side
  // since we already have the full list.
  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? products.filter((p) => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term))
      : products;
    const map = new Map<string, AdminProduct[]>();
    for (const p of filtered) {
      const cat = p.category || 'uncategorized';
      const arr = map.get(cat) ?? [];
      arr.push(p);
      map.set(cat, arr);
    }
    const sortedCats = Array.from(map.keys()).sort();
    return sortedCats.map((cat) => ({
      category: cat,
      products: map.get(cat)!.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [products, search]);

  const totalCertified = useMemo(
    () => products.filter((p) => p.isHalal).length,
    [products],
  );

  // ── Selection helpers ─────────────────────────────────────────
  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleCategory = (catProducts: AdminProduct[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allChecked = catProducts.every((p) => next.has(p.id));
      if (allChecked) {
        for (const p of catProducts) next.delete(p.id);
      } else {
        for (const p of catProducts) next.add(p.id);
      }
      return next;
    });
  };
  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  const selectAll = () => {
    setSelectedIds(new Set(products.map((p) => p.id)));
  };
  const clearAll = () => {
    setSelectedIds(new Set());
  };

  // ── Save mutation ─────────────────────────────────────────────
  // Hits the new bulk-halal endpoint with the selected ids + the
  // cert details. Splits processorClaims / verifiedClaims into
  // arrays the same way the per-product page does.
  const certify = useMutation({
    mutationFn: async () => {
      const halalInfo = {
        ...info,
        processorClaims: info.processorClaims
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        verifiedClaims: info.verifiedClaims
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const { data } = await apiClient.post('/products/halal-certify', {
        productIds: Array.from(selectedIds),
        halalInfo,
        isHalal: true,
      });
      return data;
    },
    onSuccess: (data: any) => {
      const updated = data?.updatedCount ?? 0;
      const skipped = data?.skipped ?? 0;
      toast.success(
        skipped > 0
          ? `Certified ${updated} product(s). ${skipped} skipped (not in this tenant).`
          : `Certified ${updated} product(s).`,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      setSelectedIds(new Set());
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Could not apply certification';
      toast.error(msg);
    },
  });

  const canSave = selectedIds.size > 0 && info.certifyingBody.trim().length > 0;

  if (isLoading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certifications"
        description="Enter Halal certificate details once and apply them to many products at the same time."
        actions={
          <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <Badge variant="success">{totalCertified} certified</Badge>
            <Badge variant="info">{selectedIds.size} selected</Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Left: cert detail form ─────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-success" />
                <h3 className="font-semibold text-[var(--text-primary)]">Certificate Details</h3>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] -mt-3">
                These fields are written into every selected product's
                Halal certification block. You only need to fill them in
                once per certification batch.
              </p>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">Certifying body *</label>
                <Input
                  placeholder="e.g. Halal Food Council USA"
                  value={info.certifyingBody}
                  onChange={(e) => updateInfo('certifyingBody', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Certificate #</label>
                  <Input
                    placeholder="HFC-2026-001"
                    value={info.certificateNumber}
                    onChange={(e) => updateInfo('certificateNumber', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Valid until</label>
                  <Input
                    type="date"
                    value={info.validUntil}
                    onChange={(e) => updateInfo('validUntil', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">Slaughter method</label>
                <Input
                  placeholder="Hand-slaughtered, Zabiha"
                  value={info.slaughterMethod}
                  onChange={(e) => updateInfo('slaughterMethod', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Production date</label>
                  <Input
                    type="date"
                    value={info.productionDate}
                    onChange={(e) => updateInfo('productionDate', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">Lot number</label>
                  <Input
                    placeholder="Optional"
                    value={info.lotNumber}
                    onChange={(e) => updateInfo('lotNumber', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">Distributor</label>
                <Input
                  value={info.distributor}
                  onChange={(e) => updateInfo('distributor', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">Weight range</label>
                <Input
                  placeholder="e.g. 1.0 – 1.5 lbs"
                  value={info.weightRange}
                  onChange={(e) => updateInfo('weightRange', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">Processor name</label>
                <Input
                  value={info.processorName}
                  onChange={(e) => updateInfo('processorName', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">Processor claims</label>
                <Input
                  placeholder="Comma-separated, e.g. No antibiotics, Pasture raised"
                  value={info.processorClaims}
                  onChange={(e) => updateInfo('processorClaims', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">Verified claims</label>
                <Input
                  placeholder="Comma-separated"
                  value={info.verifiedClaims}
                  onChange={(e) => updateInfo('verifiedClaims', e.target.value)}
                />
              </div>

              <Button
                onClick={() => certify.mutate()}
                disabled={!canSave || certify.isPending}
                className="w-full"
              >
                <Save className="mr-2 h-4 w-4" />
                {certify.isPending
                  ? 'Applying...'
                  : `Apply to ${selectedIds.size} selected`}
              </Button>
              {!canSave && (
                <p className="text-xs text-[var(--text-tertiary)] text-center">
                  Pick at least one product and enter the certifying body to apply.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: product picker, grouped by category ─────── */}
        <div className="lg:col-span-3 space-y-3">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Select products to certify
                </h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    Select all
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                <Input
                  placeholder="Search products or categories"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {grouped.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
                  No products match "{search}".
                </p>
              ) : (
                <div className="space-y-3">
                  {grouped.map(({ category, products: catProducts }) => {
                    const isCollapsed = collapsed.has(category);
                    const allChecked = catProducts.every((p) => selectedIds.has(p.id));
                    const someChecked = catProducts.some((p) => selectedIds.has(p.id));
                    return (
                      <div
                        key={category}
                        className="rounded-lg border border-[var(--border-default)] overflow-hidden"
                      >
                        <div className="flex items-center gap-3 px-3 py-2 bg-[var(--surface-tertiary)]/40">
                          <button
                            type="button"
                            onClick={() => toggleCollapse(category)}
                            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            title={isCollapsed ? 'Expand' : 'Collapse'}
                          >
                            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                            onChange={() => toggleCategory(catProducts)}
                            className="h-4 w-4 accent-primary-500"
                          />
                          <span className="font-medium text-sm text-[var(--text-primary)] flex-1">
                            {capitalize(category)}
                          </span>
                          <span className="text-xs text-[var(--text-tertiary)]">
                            {catProducts.filter((p) => selectedIds.has(p.id)).length} / {catProducts.length}
                          </span>
                        </div>

                        {!isCollapsed && (
                          <div className="divide-y divide-[var(--border-default)]/50">
                            {catProducts.map((p) => {
                              const checked = selectedIds.has(p.id);
                              return (
                                <label
                                  key={p.id}
                                  className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors ${
                                    checked
                                      ? 'bg-primary-500/5'
                                      : 'hover:bg-[var(--surface-tertiary)]/40'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleProduct(p.id)}
                                    className="h-4 w-4 accent-primary-500"
                                  />
                                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded border border-[var(--border-default)] bg-[var(--surface-tertiary)] flex-shrink-0">
                                    {p.imageUrl ? (
                                      <img
                                        src={resolveImageSrc(p.imageUrl)}
                                        alt={p.name}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <ImageIcon className="h-4 w-4 text-[var(--text-tertiary)]" />
                                    )}
                                  </div>
                                  <span className="flex-1 truncate text-[var(--text-primary)]">
                                    {p.name}
                                  </span>
                                  {p.isHalal && (
                                    <Badge variant="success" className="text-[10px] px-1.5 py-0">
                                      Certified
                                    </Badge>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
