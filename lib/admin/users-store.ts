"use client";

import { useSyncExternalStore } from "react";
import { INITIAL_ORDERS } from "./commerce";

export type AdminUserEvent = {
  id: string;
  type: "coin" | "login" | "render" | "profile";
  text: string;
  at: string;
  coins?: number;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  title: string;
  country: string;
  role: "admin" | "user";
  status: "active" | "locked";
  coins: number;
  loginDays: number;
  logins: number;
  appSessions: number;
  totalVnd: number;
  totalUsd: number;
  createdAt: string;
  lastLogin: string;
  avatar?: string;
  notes: string;
  history?: AdminUserEvent[];
};

const KEY = "labellab-admin-users-v1";
const names = [
  ["Minh Anh", "minhanh@labellab3d.com", "Việt Nam", "Creative director"],
  ["Nguyễn Hoàng", "hoang.nguyen@example.com", "Việt Nam", "Packaging explorer"],
  ["Sarah Chen", "sarah.chen@example.com", "Singapore", "Studio creator"],
  ["Trần Bảo Ngọc", "baongoc@example.com", "Việt Nam", "Rising creator"],
  ["Alex Morgan", "alex.morgan@example.com", "Hoa Kỳ", "Material enthusiast"],
  ["Lê Thanh Tùng", "thanhtung@example.com", "Việt Nam", "Studio creator"],
  ["Yuki Tanaka", "yuki.tanaka@example.com", "Nhật Bản", "Packaging explorer"],
  ["Phạm Gia Hân", "giahan@example.com", "Việt Nam", "Rising creator"],
  ["Oliver Smith", "oliver.smith@example.com", "Anh", "Studio creator"],
  ["Đỗ Khánh Linh", "khanhlinh@example.com", "Việt Nam", "New designer"],
];

export const ADMIN_DEMO_USERS: AdminUser[] = names.map(([name, email, country, title], i) => {
  const id = `usr-${String(i + 1).padStart(3, "0")}`;
  const paid = INITIAL_ORDERS.filter(order => order.userId === id && order.status === "paid");
  return {
  id,
  name, email, country, title,
  role: i === 0 ? "admin" : "user",
  status: i === 7 ? "locked" : "active",
  coins: paid.reduce((sum, order) => sum + order.coins, 0),
  loginDays: [92, 68, 54, 39, 32, 27, 20, 12, 10, 2][i],
  logins: [187, 142, 108, 87, 75, 63, 42, 24, 19, 3][i],
  appSessions: [146, 128, 92, 74, 58, 49, 35, 18, 15, 2][i],
  totalVnd: paid.filter(order => order.region === "vn").reduce((sum, order) => sum + order.amount, 0),
  totalUsd: paid.filter(order => order.region === "international").reduce((sum, order) => sum + order.amount, 0),
  createdAt: `2026-${String(7 + i % 3).padStart(2, "0")}-${String(3 + i * 2).padStart(2, "0")}T08:00:00+07:00`,
  lastLogin: `2026-10-${i === 7 ? "18" : "31"}T${String(9 + i % 5).padStart(2, "0")}:20:00+07:00`,
  notes: i === 0 ? "Tài khoản quản trị chính." : "",
  history: [
    { id: `${i}-login`, type: "login", text: "Đăng nhập", at: `2026-10-${i === 7 ? "18" : "31"}T09:20:00+07:00` },
    { id: `${i}-render`, type: "render", text: "Render Basil Strawberry · 4096 px · Lượt miễn phí", at: `2026-10-${i === 7 ? "17" : "30"}T14:25:00+07:00` },
  ],
};
});

let users = ADMIN_DEMO_USERS;
let hydrated = false;
const listeners = new Set<() => void>();

function validRecord(value: unknown): value is AdminUser {
  if (!value || typeof value !== "object") return false;
  const u = value as AdminUser;
  return typeof u.id === "string" && typeof u.name === "string" && typeof u.email === "string"
    && typeof u.title === "string" && typeof u.country === "string" && typeof u.notes === "string"
    && ["admin", "user"].includes(u.role) && ["active", "locked"].includes(u.status)
    && [u.coins, u.loginDays, u.logins, u.appSessions, u.totalVnd, u.totalUsd].every(n => Number.isFinite(n) && n >= 0)
    && typeof u.createdAt === "string" && Number.isFinite(Date.parse(u.createdAt))
    && typeof u.lastLogin === "string" && (!u.lastLogin || Number.isFinite(Date.parse(u.lastLogin)))
    && (u.history === undefined || Array.isArray(u.history) && u.history.every(item => item && typeof item.id === "string"
      && ["coin", "login", "render", "profile"].includes(item.type) && typeof item.text === "string"
      && typeof item.at === "string" && Number.isFinite(Date.parse(item.at)) && (item.coins === undefined || Number.isFinite(item.coins))));
}

