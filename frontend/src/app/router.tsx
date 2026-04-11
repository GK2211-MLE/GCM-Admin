import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { AdminLayout } from '@/app/layouts/AdminLayout';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';

const LoginPage = lazy(() => import('@/features/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const CustomerListPage = lazy(() => import('@/features/customers/CustomerListPage').then(m => ({ default: m.CustomerListPage })));
const CustomerDetailPage = lazy(() => import('@/features/customers/CustomerDetailPage').then(m => ({ default: m.CustomerDetailPage })));
const ProductListPage = lazy(() => import('@/features/products/ProductListPage').then(m => ({ default: m.ProductListPage })));
const ProductDetailPage = lazy(() => import('@/features/products/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));
const OrderListPage = lazy(() => import('@/features/orders/OrderListPage').then(m => ({ default: m.OrderListPage })));
const OrderDetailPage = lazy(() => import('@/features/orders/OrderDetailPage').then(m => ({ default: m.OrderDetailPage })));
const CreateOrderPage = lazy(() => import('@/features/orders/CreateOrderPage').then(m => ({ default: m.CreateOrderPage })));
const InvoiceListPage = lazy(() => import('@/features/invoices/InvoiceListPage').then(m => ({ default: m.InvoiceListPage })));
const PaymentListPage = lazy(() => import('@/features/payments/PaymentListPage').then(m => ({ default: m.PaymentListPage })));
const FulfillmentPage = lazy(() => import('@/features/fulfillment/FulfillmentPage').then(m => ({ default: m.FulfillmentPage })));
const InventoryPage = lazy(() => import('@/features/inventory/InventoryPage').then(m => ({ default: m.InventoryPage })));
const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage').then(m => ({ default: m.CatalogPage })));
const PromotionListPage = lazy(() => import('@/features/promotions/PromotionListPage').then(m => ({ default: m.PromotionListPage })));
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const NotificationPage = lazy(() => import('@/features/notifications/NotificationPage').then(m => ({ default: m.NotificationPage })));
const GeneralPage = lazy(() => import('@/features/settings/GeneralPage').then(m => ({ default: m.GeneralPage })));
const UsersPage = lazy(() => import('@/features/settings/UsersPage').then(m => ({ default: m.UsersPage })));
const RolePermissionsPage = lazy(() => import('@/features/settings/RolePermissionsPage').then(m => ({ default: m.RolePermissionsPage })));
const LocationsPage = lazy(() => import('@/features/settings/LocationsPage').then(m => ({ default: m.LocationsPage })));
const ActivityLogPage = lazy(() => import('@/features/settings/ActivityLogPage').then(m => ({ default: m.ActivityLogPage })));
const CMSPage = lazy(() => import('@/features/cms/CMSPage').then(m => ({ default: m.CMSPage })));
const VendorListPage = lazy(() => import('@/features/procurement/VendorListPage').then(m => ({ default: m.VendorListPage })));
const PurchaseOrdersPage = lazy(() => import('@/features/procurement/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><LoadingSpinner /></div>}>
      {children}
    </Suspense>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<SuspenseWrapper><LoginPage /></SuspenseWrapper>} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<SuspenseWrapper><RequirePermission pageKey="dashboard"><DashboardPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/customers" element={<SuspenseWrapper><RequirePermission pageKey="customers"><CustomerListPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/customers/:id" element={<SuspenseWrapper><RequirePermission pageKey="customers"><CustomerDetailPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/products" element={<SuspenseWrapper><RequirePermission pageKey="products"><ProductListPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/products/:id" element={<SuspenseWrapper><RequirePermission pageKey="products"><ProductDetailPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/orders" element={<SuspenseWrapper><RequirePermission pageKey="orders.view"><OrderListPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/orders/create" element={<SuspenseWrapper><RequirePermission pageKey="orders.create"><CreateOrderPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/orders/:code" element={<SuspenseWrapper><RequirePermission pageKey="orders.view"><OrderDetailPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/invoices" element={<SuspenseWrapper><RequirePermission pageKey="invoices"><InvoiceListPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/payments" element={<SuspenseWrapper><RequirePermission pageKey="payments"><PaymentListPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/fulfillment" element={<SuspenseWrapper><FulfillmentPage /></SuspenseWrapper>} />
          <Route path="/inventory" element={<SuspenseWrapper><RequirePermission pageKey="inventory"><InventoryPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/catalog" element={<SuspenseWrapper><RequirePermission pageKey="catalog"><CatalogPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/promotions" element={<SuspenseWrapper><RequirePermission pageKey="promotions"><PromotionListPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/analytics" element={<SuspenseWrapper><RequirePermission pageKey="analytics"><AnalyticsPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/notifications" element={<SuspenseWrapper><RequirePermission pageKey="notifications"><NotificationPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/settings" element={<SuspenseWrapper><RequirePermission pageKey="settings"><GeneralPage /></RequirePermission></SuspenseWrapper>} />
          {/* Users & Permissions — both /users (new) and /settings/users (legacy) point at the same page */}
          <Route path="/users" element={<SuspenseWrapper><RequirePermission pageKey="users_permissions"><UsersPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/settings/users" element={<SuspenseWrapper><RequirePermission pageKey="users_permissions"><UsersPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/settings/permissions" element={<SuspenseWrapper><RequirePermission pageKey="users_permissions"><RolePermissionsPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/locations" element={<SuspenseWrapper><RequirePermission pageKey="locations"><LocationsPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/settings/activity" element={<SuspenseWrapper><ActivityLogPage /></SuspenseWrapper>} />
          <Route path="/cms" element={<SuspenseWrapper><RequirePermission pageKey="cms"><CMSPage /></RequirePermission></SuspenseWrapper>} />
          <Route path="/procurement/vendors" element={<SuspenseWrapper><VendorListPage /></SuspenseWrapper>} />
          <Route path="/procurement/orders" element={<SuspenseWrapper><PurchaseOrdersPage /></SuspenseWrapper>} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
