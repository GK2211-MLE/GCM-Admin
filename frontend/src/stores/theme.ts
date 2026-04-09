import { create } from 'zustand';

type Theme = 'dark' | 'light' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'dark' | 'light';
}

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'dark' | 'light') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('f2c_theme') : null) as Theme | null;
const initial: Theme = stored || 'dark';
const initialResolved = initial === 'system' ? getSystemTheme() : initial;

// Apply on load
if (typeof document !== 'undefined') applyTheme(initialResolved);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  resolvedTheme: initialResolved,

  setTheme: (theme: Theme) => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    localStorage.setItem('f2c_theme', theme);
    applyTheme(resolved);
    set({ theme, resolvedTheme: resolved });
  },
}));
