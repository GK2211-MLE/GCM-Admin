import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar';
import { useNotifications } from '@/features/notifications/api';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  FileText,
  CreditCard,
  Warehouse,
  BookOpen,
  Tag,
  BarChart3,
  FileEdit,
  Bell,
  Settings,
  ChevronLeft,
  X,
  Store,
  MapPin,
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Orders', icon: ShoppingCart, path: '/orders' },
  { label: 'Customers', icon: Users, path: '/customers' },
  { label: 'Products', icon: Package, path: '/products' },
  { label: 'Payments', icon: CreditCard, path: '/payments' },
  { label: 'Invoices', icon: FileText, path: '/invoices' },
  { label: 'Inventory', icon: Warehouse, path: '/inventory' },
  { label: 'Catalog', icon: BookOpen, path: '/catalog' },
  { label: 'Promotions', icon: Tag, path: '/promotions' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'CMS', icon: FileEdit, path: '/cms' },
  { label: 'Locations', icon: MapPin, path: '/locations' },
  { label: 'Notifications', icon: Bell, path: '/notifications' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export function Sidebar() {
  const location = useLocation();
  const { collapsed, mobileOpen, toggleCollapsed, setMobileOpen } = useSidebarStore();
  const { data: notifData } = useNotifications();
  const unreadCount = notifData?.unreadCount ?? 0;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-(--border-default) bg-(--surface-secondary) transition-all duration-300 lg:relative',
          collapsed ? 'w-16' : 'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-(--border-default) px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-600">
              <Store className="h-4 w-4 text-white" />
            </div>
            {!collapsed && (
              <span className="text-lg font-bold text-(--text-primary)">F2C</span>
            )}
          </div>
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-md p-1 text-(--text-tertiary) hover:text-(--text-primary) lg:block"
          >
            <ChevronLeft
              className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')}
            />
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-(--text-tertiary) hover:text-(--text-primary) lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
              const isNotifications = item.path === '/notifications';

              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary-500/10 text-primary-500'
                        : 'text-(--text-secondary) hover:bg-(--surface-tertiary) hover:text-(--text-primary)',
                      collapsed && 'justify-center px-2',
                    )}
                  >
                    <span className="relative shrink-0">
                      <item.icon className="h-5 w-5" />
                      {isNotifications && unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white leading-none">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </span>
                    {!collapsed && <span>{item.label}</span>}
                    {!collapsed && isNotifications && unreadCount > 0 && (
                      <span className="ml-auto rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
