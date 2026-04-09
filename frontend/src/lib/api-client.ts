import axios from 'axios';

const TOKEN_KEY = 'f2c_admin_auth_token';
const REFRESH_KEY = 'f2c_admin_refresh_token';

export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

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

        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
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

    // Friendly error messages
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      (error.response?.status === 404
        ? 'Resource not found'
        : error.response?.status === 403
          ? 'You do not have permission to perform this action'
          : error.response?.status === 500
            ? 'An unexpected server error occurred'
            : 'Something went wrong');

    return Promise.reject(new Error(message));
  },
);

export const authApi = axios.create({
  baseURL: '/api/auth',
  headers: {
    'Content-Type': 'application/json',
  },
});
