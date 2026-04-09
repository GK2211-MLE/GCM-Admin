export const queryKeys = {
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => [...queryKeys.dashboard.all, 'summary'] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.customers.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.customers.all, 'detail', id] as const,
  },
  products: {
    all: ['products'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.products.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.products.all, 'detail', id] as const,
    categories: () => [...queryKeys.products.all, 'categories'] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.orders.all, 'list', params] as const,
    detail: (code: string) => [...queryKeys.orders.all, 'detail', code] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.invoices.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.invoices.all, 'detail', id] as const,
  },
  payments: {
    all: ['payments'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.payments.all, 'list', params] as const,
    summary: () => [...queryKeys.payments.all, 'summary'] as const,
  },
  promotions: {
    all: ['promotions'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.promotions.all, 'list', params] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    summary: () => [...queryKeys.analytics.all, 'summary'] as const,
  },
  settings: {
    all: ['settings'] as const,
    users: () => [...queryKeys.settings.all, 'users'] as const,
    locations: () => [...queryKeys.settings.all, 'locations'] as const,
    general: () => [...queryKeys.settings.all, 'general'] as const,
  },
  vendors: {
    all: ['vendors'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.vendors.all, 'list', params] as const,
  },
  purchaseOrders: {
    all: ['purchaseOrders'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.purchaseOrders.all, 'list', params] as const,
  },
  notifications: {
    all: ['notifications'] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    categories: () => [...queryKeys.catalog.all, 'categories'] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.inventory.all, 'list', params] as const,
    summary: () => [...queryKeys.inventory.all, 'summary'] as const,
  },
};
