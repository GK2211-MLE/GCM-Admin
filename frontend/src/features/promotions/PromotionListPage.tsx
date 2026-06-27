import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data-table/DataTable';
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
import { Plus, Pencil, Trash2, Tag, Megaphone } from 'lucide-react';
import { ImageField } from '@/components/ui/image-field';

interface Promotion {
  id: string;
  code: string;
  description: string;
  discountType: string;
  discountValue: number;
  minOrder: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
  // Customer-facing popup fields (added Apr 2026)
  imageUrl?: string;
  showAsPopup?: boolean;
  popupTitle?: string;
  popupBody?: string;
  targetWeb?: boolean;
  targetApp?: boolean;
}

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'percent',
  discountValue: '',
  minOrder: '0',
  maxUses: '0',
  active: true,
  startsAt: '',
  expiresAt: '',
  // Popup defaults: off, no image, target both portals
  imageUrl: '',
  showAsPopup: false,
  popupTitle: '',
  popupBody: '',
  targetWeb: true,
  targetApp: true,
};

export function PromotionListPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Promotion | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.promotions.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ promotions: Promotion[] }>('/promotions');
      return data.promotions;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editTarget) {
        return apiClient.put(`/promotions/${editTarget.id}`, payload);
      }
      return apiClient.post('/promotions', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promotions.list() });
      toast.success(editTarget ? 'Promotion updated' : 'Promotion created');
      setFormOpen(false);
      setEditTarget(null);
    },
    // No onError needed — global axios interceptor surfaces the error message.
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/promotions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promotions.list() });
      toast.success('Promotion deleted');
      setDeleteTarget(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      apiClient.put(`/promotions/${id}`, { active }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.promotions.list() });
      toast.success(vars.active ? 'Promotion activated' : 'Promotion deactivated');
    },
  });

  const handleAdd = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((promo: Promotion) => {
    setEditTarget(promo);
    setForm({
      code: promo.code,
      description: promo.description,
      discountType: promo.discountType,
      discountValue: String(promo.discountType === 'fixed' ? promo.discountValue / 100 : promo.discountValue),
      minOrder: String(promo.minOrder / 100),
      maxUses: String(promo.maxUses),
      active: promo.active,
      startsAt: promo.startsAt?.split('T')[0] ?? '',
      expiresAt: promo.expiresAt?.split('T')[0] ?? '',
      imageUrl: promo.imageUrl ?? '',
      showAsPopup: promo.showAsPopup ?? false,
      popupTitle: promo.popupTitle ?? '',
      popupBody: promo.popupBody ?? '',
      targetWeb: promo.targetWeb ?? true,
      targetApp: promo.targetApp ?? true,
    });
    setFormOpen(true);
  }, []);

  const handleSubmit = useCallback(() => {
    // Client-side validation: prevent NaN being JSON-serialized as null
    // and rejected by the backend Zod schema. Each field gets its own
    // user-friendly toast.
    if (!form.code.trim()) {
      toast.error('Code is required');
      return;
    }
    const rawDiscount = form.discountValue.trim();
    if (!rawDiscount) {
      toast.error('Discount value is required');
      return;
    }
    const parsedDiscount = parseFloat(rawDiscount);
    if (Number.isNaN(parsedDiscount) || parsedDiscount <= 0) {
      toast.error('Discount value must be a positive number');
      return;
    }
    if (form.discountType === 'percent' && parsedDiscount > 100) {
      toast.error('Percentage discount cannot exceed 100');
      return;
    }

    const discountValue = form.discountType === 'fixed'
      ? Math.round(parsedDiscount * 100)
      : parsedDiscount;

    // Other numeric fields default safely to 0 if blank
    const parsedMinOrder = parseFloat(form.minOrder || '0');
    const parsedMaxUses = parseInt(form.maxUses || '0', 10);

    saveMutation.mutate({
      code: form.code.toUpperCase().trim(),
      description: form.description,
      discountType: form.discountType,
      discountValue,
      minOrder: Math.round((Number.isNaN(parsedMinOrder) ? 0 : parsedMinOrder) * 100),
      maxUses: Number.isNaN(parsedMaxUses) ? 0 : parsedMaxUses,
      active: form.active,
      startsAt: form.startsAt
        ? new Date(form.startsAt).toISOString()
        : new Date().toISOString(),
      expiresAt: form.expiresAt
        ? new Date(form.expiresAt).toISOString()
        : new Date('2030-12-31').toISOString(),
      imageUrl: form.imageUrl,
      showAsPopup: form.showAsPopup,
      popupTitle: form.popupTitle,
      popupBody: form.popupBody,
      targetWeb: form.targetWeb,
      targetApp: form.targetApp,
    });
  }, [form, saveMutation]);

  const columns: ColumnDef<Promotion, unknown>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ getValue }) => (
        <span className="font-mono font-bold text-primary-500">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ getValue }) => (
        <span className="text-sm text-[var(--text-secondary)]">{getValue<string>() || '—'}</span>
      ),
    },
    {
      id: 'discount',
      header: 'Discount',
      cell: ({ row }) => {
        const p = row.original;
        return (
          <Badge variant="info">
            {p.discountType === 'percent' ? `${p.discountValue}% off` : `$${(p.discountValue / 100).toFixed(2)} off`}
          </Badge>
        );
      },
    },
    {
      id: 'minOrder',
      header: 'Min Order',
      cell: ({ row }) => row.original.minOrder > 0 ? `$${(row.original.minOrder / 100).toFixed(2)}` : 'None',
    },
    {
      id: 'usage',
      header: 'Usage',
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.usedCount} / {row.original.maxUses === 0 ? '∞' : row.original.maxUses}
        </span>
      ),
    },
    {
      id: 'dates',
      header: 'Valid Period',
      cell: ({ row }) => (
        <span className="text-xs text-[var(--text-tertiary)]">
          {formatDate(row.original.startsAt)} — {formatDate(row.original.expiresAt)}
        </span>
      ),
    },
    {
      id: 'active',
      header: 'Active',
      cell: ({ row }) => (
        <Switch
          checked={row.original.active}
          onCheckedChange={(checked) => toggleMutation.mutate({ id: row.original.id, active: checked })}
        />
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 100,
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" type="button"
            onClick={() => handleEdit(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-danger" type="button"
            onClick={() => setDeleteTarget(row.original)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Promotions"
        description="Manage discount codes and promotions"
        actions={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Promotion
          </Button>
        }
      />
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} emptyMessage="No promotions found" />

      {/* Add/Edit Dialog
       * NOTE: scroll the BODY of the dialog, not the whole DialogContent,
       * so the footer (with Save button) stays visible at all viewport heights.
       */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          {/* Sticky header */}
          <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
            <DialogHeader>
              <DialogTitle>{editTarget ? 'Edit Promotion' : 'Add Promotion'}</DialogTitle>
              <DialogDescription>
                {editTarget ? 'Update the promotion details.' : 'Create a new promo code for your customers.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Code *</label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. WELCOME10" style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600 }} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Description</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. 10% off your first order" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Discount Type</label>
                <Select value={form.discountType} onValueChange={(v) => setForm({ ...form, discountType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Discount Value {form.discountType === 'percent' ? '(%)' : '($)'}
                </label>
                <Input type="number" step={form.discountType === 'percent' ? '1' : '0.01'}
                  value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  placeholder={form.discountType === 'percent' ? '10' : '5.00'} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Min Order ($)</label>
                <Input type="number" step="0.01" value={form.minOrder}
                  onChange={(e) => setForm({ ...form, minOrder: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Max Uses (0 = unlimited)</label>
                <Input type="number" value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Start Date</label>
                <Input type="date" value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Expiry Date</label>
                <Input type="date" value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Active</span>
              <Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} />
            </div>

            {/* ── Customer-facing popup section ───────────────────── */}
            <div className="rounded-xl border border-dashed border-[var(--border)] p-4 space-y-4 bg-[var(--bg-secondary)]/40">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-primary-500/10 p-2 text-primary-500">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Show as popup on customer site</div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      Display this promo as a centered modal on the homepage (once per session). Optionally show in the mobile app too.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={form.showAsPopup}
                  onCheckedChange={(checked) => setForm({ ...form, showAsPopup: checked })}
                />
              </div>

              {form.showAsPopup && (
                <div className="space-y-4 pt-2">
                  {/* Image upload / URL */}
                  <ImageField
                    label="Popup Image (optional)"
                    value={form.imageUrl}
                    onChange={(url) => setForm({ ...form, imageUrl: url })}
                    helper="Recommended 1600x900. Auto-resized on upload."
                  />

                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Popup Title (optional)</label>
                    <Input
                      value={form.popupTitle}
                      onChange={(e) => setForm({ ...form, popupTitle: e.target.value })}
                      placeholder="e.g. Welcome to Good Crazy Meat!"
                    />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Defaults to "Save {form.discountValue || 'X'}% OFF" if blank.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Popup Body (optional)</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      value={form.popupBody}
                      onChange={(e) => setForm({ ...form, popupBody: e.target.value })}
                      placeholder="A short message — falls back to the description if blank."
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Show in</label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3 cursor-pointer hover:border-primary-500/50">
                        <span className="text-sm">Customer Website</span>
                        <Switch
                          checked={form.targetWeb}
                          onCheckedChange={(checked) => setForm({ ...form, targetWeb: checked })}
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3 cursor-pointer hover:border-primary-500/50">
                        <span className="text-sm">Mobile App</span>
                        <Switch
                          checked={form.targetApp}
                          onCheckedChange={(checked) => setForm({ ...form, targetApp: checked })}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
                      Both portals show the popup by default. Uncheck to limit it.
                    </p>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
          {/* Sticky footer */}
          <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-primary)]">
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={saveMutation.isPending || !form.code.trim()}>
                {saveMutation.isPending ? 'Saving...' : editTarget ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Promotion</DialogTitle>
            <DialogDescription>
              Delete promo code <strong>{deleteTarget?.code}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
