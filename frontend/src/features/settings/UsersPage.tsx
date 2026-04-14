import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
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
import { Plus, Pencil, Trash2, Search, Shield, Mail, Phone as PhoneIcon, MapPin } from 'lucide-react';

/**
 * Users & Permissions page.
 *
 * Replaces the old approve/reject queue with full user CRUD modeled after
 * the legacy admin panel. Three fixed roles:
 *   - admin           (red)    — full access, no location pinning
 *   - store_manager   (orange) — manage one assigned store
 *   - store_staff     (blue)   — view-only for one assigned store
 *
 * The location dropdown is hidden when role=admin (forced to "All
 * locations") and required for the other two roles. Backend validates the
 * same rule, so even an HTML/JS-bypassed form is rejected server-side.
 */

type Role = 'admin' | 'store_manager' | 'store_staff';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
  assignedLocationId: string | null;
  assignedLocationName: string | null;
  createdAt: string;
}

interface LocationOption {
  id: string;
  name: string;
}

interface UserFormData {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Role;
  assignedLocationId: string | null;
  active: boolean;
}

const EMPTY_FORM: UserFormData = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'store_staff',
  assignedLocationId: null,
  active: true,
};

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  store_manager: 'Store Manager',
  store_staff: 'Store Staff',
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full access to all stores and settings',
  store_manager: 'Manage assigned store orders, inventory, staff',
  store_staff: 'View and update orders for assigned store',
};

function roleBadgeVariant(role: Role): 'danger' | 'warning' | 'info' {
  if (role === 'admin') return 'danger';
  if (role === 'store_manager') return 'warning';
  return 'info';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// User Form Dialog
// ---------------------------------------------------------------------------

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: AdminUser | null;
  locations: LocationOption[];
  locationsError?: boolean;
  onRetryLocations?: () => void;
  onSubmit: (data: UserFormData) => void;
  isPending: boolean;
}

