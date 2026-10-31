"use client";

import { useSyncExternalStore } from "react";

export type AdminActivity = { id: string; at: string; actor: string; action: string; target: string; level: "info" | "warning" | "error" };
const key = "labellab.admin.demo.activity.v1";
const seed: AdminActivity[] = [
  { id: "audit-1", at: "2026-10-31T02:25:00Z", actor: "Quản trị viên", action: "Cập nhật giá gói coin", target: "Gói 300 coin · Việt Nam", level: "info" },
  { id: "audit-2", at: "2026-10-31T01:48:00Z", actor: "Quản trị viên", action: "Cập nhật model", target: "Basil Seed 290 ml", level: "info" },
  { id: "security-1", at: "2026-10-31T01:12:00Z", actor: "Hệ thống mẫu", action: "Nhiều lần đăng nhập thất bại", target: "IP mẫu 192.0.2.24", level: "warning" },
  { id: "audit-3", at: "2026-10-30T09:30:00Z", actor: "Quản trị viên", action: "Khóa tài khoản", target: "user.demo@example.com", level: "warning" },
  { id: "security-2", at: "2026-10-30T06:05:00Z", actor: "Hệ thống mẫu", action: "Yêu cầu vượt giới hạn", target: "IP mẫu 198.51.100.18", level: "error" },
];
let entries = seed;
let loaded = false;
const listeners = new Set<() => void>();
function read() {
  if (typeof window === "undefined") return;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "null");
    if (Array.isArray(value) && value.every((item) => item && typeof item.id === "string" && typeof item.at === "string" && Number.isFinite(Date.parse(item.at)) && typeof item.actor === "string" && typeof item.action === "string" && typeof item.target === "string" && ["info", "warning", "error"].includes(item.level))) entries = value;
    else entries = seed;
  } catch { entries = seed; }
  loaded = true;
}
function emit() { listeners.forEach((listener) => listener()); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) { read(); emit(); }
  const onStorage = (event: StorageEvent) => { if (event.key === key) { read(); emit(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function logAdminActivity(entry: Omit<AdminActivity, "id" | "at">) {
  if (typeof window === "undefined") return;
  read();
  entries = [{ ...entry, id: crypto.randomUUID(), at: new Date().toISOString() }, ...entries].slice(0, 500);
  try { localStorage.setItem(key, JSON.stringify(entries)); } catch { /* Current-session changes remain usable. */ }
  emit();
}
export function useAdminActivity() {
  const value = useSyncExternalStore(subscribe, () => entries, () => seed);
  return { entries: value, addActivity: logAdminActivity };
}