function readStoredUsers() {
  try {
    const stored = window.localStorage.getItem(KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    if (Array.isArray(parsed) && parsed.length && parsed.every(validRecord)
      && parsed.some(u => u.role === "admin" && u.status === "active")) users = parsed;
  } catch { /* Private browsing and damaged fixtures fall back to the sample. */ }
}

function getSnapshot() {
  if (typeof window !== "undefined" && !hydrated) {
    hydrated = true;
    readStoredUsers();
  }
  return users;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    users = ADMIN_DEMO_USERS;
    readStoredUsers();
    listeners.forEach(fn => fn());
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

function commit(next: AdminUser[]) {
  // Persist before notifying, so storage errors never report a successful save.
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { throw new Error("Không thể lưu dữ liệu mẫu trên trình duyệt này."); }
  users = next;
  listeners.forEach(fn => fn());
}

function validate(user: AdminUser, currentId?: string) {
  if (!user.name.trim()) throw new Error("Vui lòng nhập tên người dùng.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new Error("Email chưa hợp lệ.");
  if (users.some(u => u.id !== currentId && u.email.toLowerCase() === user.email.toLowerCase())) throw new Error("Email này đã được sử dụng.");
  if (!validRecord(user)) throw new Error("Thông tin người dùng chưa hợp lệ.");
  if (![user.coins, user.loginDays, user.logins, user.appSessions, user.totalVnd].every(Number.isSafeInteger)) throw new Error("Coin và các chỉ số lượt phải là số nguyên không âm trong giới hạn cho phép.");
  if (!Number.isFinite(Date.parse(user.createdAt)) || (user.lastLogin && !Number.isFinite(Date.parse(user.lastLogin)))) throw new Error("Ngày tháng chưa hợp lệ.");
  if (user.lastLogin && Date.parse(user.lastLogin) < Date.parse(user.createdAt)) throw new Error("Ngày đăng nhập cuối không thể trước ngày tạo tài khoản.");
  if (user.avatar && !/^https?:\/\//i.test(user.avatar) && !/^\/(?!\/)/.test(user.avatar)) throw new Error("Ảnh đại diện phải là đường dẫn nội bộ hoặc URL http/https.");
}

function addUser(input: Omit<AdminUser, "id">): AdminUser {
  getSnapshot();
  const user = { ...input, name: input.name.trim(), email: input.email.trim().toLowerCase(), id: `LL-${crypto.randomUUID().slice(0, 8).toUpperCase()}` };
  validate(user);
  commit([user, ...users]);
  return user;
}

function updateUser(id: string, patch: Partial<Omit<AdminUser, "id">>) {
  getSnapshot();
  const before = users.find(u => u.id === id);
  if (!before) throw new Error("Không tìm thấy người dùng.");
  const next = { ...before, ...patch, id };
  next.name = next.name.trim(); next.email = next.email.trim().toLowerCase();
  validate(next, id);
  if (before.role === "admin" && before.status === "active" && (next.role !== "admin" || next.status !== "active")
    && !users.some(u => u.id !== id && u.role === "admin" && u.status === "active")) throw new Error("Cần giữ ít nhất một quản trị viên đang hoạt động.");
  commit(users.map(u => u.id === id ? next : u));
}

function deleteUser(id: string) {
  getSnapshot();
  const user = users.find(u => u.id === id);
  if (!user) throw new Error("Không tìm thấy người dùng.");
  if (user.role === "admin" && user.status === "active" && !users.some(u => u.id !== id && u.role === "admin" && u.status === "active")) throw new Error("Không thể xóa quản trị viên hoạt động cuối cùng.");
  commit(users.filter(u => u.id !== id));
}

export function useAdminUsers() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => ADMIN_DEMO_USERS);
  return { users: snapshot, addUser, updateUser, deleteUser };
}
