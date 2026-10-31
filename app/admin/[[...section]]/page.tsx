import { notFound } from "next/navigation";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/admin/navigation";
export default async function AdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const key = section?.[0] ?? "overview";
  if ((section?.length ?? 0) > 1 || !ADMIN_SECTIONS.some(item => item.key === key)) notFound();
  return <AdminWorkspace section={key as AdminSection} />;
}
