// Base URL for backend calls.
//  - dev (Vite proxies /api → :8011): empty
//  - production (Vercel): the backend service is mounted at /_/backend, so default
//    to that automatically. Override with VITE_API_BASE if your prefix differs.
const env = (import.meta as any).env ?? {};
const fallback = env.PROD ? "/_/backend" : "";
export const API_BASE = String(env.VITE_API_BASE ?? fallback).replace(/\/$/, "");

/** Prefix a backend path with the configured API base. */
export function apiUrl(path: string): string {
  return API_BASE + path;
}
