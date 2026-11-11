import { notFound } from "next/navigation";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import AdminLoginPage from "@/components/admin/AdminLoginPage";
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/admin/navigation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser } from "@/lib/server/auth";
import type { AppEnv } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export default async function AdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const key = section?.[0] ?? "overview";
  if (key === "login" && section?.length === 1) return <AdminLoginPage />;
  if ((section?.length ?? 0) > 1 || !ADMIN_SECTIONS.some(item => item.key === key)) notFound();
  try {
    const { env } = await getCloudflareContext({ async: true });
    const user = await getSessionUser(env as AppEnv, (await cookies()).get("ll_session")?.value ?? null);
    if (user?.role !== "admin") redirect("/admin/login");
  } catch { redirect("/admin/login"); }
  return <AdminWorkspace section={key as AdminSection} />;
}
