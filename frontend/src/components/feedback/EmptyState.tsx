import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="mb-4 rounded-full bg-[var(--surface-tertiary)] p-4 text-[var(--text-tertiary)]">
        {icon || <Inbox className="h-8 w-8" />}
      </div>
      <h3 className="mb-1 text-lg font-medium text-[var(--text-primary)]">{title}</h3>
      {description && (
        <p className="mb-4 max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
      )}
      {action}
    </div>
  );
}
