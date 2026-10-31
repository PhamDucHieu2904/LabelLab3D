export const ADMIN_SECTIONS = [
  { key: "overview", title: "Tổng quan", group: "Hoạt động", icon: "overview" },
  { key: "traffic", title: "Lượt truy cập", group: "Hoạt động", icon: "traffic" },
  { key: "users", title: "Người dùng", group: "Hoạt động", icon: "users" },
  { key: "transactions", title: "Giao dịch & coin", group: "Hoạt động", icon: "transactions" },
  { key: "models", title: "Thư viện 3D", group: "Quản lý", icon: "models" },
  { key: "assets", title: "Tài nguyên", group: "Quản lý", icon: "assets" },
  { key: "content", title: "Nội dung", group: "Quản lý", icon: "content" },
  { key: "promotions", title: "Sự kiện & ưu đãi", group: "Quản lý", icon: "promotions" },
  { key: "releases", title: "Phát hành", group: "Hệ thống", icon: "releases" },
  { key: "activity", title: "Nhật ký & an ninh", group: "Hệ thống", icon: "activity" },
  { key: "settings", title: "Cài đặt", group: "Hệ thống", icon: "settings" },
] as const;
export type AdminSection = typeof ADMIN_SECTIONS[number]["key"];
export const adminHref = (section: AdminSection) => section === "overview" ? "/admin" : `/admin/${section}`;
