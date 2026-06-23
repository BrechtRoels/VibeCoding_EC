// Base URL for backend calls. Empty in dev (Vite proxies /api → :8011); set to the
// backend service prefix in production (e.g. VITE_API_BASE=/_/backend on Vercel).
export const API_BASE = String((import.meta as any).env?.VITE_API_BASE ?? "").replace(/\/$/, "");

/** Prefix a backend path with the configured API base. */
export function apiUrl(path: string): string {
  return API_BASE + path;
}
