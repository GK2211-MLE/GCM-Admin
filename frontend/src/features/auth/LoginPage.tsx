import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/features/auth/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogIn } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch {
      // error is set in store
    }
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Welcome back</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        Sign in to your admin account
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
            Email
          </label>
          <Input
            type="email"
            placeholder="admin@farm2cook.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
            Password
          </label>
          <Input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          <LogIn className="mr-2 h-4 w-4" />
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-6 rounded-lg border border-[var(--border-default)] bg-[var(--surface-tertiary)] p-3 text-xs text-[var(--text-tertiary)]">
        <p className="font-medium text-[var(--text-secondary)]">Default credentials:</p>
        <p>Email: admin@farm2cook.com</p>
        <p>Password: admin123!</p>
      </div>
    </div>
  );
}
