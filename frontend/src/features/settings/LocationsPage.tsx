import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Plus,
  Search,
  Pencil,
  Trash2,
  Building2,
  Map,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  phone: string;
  email?: string;
  operatingHours?: string;
  active: boolean;
  lat?: number;
  lng?: number;
  taxRate?: number;
}

type LocationFormData = Omit<Location, 'id' | 'lat' | 'lng' | 'taxRate'>;

const EMPTY_FORM: LocationFormData = {
  name: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  type: 'Store',
  phone: '',
  email: '',
  operatingHours: '',
  active: true,
};

const LOCATION_TYPES = ['Store', 'Warehouse', 'Office'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeBadgeVariant(type: string): 'info' | 'warning' | 'default' {
  switch (type) {
    case 'Store':
      return 'info';
    case 'Warehouse':
      return 'warning';
    default:
      return 'default';
  }
}

// ---------------------------------------------------------------------------
// Skeleton Card
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-2">
          <div className="h-5 w-36 rounded bg-[var(--surface-tertiary)]" />
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded-full bg-[var(--surface-tertiary)]" />
            <div className="h-5 w-14 rounded-full bg-[var(--surface-tertiary)]" />
          </div>
        </div>
        <div className="flex gap-1">
          <div className="h-8 w-8 rounded-lg bg-[var(--surface-tertiary)]" />
          <div className="h-8 w-8 rounded-lg bg-[var(--surface-tertiary)]" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-4 w-full rounded bg-[var(--surface-tertiary)]" />
        <div className="h-4 w-28 rounded bg-[var(--surface-tertiary)]" />
        <div className="h-4 w-40 rounded bg-[var(--surface-tertiary)]" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] py-16 text-center">
      <Map className="mb-4 h-12 w-12 text-[var(--text-tertiary)]" />
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
        {hasFilters ? 'No matching locations' : 'No locations yet'}
      </h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {hasFilters
          ? 'Try adjusting your search or filter criteria.'
          : 'Get started by adding your first location.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Location Card
// ---------------------------------------------------------------------------

interface LocationCardProps {
  location: Location;
  onEdit: (location: Location) => void;
  onDelete: (location: Location) => void;
}

function LocationCard({ location, onEdit, onDelete }: LocationCardProps) {
  return (
    <Card className={cn(!location.active && 'opacity-60')}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base">{location.name}</CardTitle>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant={typeBadgeVariant(location.type)}>{location.type}</Badge>
            <Badge variant={location.active ? 'success' : 'danger'}>
              {location.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
        <div className="ml-2 flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onEdit(location)}
            aria-label={`Edit ${location.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-danger hover:text-danger"
            onClick={() => onDelete(location)}
            aria-label={`Delete ${location.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <span>
            {location.address}, {location.city}, {location.state} {location.zip}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <span>{location.phone}</span>
        </div>

        {location.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            <span className="truncate">{location.email}</span>
          </div>
        )}

        {location.operatingHours && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            <span>{location.operatingHours}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Location Form Dialog
// ---------------------------------------------------------------------------

interface LocationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Location | null;
  onSubmit: (data: LocationFormData) => void;
  isPending: boolean;
}

function LocationFormDialog({
  open,
  onOpenChange,
  initialData,
  onSubmit,
  isPending,
}: LocationFormDialogProps) {
  const [form, setForm] = useState<LocationFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof LocationFormData, string>>>({});

  // Sync form state when dialog opens
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next && initialData) {
        setForm({
          name: initialData.name,
          address: initialData.address,
          city: initialData.city,
          state: initialData.state,
          zip: initialData.zip,
          type: initialData.type,
          phone: initialData.phone,
          email: initialData.email ?? '',
          operatingHours: initialData.operatingHours ?? '',
          active: initialData.active,
        });
      } else if (next) {
        setForm(EMPTY_FORM);
      }
      setErrors({});
      onOpenChange(next);
    },
    [initialData, onOpenChange],
  );

  const setField = useCallback(
    <K extends keyof LocationFormData>(key: K, value: LocationFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const validate = useCallback((): boolean => {
    const next: Partial<Record<keyof LocationFormData, string>> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.address.trim()) next.address = 'Address is required';
    if (!form.city.trim()) next.city = 'City is required';
    if (!form.state.trim()) next.state = 'State is required';
    if (!form.zip.trim()) next.zip = 'Zip is required';
    if (!form.phone.trim()) next.phone = 'Phone is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      onSubmit(form);
    },
    [form, validate, onSubmit],
  );

  const isEditing = !!initialData;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Location' : 'Add Location'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details for this location.'
              : 'Fill in the details for the new location.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Name <span className="text-danger">*</span>
            </label>
            <Input
              placeholder="Location name"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              error={errors.name}
            />
          </div>

          {/* Type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Type
            </label>
            <Select value={form.type} onValueChange={(v) => setField('type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Street Address <span className="text-danger">*</span>
            </label>
            <Input
              placeholder="123 Main St"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
              error={errors.address}
            />
          </div>

          {/* City / State / Zip */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                City <span className="text-danger">*</span>
              </label>
              <Input
                placeholder="City"
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
                error={errors.city}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                State <span className="text-danger">*</span>
              </label>
              <Input
                placeholder="State"
                value={form.state}
                onChange={(e) => setField('state', e.target.value)}
                error={errors.state}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                Zip <span className="text-danger">*</span>
              </label>
              <Input
                placeholder="Zip"
                value={form.zip}
                onChange={(e) => setField('zip', e.target.value)}
                error={errors.zip}
              />
            </div>
          </div>

          {/* Phone / Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                Phone <span className="text-danger">*</span>
              </label>
              <Input
                placeholder="(555) 123-4567"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                error={errors.phone}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                Email
              </label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </div>
          </div>

          {/* Operating Hours */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Operating Hours
            </label>
            <Input
              placeholder="Mon-Fri 9am-5pm"
              value={form.operatingHours}
              onChange={(e) => setField('operatingHours', e.target.value)}
            />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-default)] p-4">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Active</p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Inactive locations won't appear in the mobile app
              </p>
            </div>
            <Switch
              checked={form.active}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, active: checked }))}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (isEditing ? 'Saving...' : 'Adding...') : isEditing ? 'Save Changes' : 'Add Location'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: Location | null;
  onConfirm: () => void;
  isPending: boolean;
}

