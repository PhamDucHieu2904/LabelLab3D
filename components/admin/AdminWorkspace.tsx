"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Activity, Box, ChevronRight, ExternalLink, FolderOpen, Gift, LayoutDashboard, LogOut, Menu, Newspaper, Rocket, Scale, Settings2, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { ADMIN_SECTIONS, adminHref, type AdminSection } from "@/lib/admin/navigation";
import OverviewPanel from "./OverviewPanel";
import s from "./AdminWorkspace.module.css";

const CommercePanel = dynamic(() => import("./CommercePanel"));
const ProductionUsersPanel = dynamic(() => import("./ProductionUsersPanel"));
const ManagementPanel = dynamic(() => import("./ManagementPanel"));
const OperationsPanel = dynamic(() => import("./OperationsPanel"));
const LegalHubPanel = dynamic(() => import("./LegalHubPanel"));

const icons = {
  overview: LayoutDashboard,
  traffic: Activity,
  users: Users,
  transactions: Wallet,
  models: Box,
  assets: FolderOpen,
  content: Newspaper,
  promotions: Gift,
  releases: Rocket,
  legal: Scale,
  activity: ShieldCheck,
  settings: Settings2,
};

export default function AdminWorkspace({ section }: { section: AdminSection }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<{ name: string; email: string } | null>(null);
  const current = ADMIN_SECTIONS.find((item) => item.key === section)!;

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/auth", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => res.ok ? await res.json() as { user?: { name?: string; email?: string } | null } : null)
      .then((payload) => {
        if (!active || !payload?.user) return;
        setAdminUser({ name: payload.user.name || "Quản trị viên", email: payload.user.email || "" });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function logout() {
    await fetch("/api/account/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    router.push("/admin/login");
  }

  const initials = (adminUser?.name || "HM").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "HM";

  return (
    <div className={s.workspace} lang="vi">
      <a href="#admin-main" className="skip-link">Đến nội dung</a>
      {menuOpen && <button className={s.scrim} aria-label="Đóng điều hướng" onClick={() => setMenuOpen(false)} />}
      <aside className={`${s.sidebar} ${menuOpen ? s.sidebarOpen : ""}`} aria-label="Điều hướng quản trị">
        <div className={s.brand}>
          <Link href="/admin" aria-label="HyperMockup Admin">
            <img src="/branding/hypermockup-logo.svg" width="165" height="24" alt="HyperMockup" />
          </Link>
          <button className={s.mobileOnly} aria-label="Đóng menu" onClick={() => setMenuOpen(false)}><X size={20} /></button>
        </div>
        <nav className={s.nav}>
          {["Hoạt động", "Quản lý", "Hệ thống"].map((group) => (
            <div key={group} className={s.navGroup}>
              <div className={s.navLabel}>{group}</div>
              {ADMIN_SECTIONS.filter((item) => item.group === group).map((item) => {
                const Icon = icons[item.icon];
                return (
                  <Link
                    key={item.key}
                    href={adminHref(item.key)}
                    className={`${s.navLink} ${section === item.key ? s.navActive : ""}`}
                    aria-current={section === item.key ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                    {item.title}
                    {section === item.key && <ChevronRight size={15} aria-hidden="true" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className={s.sidebarBottom}>
          <span className={s.adminAvatar}>{initials}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {adminUser?.name || "Quản trị viên"}
            </strong>
            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {adminUser?.email || "Cloudflare D1"}
            </span>
          </div>
          <button
            type="button"
            className={s.iconButton}
            title="Đăng xuất quản trị"
            aria-label="Đăng xuất quản trị"
            onClick={() => void logout()}
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>
      <div className={s.mainColumn}>
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            <button className={s.mobileOnly} onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-label="Mở menu"><Menu size={22} /></button>
            <span>Quản trị</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{current.title}</strong>
          </div>
          <div className={s.topbarActions}>
            <span className={s.demoBadge} style={{ background: "#ecfdf3", color: "#067647", borderColor: "#abefc6" }}>
              <span style={{ background: "#17b26a" }} />
              Cloudflare D1 · Live
            </span>
            <Link href="/" className={s.websiteLink}>Xem website<ExternalLink size={15} aria-hidden="true" /></Link>
          </div>
        </header>
        <main id="admin-main" className={s.main} tabIndex={-1}>
          {section === "overview" && <OverviewPanel />}
          {section === "traffic" && <OverviewPanel detailed />}
          {section === "users" && <><div className={s.pageHeading}><h1>Người dùng</h1></div><ProductionUsersPanel /></>}
          {section === "transactions" && <CommercePanel />}
          {["models", "assets", "content", "promotions", "releases"].includes(section) && (
            <>
              <div className={s.pageHeading}><h1>{current.title}</h1></div>
              <ManagementPanel key={section} section={section as "models" | "assets" | "content" | "promotions" | "releases"} />
            </>
          )}
          {section === "legal" && <LegalHubPanel />}
          {(section === "activity" || section === "settings") && (
            <>
              <div className={s.pageHeading}><h1>{current.title}</h1></div>
              <OperationsPanel key={section} section={section} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
