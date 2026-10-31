"use client";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Activity, Box, ChevronRight, ExternalLink, FolderOpen, Gift, LayoutDashboard, Menu, Newspaper, Rocket, Settings2, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { ADMIN_SECTIONS, adminHref, type AdminSection } from "@/lib/admin/navigation";
import OverviewPanel from "./OverviewPanel";
import s from "./AdminWorkspace.module.css";
const CommercePanel = dynamic(() => import("./CommercePanel"));
const UsersPanel = dynamic(() => import("./UsersPanel"));
const ManagementPanel = dynamic(() => import("./ManagementPanel"));
const OperationsPanel = dynamic(() => import("./OperationsPanel"));
const icons = { overview: LayoutDashboard, traffic: Activity, users: Users, transactions: Wallet, models: Box, assets: FolderOpen, content: Newspaper, promotions: Gift, releases: Rocket, activity: ShieldCheck, settings: Settings2 };
export default function AdminWorkspace({ section }: { section: AdminSection }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const current = ADMIN_SECTIONS.find(item => item.key === section)!;
  return <div className={s.workspace} lang="vi">
    <a href="#admin-main" className="skip-link">Đến nội dung</a>
    {menuOpen && <button className={s.scrim} aria-label="Đóng điều hướng" onClick={() => setMenuOpen(false)} />}
    <aside className={`${s.sidebar} ${menuOpen ? s.sidebarOpen : ""}`} aria-label="Điều hướng quản trị">
      <div className={s.brand}><Link href="/admin" aria-label="Labellab Admin"><img src="/branding/LLLogo.svg" width="146" height="39" alt="Labellab" /></Link><button className={s.mobileOnly} aria-label="Đóng menu" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
      <nav className={s.nav}>{["Hoạt động", "Quản lý", "Hệ thống"].map(group => <div key={group} className={s.navGroup}><div className={s.navLabel}>{group}</div>{ADMIN_SECTIONS.filter(item => item.group === group).map(item => {
        const Icon = icons[item.icon];
        return <Link key={item.key} href={adminHref(item.key)} className={`${s.navLink} ${section === item.key ? s.navActive : ""}`} aria-current={section === item.key ? "page" : undefined} onClick={() => setMenuOpen(false)}><Icon size={19} strokeWidth={1.7} aria-hidden="true"/>{item.title}{section === item.key && <ChevronRight size={15} aria-hidden="true"/>}</Link>;
      })}</div>)}</nav>
      <div className={s.sidebarBottom}><span className={s.adminAvatar}>LL</span><div><strong>Quản trị viên</strong><span>Chủ sở hữu</span></div></div>
    </aside>
    <div className={s.mainColumn}>
      <header className={s.topbar}><div className={s.breadcrumb}><button className={s.mobileOnly} onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-label="Mở menu"><Menu size={22}/></button><span>Quản trị</span><ChevronRight size={14} aria-hidden="true"/><strong>{current.title}</strong></div><div className={s.topbarActions}><span className={s.demoBadge}><span/>Dữ liệu mẫu</span><Link href="/" className={s.websiteLink}>Xem website<ExternalLink size={15} aria-hidden="true"/></Link></div></header>
      <main id="admin-main" className={s.main} tabIndex={-1}>
        {section === "overview" && <OverviewPanel />}
        {section === "traffic" && <OverviewPanel detailed />}
        {section === "users" && <><div className={s.pageHeading}><h1>Người dùng</h1></div><UsersPanel /></>}
        {section === "transactions" && <CommercePanel />}
        {["models", "assets", "content", "promotions", "releases"].includes(section) && <><div className={s.pageHeading}><h1>{current.title}</h1></div><ManagementPanel key={section} section={section as "models" | "assets" | "content" | "promotions" | "releases"} /></>}
        {(section === "activity" || section === "settings") && <><div className={s.pageHeading}><h1>{current.title}</h1></div><OperationsPanel key={section} section={section} /></>}
      </main>
    </div>
  </div>;
}
