import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/features/auth/store';
import { useNotifications } from '@/features/notifications/api';
import { useSidebarStore } from '@/stores/sidebar';
import { useThemeStore } from '@/stores/theme';
import { getInitials } from '@/lib/utils';
import {
  Menu,
  Search,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Bell,
  Command,
  X,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  FileText,
  CreditCard,
  Truck,
  Tag,
  BarChart3,
  Warehouse,
  BookOpen,
  MapPin,
  Store,
} from 'lucide-react';

/* ── Command palette routes ────────────────────────────── */
const COMMAND_ROUTES = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, keywords: 'home overview' },
  { label: 'Orders', path: '/orders', icon: ShoppingCart, keywords: 'sales' },
  { label: 'Customers', path: '/customers', icon: Users, keywords: 'clients consumers' },
  { label: 'Products', path: '/products', icon: Package, keywords: 'catalog items meat' },
  { label: 'Invoices', path: '/invoices', icon: FileText, keywords: 'billing' },
  { label: 'Payments', path: '/payments', icon: CreditCard, keywords: 'transactions money' },
  { label: 'Fulfillment', path: '/fulfillment', icon: Truck, keywords: 'delivery shipping' },
  { label: 'Inventory', path: '/inventory', icon: Warehouse, keywords: 'stock' },
  { label: 'Catalog', path: '/catalog', icon: BookOpen, keywords: 'categories' },
  { label: 'Promotions', path: '/promotions', icon: Tag, keywords: 'coupon discount promo' },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, keywords: 'charts metrics reports' },
  { label: 'CMS', path: '/cms', icon: FileText, keywords: 'content pages blog' },
  { label: 'Vendors', path: '/procurement/vendors', icon: Store, keywords: 'supplier procurement' },
  { label: 'Purchase Orders', path: '/procurement/orders', icon: Truck, keywords: 'PO procurement' },
  { label: 'Notifications', path: '/notifications', icon: Bell, keywords: 'alerts push' },
  { label: 'Settings', path: '/settings', icon: Settings, keywords: 'config preferences' },
  { label: 'Users', path: '/settings/users', icon: Users, keywords: 'staff admin roles' },
  { label: 'Locations', path: '/settings/locations', icon: MapPin, keywords: 'branches stores' },
  { label: 'Activity Log', path: '/settings/activity', icon: FileText, keywords: 'audit history' },
];

/* ── Portal Dropdown ───────────────────────────────────── */
function DropdownPortal({
  anchorRef,
  open,
  onClose,
  width = 224,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left: Math.max(8, rect.right - width),
      width,
      zIndex: 99999,
    });
  }, [anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  if (!open) return null;

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99998 }} onClick={onClose} />
      <div
        style={style}
        className="overflow-hidden rounded-xl border border-border-default bg-(--surface-elevated) shadow-2xl"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/* ── Topbar ────────────────────────────────────────────── */