function UserFormDialog({
  open,
  onOpenChange,
  initialData,
  locations,
  locationsError,
  onRetryLocations,
  onSubmit,
  isPending,
}: UserFormDialogProps) {
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});

  const isEditing = !!initialData;

  // Reset the form whenever the dialog is opened (by any means — parent's
  // "Add User" button sets `open=true` programmatically, which does NOT
  // fire onOpenChange, so we need this effect to catch those cases too).
  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setForm({
        name: initialData.name,
        email: initialData.email,
        phone: initialData.phone ?? '',
        password: '', // never prefill — empty means "leave unchanged"
        role: initialData.role,
        assignedLocationId: initialData.assignedLocationId,
        active: initialData.active,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
  }, [open, initialData]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const setField = useCallback(
    <K extends keyof UserFormData>(key: K, value: UserFormData[K]) => {
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
    const next: Partial<Record<keyof UserFormData, string>> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.email.trim()) next.email = 'Email is required';
    else if (!/.+@.+\..+/.test(form.email)) next.email = 'Invalid email';
    if (!isEditing && form.password.length < 6) next.password = 'Min 6 characters';
    if (isEditing && form.password.length > 0 && form.password.length < 6) {
      next.password = 'Min 6 characters (or leave blank to keep current)';
    }
    if (form.role !== 'admin' && !form.assignedLocationId) {
      next.assignedLocationId = 'Required for store manager / store staff';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, isEditing]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      onSubmit(form);
    },
    [form, validate, onSubmit],
  );

  // When role changes to admin, force the assignment to null. Otherwise
  // leave whatever was already selected.
  const handleRoleChange = useCallback(
    (role: Role) => {
      setForm((prev) => ({
        ...prev,
        role,
        assignedLocationId: role === 'admin' ? null : prev.assignedLocationId,
      }));
      setErrors((prev) => {
        if (!prev.assignedLocationId) return prev;
        const next = { ...prev };
        delete next.assignedLocationId;
        return next;
      });
    },
    [],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit User' : 'Add User'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the user account details and access.'
              : 'Create a new admin / store manager / store staff account.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-(--text-primary)">
              Full Name <span className="text-danger">*</span>
            </label>
            <Input
              placeholder="Jane Doe"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              error={errors.name}
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-(--text-primary)">
              Email <span className="text-danger">*</span>
            </label>
            <Input
              type="email"
              placeholder="jane@farm2cook.com"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              error={errors.email}
            />
          </div>

          {/* Phone (optional) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-(--text-primary)">Phone</label>
            <Input
              placeholder="(555) 123-4567"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-(--text-primary)">
              Password {!isEditing && <span className="text-danger">*</span>}
            </label>
            <Input
              type="password"
              placeholder={isEditing ? 'Leave blank to keep current' : 'At least 6 characters'}
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              error={errors.password}
            />
          </div>

          {/* Role */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-(--text-primary)">
              Role <span className="text-danger">*</span>
            </label>
            <Select value={form.role} onValueChange={(v) => handleRoleChange(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — full access</SelectItem>
                <SelectItem value="store_manager">Store Manager</SelectItem>
                <SelectItem value="store_staff">Store Staff</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-(--text-tertiary)">
              {ROLE_DESCRIPTIONS[form.role]}
            </p>
          </div>

          {/* Assigned Location — hidden for admin */}
          {form.role !== 'admin' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-(--text-primary)">
                Assigned Location <span className="text-danger">*</span>
              </label>
              {locationsError ? (
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
                  <p className="font-medium">Could not load locations.</p>
                  <p className="mt-1 text-(--text-tertiary)">
                    This usually clears up after a few seconds on Render cold-start.
                  </p>
                  {onRetryLocations && (
                    <button
                      type="button"
                      onClick={onRetryLocations}
                      className="mt-2 text-xs font-semibold underline"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ) : locations.length === 0 ? (
                <p className="rounded-lg border border-(--border-default) bg-(--bg-muted) p-3 text-xs text-(--text-tertiary)">
                  Loading locations...
                </p>
              ) : (
                <Select
                  value={form.assignedLocationId ?? ''}
                  onValueChange={(v) => setField('assignedLocationId', v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {errors.assignedLocationId && (
                <p className="mt-1 text-xs text-danger">{errors.assignedLocationId}</p>
              )}
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-lg border border-(--border-default) p-4">
            <div>
              <p className="text-sm font-medium text-(--text-primary)">Active</p>
              <p className="text-xs text-(--text-tertiary)">
                Inactive users cannot log in
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
              {isPending ? (isEditing ? 'Saving...' : 'Adding...') : isEditing ? 'Save Changes' : 'Add User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  onConfirm: () => void;
  isPending: boolean;
}

function DeleteDialog({ open, onOpenChange, user, onConfirm, isPending }: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{user?.name}</strong>? This action cannot be undone.
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
// Main page
// ---------------------------------------------------------------------------

export function UsersPage() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: queryKeys.settings.users(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ users: AdminUser[] }>('/users');
      return data.users;
    },
  });

  const {
    data: locations = [],
    isError: locationsError,
    refetch: refetchLocations,
  } = useQuery({
    queryKey: queryKeys.settings.locations(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ locations: LocationOption[] }>('/locations/all');
      return data.locations;
    },
    // Retry once — CORS cold-starts on Render sometimes drop the
    // Access-Control-Allow-Origin header on the very first request.
    retry: 1,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: UserFormData) =>
      apiClient.post('/users', {
        ...data,
        phone: data.phone || undefined,
        assignedLocationId: data.assignedLocationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.users() });
      toast.success('User created');
      setFormOpen(false);
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? // axios-shaped error
            (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to create user'
          : 'Failed to create user';
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserFormData }) => {
      // Don't send empty password — backend leaves it untouched.
      const payload: Partial<UserFormData> = { ...data };
      if (!payload.password) delete payload.password;
      return apiClient.put('/users/' + id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.users() });
      toast.success('User updated');
      setFormOpen(false);
      setEditingUser(null);
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to update user'
          : 'Failed to update user';
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete('/users/' + id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.users() });
      toast.success('User deleted');
      setDeleteOpen(false);
      setDeletingUser(null);
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to delete user'
          : 'Failed to delete user';
      toast.error(message);
    },
  });

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q) {
        return (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.phone ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, search, roleFilter]);

  // Handlers
  const handleAdd = useCallback(() => {
    setEditingUser(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((user: AdminUser) => {
    setEditingUser(user);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback((user: AdminUser) => {
    setDeletingUser(user);
    setDeleteOpen(true);
  }, []);

  const handleFormSubmit = useCallback(
    (data: UserFormData) => {
      if (editingUser) {
        updateMutation.mutate({ id: editingUser.id, data });
      } else {
        createMutation.mutate(data);
      }
    },
    [editingUser, createMutation, updateMutation],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deletingUser) deleteMutation.mutate(deletingUser.id);
  }, [deletingUser, deleteMutation]);

  return (
    <div>
      <PageHeader
        title="Users & Permissions"
        description="Manage admin, store manager, and store staff accounts"
        actions={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as 'all' | Role)}>
          <SelectTrigger className="w-full sm:w-52">
            <Shield className="mr-2 h-4 w-4 text-(--text-tertiary)" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="store_manager">Store Manager</SelectItem>
            <SelectItem value="store_staff">Store Staff</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-(--border-default) bg-(--surface-secondary)">
        <table className="w-full text-sm">
          <thead className="border-b border-(--border-default) bg-(--surface-tertiary)/50 text-left text-xs uppercase tracking-wider text-(--text-tertiary)">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border-default)">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-4">
                    <div className="h-4 w-32 rounded bg-(--surface-tertiary)" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-5 w-20 rounded-full bg-(--surface-tertiary)" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-24 rounded bg-(--surface-tertiary)" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-16 rounded bg-(--surface-tertiary)" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-20 rounded bg-(--surface-tertiary)" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="ml-auto h-8 w-16 rounded bg-(--surface-tertiary)" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-(--text-tertiary)">
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr
                  key={user.id}
                  className={cn('transition-colors hover:bg-(--surface-tertiary)/30', !user.active && 'opacity-60')}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-(--text-primary)">{user.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-(--text-tertiary)">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {user.email}
                      </span>
                      {user.phone && (
                        <span className="inline-flex items-center gap-1">
                          <PhoneIcon className="h-3 w-3" /> {user.phone}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={roleBadgeVariant(user.role)}>{ROLE_LABELS[user.role]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-(--text-secondary)">
                      <MapPin className="h-3.5 w-3.5 text-(--text-tertiary)" />
                      {user.role === 'admin' ? 'All locations' : user.assignedLocationName ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.active ? 'success' : 'danger'}>
                      {user.active ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-(--text-secondary)">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleEdit(user)}
                        aria-label={`Edit ${user.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-danger hover:text-danger"
                        onClick={() => handleDelete(user)}
                        aria-label={`Delete ${user.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <UserFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingUser(null);
        }}
        initialData={editingUser}
        locations={locations}
        locationsError={locationsError}
        onRetryLocations={() => refetchLocations()}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeletingUser(null);
        }}
        user={deletingUser}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
