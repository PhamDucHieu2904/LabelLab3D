export interface D1Result<T = unknown> { success: boolean; meta?: Record<string, unknown>; results?: T[]; }
export interface D1Statement { bind(...values: unknown[]): D1Statement; first<T = unknown>(column?: string): Promise<T | null>; all<T = unknown>(): Promise<D1Result<T>>; run(): Promise<D1Result>; }
export interface D1Database { prepare(query: string): D1Statement; batch(statements: D1Statement[]): Promise<D1Result[]>; }

export type AppEnv = { DB?: D1Database; [key: string]: unknown };

export function requireDb(env: AppEnv): D1Database {
  if (!env.DB) throw new Error("D1 database binding DB is required");
  return env.DB;
}

export function nowIso() { return new Date().toISOString(); }

export function randomId(prefix: string) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${base64Url(bytes)}`;
}

export function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function base64UrlBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "===";
  const binary = atob(normalized.slice(0, normalized.length - normalized.length % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export async function constantTimeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i % Math.max(1, left.length)] ?? 0) ^ (right[i % Math.max(1, right.length)] ?? 0);
  return diff === 0;
}
