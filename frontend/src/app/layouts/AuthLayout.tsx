import { Outlet } from 'react-router';
import { motion } from 'framer-motion';

export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-[var(--surface-primary)]">
        <motion.div
          className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-primary-500/10 blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute -bottom-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-primary-600/10 blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600">
            <span className="text-lg font-extrabold text-white">F2C</span>
          </div>
          <span className="text-2xl font-bold text-[var(--text-primary)]">Farm2Cook</span>
        </div>

        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-8 shadow-2xl">
          <Outlet />
        </div>
      </motion.div>
    </div>
  );
}
