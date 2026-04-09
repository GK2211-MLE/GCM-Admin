import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Bell, BellOff, CheckCheck, Trash2,
  ShoppingCart, CreditCard, Package,
} from 'lucide-react';
import { useNotifications, useMarkRead, useClearRead } from './api';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getIcon(type: string) {
  switch (type) {
    case 'order': return <ShoppingCart className="h-5 w-5" />;
    case 'payment': return <CreditCard className="h-5 w-5" />;
    case 'inventory': return <Package className="h-5 w-5" />;
    default: return <Bell className="h-5 w-5" />;
  }
}

function getIconBg(type: string) {
  switch (type) {
    case 'order': return 'bg-blue-500/10 text-blue-500';
    case 'payment': return 'bg-emerald-500/10 text-emerald-500';
    case 'inventory': return 'bg-amber-500/10 text-amber-500';
    default: return 'bg-slate-500/10 text-slate-400';
  }
}

export function NotificationPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const clearRead = useClearRead();

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const displayed = filter === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  const handleClick = (id: string, isRead: boolean, link: string | null) => {
    if (!isRead) markRead.mutate({ id });
    if (link) navigate(link);
  };

  const handleMarkAll = () => {
    markRead.mutate({ markAll: true });
  };

  const handleClearRead = () => {
    clearRead.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-(--surface-tertiary) text-(--text-primary)'
                : 'text-(--text-secondary) hover:text-(--text-primary)'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'unread'
                ? 'bg-(--surface-tertiary) text-(--text-primary)'
                : 'text-(--text-secondary) hover:text-(--text-primary)'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAll}
              disabled={markRead.isPending}
            >
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Mark all read
            </Button>
          )}
          {notifications.some((n) => n.isRead) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-(--text-tertiary) hover:text-red-500"
              onClick={handleClearRead}
              disabled={clearRead.isPending}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Clear read
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-(--text-tertiary)">Loading...</div>
      ) : displayed.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BellOff className="h-10 w-10 mx-auto text-(--text-tertiary) mb-3" />
            <p className="text-(--text-secondary)">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-sm text-(--text-tertiary) mt-1">
              Notifications appear here when orders are placed or updated
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayed.map((notif) => (
            <button
              key={notif.id}
              onClick={() => handleClick(notif.id, notif.isRead, notif.link)}
              className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                notif.isRead
                  ? 'border-(--border-default) bg-(--surface-secondary) hover:bg-(--surface-tertiary)'
                  : 'border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10'
              }`}
            >
              <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getIconBg(notif.type)}`}>
                {getIcon(notif.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-(--text-primary)">
                    {notif.title}
                  </p>
                  <span className="text-[0.65rem] text-(--text-tertiary) whitespace-nowrap shrink-0">
                    {timeAgo(notif.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-(--text-secondary) mt-0.5 line-clamp-2">
                  {notif.message}
                </p>
              </div>

              {!notif.isRead && (
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