export function Topbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { setMobileOpen } = useSidebarStore();
  const { theme, setTheme, resolvedTheme } = useThemeStore();
  const { data: notifData } = useNotifications();
  const unreadCount = notifData?.unreadCount ?? 0;

  const [profileOpen, setProfileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdSearch, setCmdSearch] = useState('');

  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  // ── Cmd+K shortcut ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
        setCmdSearch('');
      }
      if (e.key === 'Escape') setCmdOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-focus search
  useEffect(() => {
    if (cmdOpen) setTimeout(() => cmdInputRef.current?.focus(), 50);
  }, [cmdOpen]);

  // Filter routes
  const filteredRoutes = useMemo(() => {
    if (!cmdSearch.trim()) return COMMAND_ROUTES;
    const q = cmdSearch.toLowerCase();
    return COMMAND_ROUTES.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        r.keywords.toLowerCase().includes(q),
    );
  }, [cmdSearch]);

  function handleCmdSelect(path: string) {
    setCmdOpen(false);
    setCmdSearch('');
    navigate(path);
  }

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor },
  ];

  const ThemeIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center border-b border-border-default bg-surface-secondary px-4 lg:px-6">
      {/* Left: Mobile menu */}
      <button
        onClick={() => setMobileOpen(true)}
        className="rounded-md p-2 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary transition-colors lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Center: Search bar */}
      <div className="flex flex-1 justify-center px-4">
        <button
          className="flex w-full max-w-md items-center gap-3 rounded-xl border border-border-default bg-surface-tertiary/50 px-3.5 py-2 text-sm text-text-tertiary transition-all hover:border-border-hover hover:bg-surface-tertiary"
          onClick={() => { setCmdOpen(true); setCmdSearch(''); }}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left truncate">Search anything...</span>
          <kbd className="hidden items-center gap-0.5 rounded-md border border-border-default bg-surface-secondary px-2 py-0.5 text-[11px] font-medium text-text-tertiary sm:inline-flex">
            <Command className="h-3 w-3" />K
          </kbd>
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          ref={themeBtnRef}
          onClick={() => { setThemeOpen((v) => !v); setProfileOpen(false); }}
          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={resolvedTheme}
              initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.15 }}
              className="block"
            >
              <ThemeIcon className="h-5 w-5" />
            </motion.span>
          </AnimatePresence>
        </button>

        <DropdownPortal anchorRef={themeBtnRef} open={themeOpen} onClose={() => setThemeOpen(false)} width={160}>
          <div className="p-1">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setTheme(opt.value); setThemeOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  theme === opt.value
                    ? 'bg-primary-500/10 text-primary-400'
                    : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                }`}
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
                {theme === opt.value && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500" />}
              </button>
            ))}
          </div>
        </DropdownPortal>

        {/* Notifications */}
        <Link
          to="/notifications"
          className="relative rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Separator */}
        <div className="mx-1.5 h-6 w-px bg-border-default" />

        {/* Profile */}
        <button
          ref={profileBtnRef}
          onClick={() => { setProfileOpen((v) => !v); setThemeOpen(false); }}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-tertiary"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-primary-500 to-primary-600 text-xs font-bold text-white shadow-sm">
            {user ? getInitials(user.name) : '?'}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium leading-tight text-text-primary">{user?.name}</p>
            <p className="text-xs capitalize leading-tight text-text-tertiary">{user?.role}</p>
          </div>
          <ChevronDown className={`h-3.5 w-3.5 text-text-tertiary transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
        </button>

        <DropdownPortal anchorRef={profileBtnRef} open={profileOpen} onClose={() => setProfileOpen(false)} width={224}>
          <div className="border-b border-border-default px-4 py-3">
            <p className="text-sm font-medium text-text-primary">{user?.name}</p>
            <p className="text-xs text-text-tertiary">{user?.email}</p>
          </div>
          <div className="p-1">
            <Link
              to="/settings"
              onClick={() => setProfileOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
            >
              <User className="h-4 w-4" />
              Profile
            </Link>
            <Link
              to="/settings"
              onClick={() => setProfileOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>
          <div className="border-t border-border-default p-1">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </DropdownPortal>
      </div>

      {/* ── Command Palette ────────────────────────────── */}
      {cmdOpen && createPortal(
        <AnimatePresence>
          <motion.div
            className="fixed inset-0 flex items-start justify-center pt-[15vh]"
            style={{ zIndex: 999999 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setCmdOpen(false)}
            />
            {/* Dialog */}
            <motion.div
              className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border-default bg-surface-secondary shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-border-default px-4 py-3">
                <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
                <input
                  ref={cmdInputRef}
                  type="text"
                  className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
                  placeholder="Search pages..."
                  value={cmdSearch}
                  onChange={(e) => setCmdSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredRoutes.length > 0) {
                      handleCmdSelect(filteredRoutes[0].path);
                    }
                  }}
                />
                <button
                  onClick={() => setCmdOpen(false)}
                  className="rounded p-1 text-text-tertiary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Results */}
              <div className="max-h-72 overflow-y-auto py-2">
                {filteredRoutes.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-text-tertiary">
                    No pages found.
                  </p>
                ) : (
                  filteredRoutes.map((route) => {
                    const Icon = route.icon;
                    return (
                      <button
                        key={route.path}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-surface-tertiary"
                        onClick={() => handleCmdSelect(route.path)}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-text-tertiary" />
                        <span>{route.label}</span>
                        <span className="ml-auto max-w-30 truncate text-xs text-text-tertiary">
                          {route.path}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}
    </header>
  );
}