function DeleteDialog({ open, onOpenChange, location, onConfirm, isPending }: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Location</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{location?.name}</strong>? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function LocationsPage() {
  const queryClient = useQueryClient();

  // ---- Data fetching ----
  const { data: locations = [], isLoading } = useQuery({
    queryKey: queryKeys.settings.locations(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ locations: Location[] }>('/locations/all');
      return data.locations;
    },
  });

  // ---- Filter state ----
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // ---- Dialog state ----
  const [formOpen, setFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);

  // ---- Mutations ----
  const createMutation = useMutation({
    mutationFn: (data: LocationFormData) => apiClient.post('/locations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.locations() });
      toast.success('Location created');
      setFormOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: LocationFormData }) =>
      apiClient.put('/locations/' + id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.locations() });
      toast.success('Location updated');
      setFormOpen(false);
      setEditingLocation(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete('/locations/' + id);
      return res.data as { hardDeleted?: boolean; reason?: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.locations() });
      // Backend returns { hardDeleted, reason? }. Tell the user whether
      // the row was really removed or just archived because orders
      // still reference it, instead of pretending both are the same.
      if (data?.hardDeleted === false) {
        toast.success(`Location ${data.reason || 'archived (still referenced)'}`);
      } else {
        toast.success('Location deleted');
      }
      setDeleteOpen(false);
      setDeletingLocation(null);
    },
  });



  // ---- Filtered data ----
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return locations.filter((loc) => {
      if (typeFilter !== 'all' && loc.type !== typeFilter) return false;
      if (q) {
        return (
          loc.name.toLowerCase().includes(q) ||
          loc.address.toLowerCase().includes(q) ||
          loc.city.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [locations, search, typeFilter]);

  // ---- Handlers ----
  const handleAdd = useCallback(() => {
    setEditingLocation(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((location: Location) => {
    setEditingLocation(location);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback((location: Location) => {
    setDeletingLocation(location);
    setDeleteOpen(true);
  }, []);



  const handleFormSubmit = useCallback(
    (data: LocationFormData) => {
      if (editingLocation) {
        updateMutation.mutate({ id: editingLocation.id, data });
      } else {
        createMutation.mutate(data);
      }
    },
    [editingLocation, createMutation, updateMutation],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deletingLocation) {
      deleteMutation.mutate(deletingLocation.id);
    }
  }, [deletingLocation, deleteMutation]);

  const hasFilters = search !== '' || typeFilter !== 'all';

  return (
    <div>
      <PageHeader
        title="Locations"
        description="Manage your stores, warehouses, and offices"
        actions={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Location
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            className="pl-9"
            placeholder="Search by name, address, or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <Building2 className="mr-2 h-4 w-4 text-[var(--text-tertiary)]" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {LOCATION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <LocationFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingLocation(null);
        }}
        initialData={editingLocation}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeletingLocation(null);
        }}
        location={deletingLocation}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
