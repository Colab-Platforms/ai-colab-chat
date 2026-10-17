import axios from "axios";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const requestUrl = String(error.config?.url || "");
      const isAuthRequest = requestUrl.startsWith("/auth/");
      const hasToken = Boolean(localStorage.getItem("token"));

      if (!isAuthRequest && hasToken) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        // Dispatch a custom event so React/Next.js router can handle the redirect
        // without a full page reload (window.location.href is avoided intentionally).
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
