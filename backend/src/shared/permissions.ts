/**
 * Role + page-permission registry.
 *
 * Single source of truth for:
 *   - The 3 admin-side roles (admin / store_manager / store_staff).
 *   - The list of pages/features that can be permission-gated.
 *   - Default permissions for each non-admin role.
 *
 * IMPORTANT: PAGE_KEYS strings are persisted in the `role_permissions` table.
 * Changing or removing a key is a breaking change — add new keys instead.
 *
 * "admin" is intentionally NOT in the permission matrix because admins
 * always have full access by definition.
 */

export const ROLES = {
  ADMIN: 'admin',
  STORE_MANAGER: 'store_manager',
  STORE_STAFF: 'store_staff',
} as const;

export type AdminRole = (typeof ROLES)[keyof typeof ROLES];

/** Roles that participate in the permission matrix (i.e. not admin). */
export const MATRIX_ROLES = [ROLES.STORE_MANAGER, ROLES.STORE_STAFF] as const;
export type MatrixRole = (typeof MATRIX_ROLES)[number];

export function isValidRole(role: string): role is AdminRole {
  return role === ROLES.ADMIN || role === ROLES.STORE_MANAGER || role === ROLES.STORE_STAFF;
}

export function isMatrixRole(role: string): role is MatrixRole {
  return role === ROLES.STORE_MANAGER || role === ROLES.STORE_STAFF;
}

/**
 * Legacy → new role mapping. The old admin DB stored roles as
 * 'owner' / 'manager' / 'staff'. We accept those at the JWT layer
 * so existing tokens keep working through one deploy cycle.
 */
export function normalizeLegacyRole(role: string): AdminRole {
  if (role === 'owner') return ROLES.ADMIN;
  if (role === 'manager') return ROLES.STORE_MANAGER;
  if (role === 'staff') return ROLES.STORE_STAFF;
  if (isValidRole(role)) return role;
  // Unknown role → treat as least privileged
  return ROLES.STORE_STAFF;
}

/* ── Page registry ─────────────────────────────────────────────── */

export interface PageMeta {
  key: string;
  label: string;
  description: string;
  /** Default permission for store_manager when seeding role_permissions. */
  defaultStoreManager: boolean;
  /** Default permission for store_staff when seeding role_permissions. */
  defaultStoreStaff: boolean;
}

export const PAGES = [
  { key: 'dashboard',           label: 'Dashboard',           description: 'Overview stats & charts',     defaultStoreManager: true,  defaultStoreStaff: true  },
  { key: 'orders.view',         label: 'Orders (View)',       description: 'View and manage orders',      defaultStoreManager: true,  defaultStoreStaff: true  },
  { key: 'orders.create',       label: 'Orders (Create)',     description: 'Create new orders',           defaultStoreManager: true,  defaultStoreStaff: false },
  { key: 'products',            label: 'Products',            description: 'View and edit products',      defaultStoreManager: true,  defaultStoreStaff: false },
  { key: 'inventory',           label: 'Inventory',           description: 'Stock levels per location',   defaultStoreManager: true,  defaultStoreStaff: true  },
  { key: 'notifications',       label: 'Notifications',       description: 'Order & system alerts',       defaultStoreManager: true,  defaultStoreStaff: true  },
  { key: 'customers',           label: 'Customers',           description: 'Customer list & details',     defaultStoreManager: false, defaultStoreStaff: false },
  { key: 'payments',            label: 'Payments',            description: 'Payment transactions',        defaultStoreManager: false, defaultStoreStaff: false },
  { key: 'invoices',            label: 'Invoices',            description: 'Invoice management',          defaultStoreManager: false, defaultStoreStaff: false },
  { key: 'catalog',             label: 'Catalog',             description: 'Categories & catalog',        defaultStoreManager: false, defaultStoreStaff: false },
  { key: 'promotions',          label: 'Promotions',          description: 'Coupons & discounts',         defaultStoreManager: false, defaultStoreStaff: false },
  { key: 'analytics',           label: 'Analytics',           description: 'Reports & insights',          defaultStoreManager: false, defaultStoreStaff: false },
  { key: 'cms',                 label: 'CMS',                 description: 'Content management',          defaultStoreManager: false, defaultStoreStaff: false },
  { key: 'locations',           label: 'Locations',           description: 'Store locations',             defaultStoreManager: false, defaultStoreStaff: false },
  { key: 'users_permissions',   label: 'Users & Permissions', description: 'User management',             defaultStoreManager: false, defaultStoreStaff: false },
  { key: 'settings',            label: 'Settings',            description: 'App configuration',           defaultStoreManager: false, defaultStoreStaff: false },
] as const satisfies readonly PageMeta[];

export type PageKey = (typeof PAGES)[number]['key'];

const PAGE_KEY_SET = new Set<string>(PAGES.map((p) => p.key));

export function isValidPageKey(key: string): key is PageKey {
  return PAGE_KEY_SET.has(key);
}
