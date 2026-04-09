import { motion } from 'framer-motion';
import { Link } from 'react-router';
import { ClipboardCheck, Truck, Package, ArrowRight, CheckCircle } from 'lucide-react';
import type { DashboardSummary } from './api';

type Urgency = 'high' | 'medium' | 'low';

interface ActionCard {
  title: string;
  count: number;
  description: string;
  icon: typeof ClipboardCheck;
  urgency: Urgency;
  link: string;
}

const urgencyStyles: Record<Urgency, { card: string; icon: string; badge: string; button: string }> = {
  high: {
    card: 'border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent',
    icon: 'bg-red-500/10 text-red-400',
    badge: 'bg-red-500 text-white',
    button: 'text-red-400 hover:text-red-300',
  },
  medium: {
    card: 'border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent',
    icon: 'bg-amber-500/10 text-amber-400',
    badge: 'bg-amber-500 text-white',
    button: 'text-amber-400 hover:text-amber-300',
  },
  low: {
    card: 'border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent',
    icon: 'bg-blue-500/10 text-blue-400',
    badge: 'bg-blue-500 text-white',
    button: 'text-blue-400 hover:text-blue-300',
  },
};

interface PendingActionsProps {
  summary: DashboardSummary;
}

export function PendingActions({ summary }: PendingActionsProps) {
  const pendingUrgency: Urgency = summary.pendingCount > 5 ? 'high' : summary.pendingCount > 0 ? 'medium' : 'low';
  const deliveryUrgency: Urgency = summary.activeDeliveries > 5 ? 'high' : summary.activeDeliveries > 0 ? 'medium' : 'low';
  const processingUrgency: Urgency = summary.processingCount > 5 ? 'medium' : 'low';

  const actions: ActionCard[] = [
    {
      title: 'Pending Orders',
      count: summary.pendingCount,
      description: 'Orders awaiting confirmation or payment',
      icon: ClipboardCheck,
      urgency: pendingUrgency,
      link: '/orders',
    },
    {
      title: 'Out for Delivery',
      count: summary.activeDeliveries,
      description: 'Orders currently being delivered to customers',
      icon: Truck,
      urgency: deliveryUrgency,
      link: '/orders',
    },
    {
      title: 'Processing',
      count: summary.processingCount,
      description: 'Orders being prepared or ready for dispatch',
      icon: Package,
      urgency: processingUrgency,
      link: '/orders',
    },
  ].filter((a) => a.count > 0);

  if (actions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-6"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2">
            <CheckCircle className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="font-medium text-text-primary">All clear!</p>
            <p className="text-xs text-text-secondary">No items require attention right now.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((action, i) => {
        const style = urgencyStyles[action.urgency];
        return (
          <motion.div
            key={action.title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.85 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={`rounded-xl border p-5 ${style.card}`}>
              <div className="flex items-start justify-between">
                <div className={`rounded-lg p-2 ${style.icon}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  {action.urgency === 'high' && (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${style.badge}`}>
                    {action.count}
                  </span>
                </div>
              </div>
              <h4 className="mt-3 text-sm font-semibold text-text-primary">{action.title}</h4>
              <p className="mt-1 text-xs text-text-secondary">{action.description}</p>
              <Link
                to={action.link}
                className={`mt-3 inline-flex items-center gap-1 text-xs font-medium transition-colors ${style.button} group`}
              >
                View All
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
