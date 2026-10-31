import type { Metadata } from "next";
export const metadata: Metadata = {
  title: { default: "Quản trị | Labellab", template: "%s | Labellab Admin" },
  robots: { index: false, follow: false },
};
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
