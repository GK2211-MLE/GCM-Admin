import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { AppRouter } from '@/app/router';
import '@/lib/api-client'; // side-effect: registers global axios error toast interceptor

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
      {/* Global toast notifications. Position bottom-right matches admin panel chrome. */}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        expand
        duration={4000}
      />
    </QueryClientProvider>
  );
}
