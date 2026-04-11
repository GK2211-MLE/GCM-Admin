import axios from 'axios';
import { toast } from 'sonner';

const TOKEN_KEY = 'f2c_admin_auth_token';
const REFRESH_KEY = 'f2c_admin_refresh_token';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* Format a Zod-style { details: { field: [msg] } } error into something
 * a human can read in a toast. Falls back to .error / .message / generic. */
function formatErrorMessage(error: unknown): string {
  const e = error as { response?: { data?: { error?: string; message?: string; details?: Record<string, string[] | string> }, status?: number } };
  const data = e?.response?.data;
  if (data?.details && typeof data.details === 'object') {
    const fieldErrors = Object.entries(data.details)
      .map(([field, msgs]) => {
        const msg = Array.isArray(msgs) ? msgs[0] : String(msgs);
        return `${field}: ${msg}`;
      })
      .join(' • ');
    if (fieldErrors) return `${data.error || 'Validation error'} — ${fieldErrors}`;
  }
  if (data?.message) return data.message;
  if (data?.error) return data.error;
  if (e?.response?.status === 404) return 'Resource not found';
  if (e?.response?.status === 403) return 'You do not have permission to perform this action';
  if (e?.response?.status === 500) return 'An unexpected server error occurred';
  return 'Something went wrong';
}

// Auth interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - 401 refresh logic
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem(REFRESH_KEY);
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        localStorage.setItem(TOKEN_KEY, data.accessToken);
        if (data.refreshToken) {
          localStorage.setItem(REFRESH_KEY, data.refreshToken);
        }

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    // Build the friendly message (handles Zod validation errors specifically)
    const message = formatErrorMessage(error);

    // Surface every API error as a toast so the user is never left wondering
    // what happened. The Promise still rejects so caller .onError handlers
    // still run if they exist.
    // Skip toasts on the silent /auth/me probe used by login pages —
    // they're polling, not user-initiated.
    const silentPaths = ['/auth/me'];
    const url = (originalRequest?.url || '').toString();
    const isSilent = silentPaths.some((p) => url.includes(p));
    if (!isSilent) {
      toast.error(message);
    }

    return Promise.reject(new Error(message));
  },
);

export const authApi = axios.create({
  baseURL: `${API_BASE}/auth`,
  headers: {
    'Content-Type': 'application/json',
  },
});
