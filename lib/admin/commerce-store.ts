"use client";
import { useSyncExternalStore } from "react";
import { INITIAL_COMMERCE, type CommerceData } from "./commerce";
const KEY = "labellab-admin-commerce-v1";
let snapshot: CommerceData = INITIAL_COMMERCE;
let initialized = false;
const listeners = new Set<() => void>();
function valid(value: unknown): value is CommerceData {
  if (!value || typeof value !== "object") return false;
  const data = value as CommerceData;
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  const date = (d: unknown) => typeof d === "string" && Number.isFinite(Date.parse(d));
  const region = (r: unknown) => r === "vn" || r === "international";
  return Array.isArray(data.orders) && data.orders.every(o => o && typeof o.id === "string" && typeof o.userId === "string" && region(o.region) && finite(o.amount) && o.amount > 0 && Number.isSafeInteger(o.coins) && o.coins > 0 && ["pending", "paid", "failed", "refunded"].includes(o.status) && date(o.createdAt) && typeof o.reference === "string")
    && Array.isArray(data.ledger) && data.ledger.every(e => e && typeof e.id === "string" && typeof e.userId === "string" && Number.isSafeInteger(e.coins) && typeof e.reason === "string" && date(e.at) && (e.orderId === undefined || typeof e.orderId === "string"))
    && Array.isArray(data.packs) && data.packs.every(p => p && typeof p.id === "string" && region(p.region) && finite(p.amount) && p.amount > 0 && Number.isSafeInteger(p.coins) && p.coins > 0 && typeof p.enabled === "boolean");
}
function read() {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    try {
      snapshot = INITIAL_COMMERCE;
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const value = JSON.parse(raw);
        if (valid(value)) snapshot = value;
      }
    } catch { /* Unavailable browser storage keeps an in-memory preview. */ }
  }
  return snapshot;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => {
    if (event.key === KEY) { initialized = false; read(); listeners.forEach(fn => fn()); }
  };
  window.addEventListener("storage", storage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", storage); };
}
export function updateCommerce(update: (current: CommerceData) => CommerceData) {
  const next = update(read());
  if (!valid(next)) throw new Error("Dữ liệu giao dịch mẫu không hợp lệ.");
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { throw new Error("Không thể lưu bản mẫu vào trình duyệt. Chưa áp dụng thay đổi."); }
  snapshot = next;
  listeners.forEach(fn => fn());
}
export function useAdminCommerce() {
  return useSyncExternalStore(subscribe, read, () => INITIAL_COMMERCE);
}
