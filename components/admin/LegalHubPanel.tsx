"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CalendarCheck2,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FolderArchive,
  RefreshCw,
  Scale,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { downloadCsv, formatDate, formatMoney, formatNumber } from "@/lib/admin/commerce";
import { maskTaxId, type AnnualTaxSummary } from "@/lib/legal/policies";
import s from "./AdminWorkspace.module.css";
import lh from "./LegalHubPanel.module.css";

type LegalProfile = {
  name: string;
  domain: string;
  contact: string;
  ownerName: string;
  ownerTaxId: string;
  maskOwnerTaxId: boolean;
  ownerAddress: string;
  ownerPhone: string;
  moitStatusUrl: string;
  usdToVndRate: number;
};

type MonthlyLegalLog = {
  sepayStatementSaved: boolean;
  csvExported: boolean;
  polarSettled: boolean;
  note: string;
  updatedAt: string;
};

type LegalChecklistState = {
  completedSteps: Record<string, string>;
  monthlyLogs: Record<string, MonthlyLegalLog>;
};

type YearOrder = {
  id: string;
  orderCode: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  provider: string;
  coins: number;
  amount: number;
  currency: string;
  status: string;
  providerOrderId: string | null;
  createdAt: string;
  receiptBuyerName?: string | null;
  receiptTaxCode?: string | null;
  receiptAddress?: string | null;
  receiptEmail?: string | null;
};

type SetupStep = {
  id: string;
  order: number;
  title: string;
  duration: string;
  cost: string;
  instructions: string[];
  actionUrl?: string;
  actionLabel?: string;
};

const SETUP_STEPS: readonly SetupStep[] = [
  {
    id: "bank_account",
    order: 1,
    title: "Dùng 01 tài khoản ngân hàng riêng cho SePay VietQR",
    duration: "5 phút",
    cost: "Miễn phí",
    instructions: [
      "Mở (hoặc dành riêng) 01 tài khoản ngân hàng chỉ để nhận tiền bán Coin từ SePay VietQR, tách bạch hoàn toàn khỏi tài khoản nhận lương và chi tiêu cá nhân hằng ngày.",
      "Lý do: Nếu cơ quan thuế hoặc ngân hàng yêu cầu sao kê đối soát, toàn bộ tiền vào tài khoản này khớp 100% với file CSV đơn hàng trên website, không bị nhầm tiền gia đình/bạn bè gửi là doanh thu.",
      "Cập nhật số tài khoản này trong cấu hình SePay và biến môi trường SEPAY_BANK_ACCOUNT.",
    ],
  },
  {
    id: "etax_sync",
    order: 2,
    title: "Kiểm tra đồng bộ 12 số CCCD = Mã số thuế trên eTax Mobile",
    duration: "3 phút",
    cost: "Miễn phí",
    instructions: [
      "Mở ứng dụng eTax Mobile trên điện thoại → đăng nhập bằng tài khoản VNeID mức 2.",
      "Vào mục Tra cứu thông tin người nộp thuế để chắc chắn 12 số CCCD của bạn đã khớp Cơ sở dữ liệu quốc gia về dân cư (theo Thông tư 86/2024/TT-BTC, từ 01/07/2025 số CCCD 12 số chính là Mã số thuế cá nhân).",
      "Chụp 01 ảnh màn hình trạng thái đồng bộ lưu vào thư mục hồ sơ Google Drive.",
    ],
  },
  {
    id: "owner_profile",
    order: 3,
    title: "Điền thông tin chủ sở hữu cá nhân ở Tab 'Hồ sơ & Chủ sở hữu'",
    duration: "2 phút",
    cost: "Miễn phí",
    instructions: [
      "Chuyển sang Tab 'Hồ sơ & Chủ sở hữu' bên cạnh, điền Họ tên thật, 12 số CCCD/MST, Địa chỉ liên hệ tại Việt Nam, Số điện thoại hỗ trợ và Email hỗ trợ (mặc định: hypermockup@gmail.com).",
      "Giữ bật tùy chọn 'Ẩn bớt các số giữa khi hiển thị công khai' để trang chủ và /legal/* chỉ hiển thị dạng 079•••••6789, không lộ full CCCD ra công cộng.",
      "Bấm Lưu lên Cloudflare D1, sau đó mở thử trang chủ và 4 trang /legal/* để kiểm tra.",
    ],
  },
  {
    id: "vnnic_domain",
    order: 4,
    title: "Thông báo tên miền quốc tế hypermockup.com với VNNIC",
    duration: "5 phút",
    cost: "Miễn phí",
    instructions: [
      "Truy cập cổng chính thức của Trung tâm Internet Việt Nam tại thongbaotenmien.vn.",
      "Chọn mục 'Thông báo sử dụng mới' → nhập tên miền hypermockup.com → chọn đối tượng Cá nhân → điền Họ tên, 12 số CCCD, địa chỉ, SĐT, email và mục đích sử dụng (kinh doanh trực tuyến).",
      "Gửi xác nhận và chụp ảnh màn hình kết quả thông báo thành công lưu vào thư mục Google Drive (bắt buộc theo Nghị định 147/2024/NĐ-CP để tránh bị phạt hành chính tên miền quốc tế).",
    ],
    actionUrl: "https://thongbaotenmien.vn",
    actionLabel: "Mở thongbaotenmien.vn",
  },
  {
    id: "moit_notify",
    order: 5,
    title: "Thông báo website TMĐT bán hàng với Bộ Công Thương (online.gov.vn)",
    duration: "10 phút nộp · 3–7 ngày duyệt",
    cost: "Miễn phí",
    instructions: [
      "Truy cập online.gov.vn → bấm Đăng ký → chọn loại đối tượng là 'Cá nhân' (khai báo đầy đủ Họ tên, 12 số CCCD/MST cá nhân, địa chỉ, email).",
      "Sau khi tài khoản cá nhân được duyệt đăng nhập, chọn 'Thông báo website' → nhập tên miền https://hypermockup.com, mô tả dịch vụ công cụ mockup 3D trực tuyến, chọn các danh mục chính sách đã có sẵn trên /legal/*.",
      "Lưu ý: Nếu cán bộ thẩm định yêu cầu tạm hiện đầy đủ MST trên footer trong lúc kiểm duyệt, bạn chỉ cần bỏ tích ô ẩn số ở Tab 1 rồi bật lại hoặc giữ theo hướng dẫn của cán bộ.",
      "Khi hồ sơ chuyển trạng thái 'Đã duyệt', tải PDF xác nhận lưu Google Drive và dán đường dẫn online.gov.vn/Home/WebDetails/... vào Tab 1 để tự động gắn huy hiệu 'Đã thông báo Bộ Công Thương'.",
    ],
    actionUrl: "http://online.gov.vn",
    actionLabel: "Mở online.gov.vn",
  },
  {
    id: "polar_payout_setup",
    order: 6,
    title: "Liên kết tài khoản ngân hàng VN nhận Payout trên Polar.sh (nếu bán quốc tế)",
    duration: "5 phút",
    cost: "Miễn phí tạo · Phí khi rút",
    instructions: [
      "Đăng nhập Polar Dashboard → vào Finance → Account → làm theo luồng xác minh Stripe Connect Express cho cá nhân tại Việt Nam.",
      "Liên kết tài khoản ngân hàng Việt Nam đứng tên chính chủ của bạn (trùng tên trên CCCD).",
      "Nếu bạn tạm thời chưa mở bán cho khách nước ngoài (chỉ bán Việt Nam qua SePay), bạn có thể đánh dấu bỏ qua/hoàn thành sau.",
    ],
    actionUrl: "https://polar.sh",
    actionLabel: "Mở Polar.sh",
  },
];

const DEFAULT_PROFILE: LegalProfile = {
  name: "HyperMockup",
  domain: "hypermockup.com",
  contact: "hypermockup@gmail.com",
  ownerName: "",
  ownerTaxId: "",
  maskOwnerTaxId: true,
  ownerAddress: "",
  ownerPhone: "",
  moitStatusUrl: "",
  usdToVndRate: 25500,
};

const EMPTY_CHECKLIST: LegalChecklistState = {
  completedSteps: {},
  monthlyLogs: {},
};

const DRIVE_TREE_TEMPLATE = `Ho-So-HyperMockup/ (Lưu trữ tối thiểu 03 năm theo Luật TMĐT 122/2025/QH15)
├── 01-Giay-To-Phap-Ly-1-Lan/
│   ├── 01-Dong-bo-CCCD-MST-eTax-Mobile.png
│   ├── 02-Xac-nhan-thongbaotenmien-hypermockup.png
│   └── 03-Xac-nhan-Bo-Cong-Thuong-online-gov-vn.pdf
└── 02-Doi-Soat-Doanh-Thu/
    └── 2026/
        ├── Thang-11/
        │   ├── sao-ke-ngan-hang-sepay-2026-11.pdf
        │   ├── hypermockup-doi-soat-2026-11.csv
        │   └── polar-reverse-invoice-2026-11.pdf  (chỉ cần nếu tháng có rút Polar)
        └── hypermockup-doi-soat-ca-nam-2026.csv`;

function currentVnMonth(): string {
  const vnNow = new Date(Date.now() + 7 * 3_600_000);
  return `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, "0")}`;
}

function orderVnMonth(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const vn = new Date(ms + 7 * 3_600_000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function LegalHubPanel() {
  const [tab, setTab] = useState<"profile" | "setup" | "monthly" | "inspection">("profile");
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date(Date.now() + 7 * 3_600_000).getUTCFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentVnMonth);

  const [profile, setProfile] = useState<LegalProfile>(DEFAULT_PROFILE);
  const [taxSummary, setTaxSummary] = useState<AnnualTaxSummary | null>(null);
  const [consentCount, setConsentCount] = useState(0);
  const [checklist, setChecklist] = useState<LegalChecklistState>(EMPTY_CHECKLIST);
  const [yearOrders, setYearOrders] = useState<YearOrder[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [copiedTree, setCopiedTree] = useState(false);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((curr) => (curr === msg ? "" : curr)), 4500);
  };

  const load = useCallback(async (yearToLoad: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/legal?year=${yearToLoad}`, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error("Không thể tải dữ liệu Pháp lý & Thuế từ Cloudflare D1.");
      const payload = (await res.json()) as {
        profile?: LegalProfile;
        taxSummary?: AnnualTaxSummary;
        consentCount?: number;
        checklist?: LegalChecklistState;
        yearOrders?: YearOrder[];
      };
      if (payload.profile) setProfile(payload.profile);
      if (payload.taxSummary) setTaxSummary(payload.taxSummary);
      setConsentCount(Number(payload.consentCount ?? 0));
      if (payload.checklist) setChecklist(payload.checklist);
      setYearOrders(payload.yearOrders ?? []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(selectedYear); });
    return () => cancelAnimationFrame(frame);
  }, [load, selectedYear]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/legal", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_profile", profile }),
      });
      if (!res.ok) throw new Error("Không thể lưu hồ sơ pháp lý lên Cloudflare D1.");
      const payload = (await res.json()) as { profile?: LegalProfile };
      if (payload.profile) setProfile(payload.profile);
      notify("Đã lưu thông tin chủ sở hữu lên Cloudflare D1 và đồng bộ ra website.");
      void load(selectedYear);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  async function persistChecklist(nextChecklist: LegalChecklistState, successText: string) {
    setChecklist(nextChecklist);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/legal", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_checklist", checklist: nextChecklist }),
      });
      if (!res.ok) throw new Error("Không thể lưu tiến độ checklist lên Cloudflare D1.");
      const payload = (await res.json()) as { checklist?: LegalChecklistState };
      if (payload.checklist) setChecklist(payload.checklist);
      notify(successText);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Lưu tiến độ thất bại.");
    } finally {
      setSaving(false);
    }
  }

  function toggleSetupStep(stepId: string) {
    const nextSteps = { ...checklist.completedSteps };
    if (nextSteps[stepId]) {
      delete nextSteps[stepId];
    } else {
      nextSteps[stepId] = new Date().toISOString();
    }
    void persistChecklist(
      { ...checklist, completedSteps: nextSteps },
      nextSteps[stepId] ? "Đã đánh dấu hoàn thành bước thiết lập trên D1." : "Đã bỏ đánh dấu bước thiết lập.",
    );
  }

  const currentMonthLog: MonthlyLegalLog = checklist.monthlyLogs[selectedMonth] ?? {
    sepayStatementSaved: false,
    csvExported: false,
    polarSettled: false,
    note: "",
    updatedAt: "",
  };

  function updateCurrentMonthField<K extends keyof MonthlyLegalLog>(key: K, value: MonthlyLegalLog[K]) {
    const updated: MonthlyLegalLog = {
      ...currentMonthLog,
      [key]: value,
      updatedAt: new Date().toISOString(),
    };
    setChecklist((prev) => ({
      ...prev,
      monthlyLogs: { ...prev.monthlyLogs, [selectedMonth]: updated },
    }));
  }

  function saveCurrentMonthLog(override?: Partial<MonthlyLegalLog>, message = `Đã lưu nhật ký đối soát tháng ${selectedMonth} lên D1.`) {
    const updated: MonthlyLegalLog = {
      ...currentMonthLog,
      ...override,
      updatedAt: new Date().toISOString(),
    };
    void persistChecklist(
      {
        ...checklist,
        monthlyLogs: { ...checklist.monthlyLogs, [selectedMonth]: updated },
      },
      message,
    );
  }

  function exportOrdersCsv(rows: YearOrder[], filename: string) {
    const rate = profile.usdToVndRate || 25500;
    downloadCsv(
      filename,
      [
        "Thời gian (UTC+7)",
        "Mã đơn hàng",
        "Kênh thanh toán",
        "Trạng thái",
        "Mã giao dịch cổng",
        "Tiền tệ",
        "Số tiền gốc",
        `Quy đổi VNĐ ước tính (${rate} đ/USD)`,
        "Số Coin",
        "Tài khoản mua",
        "Tên/Đơn vị biên nhận",
        "MST người mua",
        "Địa chỉ biên nhận",
        "Email biên nhận",
      ],
      rows.map((o) => {
        const isVnd = o.currency === "VND";
        const rawAmount = isVnd ? o.amount : (o.amount / 100).toFixed(2);
        const vndEstimated = o.status === "paid" ? (isVnd ? o.amount : Math.round((o.amount / 100) * rate)) : 0;
        return [
          formatDate(o.createdAt),
          o.orderCode,
          o.provider === "polar" ? "Polar.sh (Quốc tế)" : "SePay VietQR (Việt Nam)",
          o.status,
          o.providerOrderId ?? "",
          o.currency,
          rawAmount,
          vndEstimated,
          o.coins,
          o.userEmail ?? o.userId,
          o.receiptBuyerName ?? "",
          o.receiptTaxCode ?? "",
          o.receiptAddress ?? "",
          o.receiptEmail ?? "",
        ];
      }),
    );
  }

  const paidYearOrders = yearOrders.filter((o) => o.status === "paid");
  const monthPaidOrders = paidYearOrders.filter((o) => orderVnMonth(o.createdAt) === selectedMonth);
  const monthSepayVnd = monthPaidOrders.filter((o) => o.currency === "VND").reduce((sum, o) => sum + Number(o.amount), 0);
  const monthPolarOrders = monthPaidOrders.filter((o) => o.currency !== "VND");
  const monthPolarUsd = monthPolarOrders.reduce((sum, o) => sum + Number(o.amount) / 100, 0);

  const completedSetupCount = SETUP_STEPS.filter((step) => Boolean(checklist.completedSteps[step.id])).length;
  const publicTaxPreview = maskTaxId(profile.ownerTaxId, profile.maskOwnerTaxId);
  const sortedMonthlyHistory = Object.entries(checklist.monthlyLogs).sort((a, b) => b[0].localeCompare(a[0]));

  async function copyDriveTree() {
    try {
      await navigator.clipboard.writeText(DRIVE_TREE_TEMPLATE);
      setCopiedTree(true);
      window.setTimeout(() => setCopiedTree(false), 2000);
    } catch {
      // Ignore clipboard errors in restricted contexts.
    }
  }

  return (
    <div className={lh.root}>
      <div className={s.pageHeading} style={{ marginBottom: 4 }}>
        <div>
          <h1>Pháp lý &amp; thuế cá nhân</h1>
          <p className={s.subtle} style={{ marginTop: 4 }}>
            Trung tâm lưu trữ hồ sơ chủ sở hữu, hướng dẫn tuân thủ từng bước, nhật ký sao kê hằng tháng và xuất chứng từ đối soát (Việt Nam · 2026).
          </p>
        </div>
        <div className={s.actions}>
          <select
            className={s.select}
            aria-label="Chọn năm đối soát"
            value={selectedYear}
            onChange={(e) => {
              const y = Number(e.target.value);
              setSelectedYear(y);
              if (!selectedMonth.startsWith(`${y}-`)) setSelectedMonth(`${y}-01`);
            }}
          >
            {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
              <option key={y} value={y}>Năm {y}</option>
            ))}
          </select>
          <button type="button" className={s.secondary} onClick={() => void load(selectedYear)} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" />Làm mới
          </button>
        </div>
      </div>

      {toast && <div role="status" className={s.toast}>{toast}</div>}

      <div className={lh.summaryGrid}>
        <article className={lh.kpiCard}>
          <div className={lh.kpiTop}>
            <span>Doanh thu năm {selectedYear}</span>
            <Wallet size={16} aria-hidden="true" />
          </div>
          <div className={lh.kpiValue}>{formatMoney(taxSummary?.totalEstimatedVnd ?? 0, "vn")}</div>
          <div className={lh.progressTrack} aria-hidden="true">
            <div
              className={lh.progressFill}
              style={{
                width: `${Math.min(100, Math.max((taxSummary?.totalEstimatedVnd ?? 0) > 0 ? 2 : 0, taxSummary?.percentOfThreshold ?? 0))}%`,
                background:
                  taxSummary?.level === "exceeded"
                    ? "#d92d20"
                    : taxSummary?.level === "warning"
                      ? "#f79009"
                      : "#12b76a",
              }}
            />
          </div>
          <span className={lh.kpiSub}>
            {taxSummary?.percentOfThreshold ?? 0}% ngưỡng miễn thuế 1 tỷ/năm (NĐ 141/2026)
          </span>
        </article>

        <article className={lh.kpiCard}>
          <div className={lh.kpiTop}>
            <span>Checklist thiết lập 1 lần</span>
            <FileCheck2 size={16} aria-hidden="true" />
          </div>
          <div className={lh.kpiValue}>{completedSetupCount} / {SETUP_STEPS.length}</div>
          <span className={lh.kpiSub}>
            {completedSetupCount === SETUP_STEPS.length
              ? "Đã hoàn tất đầy đủ hồ sơ cơ bản"
              : "Mở tab Hướng dẫn từng bước để hoàn thiện"}
          </span>
        </article>

        <article className={lh.kpiCard}>
          <div className={lh.kpiTop}>
            <span>Hiển thị CCCD/MST công khai</span>
            <ShieldCheck size={16} aria-hidden="true" />
          </div>
          <div className={lh.kpiValue} style={{ fontSize: 19 }}>
            {publicTaxPreview || "Chưa điền"}
          </div>
          <span className={lh.kpiSub}>
            {profile.maskOwnerTaxId
              ? "Đang bật ẩn số giữa từ phía máy chủ"
              : "Đang hiển thị đầy đủ trên giao diện công khai"}
          </span>
        </article>

        <article className={lh.kpiCard}>
          <div className={lh.kpiTop}>
            <span>Bằng chứng đồng ý (D1)</span>
            <Scale size={16} aria-hidden="true" />
          </div>
          <div className={lh.kpiValue}>{formatNumber(consentCount)}</div>
          <span className={lh.kpiSub}>
            Lưu tự động theo Luật BVDLCN 91/2025/QH15
          </span>
        </article>
      </div>

      <div className={s.tabs} role="group" aria-label="Mục Pháp lý và Thuế">
        {([
          ["profile", "1. Hồ sơ & Chủ sở hữu"],
          ["setup", `2. Hướng dẫn làm 1 lần (${completedSetupCount}/${SETUP_STEPS.length})`],
          ["monthly", "3. Việc cần làm mỗi tháng"],
          ["inspection", "4. Hồ sơ & Kịch bản khi bị hỏi"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <section className={lh.card}>
          <div className={lh.cardHeader}>
            <div>
              <h2>Thông tin cá nhân chủ sở hữu website</h2>
              <p>Tự động đồng bộ vào chân trang chủ và bộ 4 trang pháp lý tại <code>/legal/*</code>. Hệ thống luôn ẩn bớt 5 số giữa CCCD khi trả ra trình duyệt công khai.</p>
            </div>
          </div>

          <form onSubmit={saveProfile}>
            <div className={s.formGrid}>
              <label className={s.field}>
                Họ và tên chủ sở hữu cá nhân
                <input
                  className={s.input}
                  type="text"
                  placeholder="Nguyễn Văn A"
                  value={profile.ownerName}
                  onChange={(e) => setProfile((p) => ({ ...p, ownerName: e.target.value }))}
                />
              </label>

              <label className={s.field}>
                Mã số thuế cá nhân (12 số CCCD theo TT 86/2024/TT-BTC)
                <input
                  className={s.input}
                  type="text"
                  placeholder="079123456789"
                  value={profile.ownerTaxId}
                  onChange={(e) => setProfile((p) => ({ ...p, ownerTaxId: e.target.value }))}
                />
              </label>

              <label className={s.field}>
                Số điện thoại hỗ trợ &amp; tiếp nhận khiếu nại
                <input
                  className={s.input}
                  type="tel"
                  placeholder="0909 123 456"
                  value={profile.ownerPhone}
                  onChange={(e) => setProfile((p) => ({ ...p, ownerPhone: e.target.value }))}
                />
              </label>

              <label className={s.field}>
                Email hỗ trợ pháp lý &amp; hoàn tiền
                <input
                  className={s.input}
                  type="email"
                  required
                  placeholder="hypermockup@gmail.com"
                  value={profile.contact}
                  onChange={(e) => setProfile((p) => ({ ...p, contact: e.target.value }))}
                />
              </label>

              <label className={`${s.field} ${s.fullWidth}`}>
                Địa chỉ liên hệ tại Việt Nam
                <input
                  className={s.input}
                  type="text"
                  placeholder="Ví dụ: Phường ..., Quận/Thành phố ..., Việt Nam"
                  value={profile.ownerAddress}
                  onChange={(e) => setProfile((p) => ({ ...p, ownerAddress: e.target.value }))}
                />
              </label>

              <label className={s.field}>
                Tỷ giá quy đổi USD → VND (tính tổng doanh thu Polar.sh)
                <input
                  className={s.input}
                  type="number"
                  min={15000}
                  max={40000}
                  step={100}
                  required
                  value={profile.usdToVndRate}
                  onChange={(e) => setProfile((p) => ({ ...p, usdToVndRate: Number(e.target.value) }))}
                />
              </label>

              <label className={s.field}>
                Link xác nhận Bộ Công Thương (dán sau khi online.gov.vn duyệt)
                <input
                  className={s.input}
                  type="url"
                  placeholder="http://online.gov.vn/Home/WebDetails/..."
                  value={profile.moitStatusUrl}
                  onChange={(e) => setProfile((p) => ({ ...p, moitStatusUrl: e.target.value }))}
                />
              </label>

              <label className={`${s.inline} ${s.fullWidth}`} style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={profile.maskOwnerTaxId}
                  onChange={(e) => setProfile((p) => ({ ...p, maskOwnerTaxId: e.target.checked }))}
                  style={{ width: 17, height: 17, accentColor: "#b83d61" }}
                />
                <span>
                  <strong>Ẩn bớt các số giữa CCCD/MST khi hiển thị công khai</strong> (hiển thị dạng <code>{maskTaxId(profile.ownerTaxId || "079123456789", true)}</code> — khuyến nghị luôn bật để bảo vệ danh tính cá nhân).
                </span>
              </label>
            </div>

            <div className={lh.previewBox}>
              <strong>Xem trước dòng hiển thị công khai trên Footer &amp; trang /legal/*:</strong>
              <p>
                Chủ sở hữu: <strong>{profile.ownerName || "[Chưa điền họ tên]"}</strong>
                {" · "}MST cá nhân: <strong>{publicTaxPreview || "[Chưa điền]"}</strong>
                {" · "}Địa chỉ: {profile.ownerAddress || "[Chưa điền]"}
                {" · "}SĐT: {profile.ownerPhone || "[Chưa điền]"}
                {" · "}Email: {profile.contact}
              </p>
            </div>

            <div className={lh.legalLinksRow}>
              <Link href="/legal/terms" target="_blank" className={lh.legalLinkPill}>Xem Điều khoản sử dụng <ExternalLink size={13} /></Link>
              <Link href="/legal/privacy" target="_blank" className={lh.legalLinkPill}>Xem Chính sách bảo mật <ExternalLink size={13} /></Link>
              <Link href="/legal/refund" target="_blank" className={lh.legalLinkPill}>Xem Thanh toán &amp; Hoàn tiền <ExternalLink size={13} /></Link>
              <Link href="/legal/complaints" target="_blank" className={lh.legalLinkPill}>Xem Khiếu nại &amp; Bản quyền <ExternalLink size={13} /></Link>
            </div>

            <div className={s.actions} style={{ justifyContent: "flex-end", marginTop: 20 }}>
              <button type="submit" className={s.primary} disabled={saving || loading}>
                {saving ? "Đang lưu…" : "Lưu hồ sơ lên Cloudflare D1"}
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === "setup" && (
        <>
          <div className={lh.callout}>
            <strong>Tóm tắt dễ nhớ:</strong> Với doanh thu nhỏ (~3 triệu/tháng, tức ~36 triệu/năm — thấp hơn rất nhiều so với ngưỡng <strong>1 tỷ đồng/năm</strong> theo NĐ 141/2026/NĐ-CP), bạn <strong>không phải nộp thuế GTGT &amp; TNCN</strong> và <strong>không cần thành lập công ty</strong>. Chỉ cần làm gọn 6 bước miễn phí bên dưới đúng <strong>1 lần duy nhất</strong> để đầy đủ giấy tờ pháp lý nếu cơ quan nhà nước kiểm tra.
          </div>

          <div className={lh.stepList}>
            {SETUP_STEPS.map((step) => {
              const completedAt = checklist.completedSteps[step.id];
              const isDone = Boolean(completedAt);
              return (
                <article key={step.id} className={`${lh.stepCard} ${isDone ? lh.stepCardDone : ""}`}>
                  <div className={lh.stepHead}>
                    <div className={lh.stepTitleWrap}>
                      <span className={lh.stepBadge}>{isDone ? <Check size={16} /> : step.order}</span>
                      <div>
                        <h3 className={lh.stepTitle}>Bước {step.order}: {step.title}</h3>
                        <div className={lh.stepMeta}>
                          <span className={lh.stepMetaTag}>Thời gian: {step.duration}</span>
                          <span className={lh.stepMetaTag}>Chi phí: {step.cost}</span>
                          {completedAt && (
                            <span style={{ color: "#067647", fontWeight: 600 }}>
                              Đã xong ngày {formatDate(completedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <label className={lh.stepDoneToggle}>
                      <input
                        type="checkbox"
                        checked={isDone}
                        disabled={saving}
                        onChange={() => toggleSetupStep(step.id)}
                      />
                      <span>{isDone ? "Đã hoàn thành" : "Đánh dấu xong"}</span>
                    </label>
                  </div>

                  <ol className={lh.stepInstructions}>
                    {step.instructions.map((line, idx) => (
                      <li key={`${step.id}-${idx}`}>{line}</li>
                    ))}
                  </ol>

                  {step.actionUrl && (
                    <div className={lh.stepActions}>
                      <a
                        href={step.actionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={lh.extBtn}
                      >
                        {step.actionLabel}
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {tab === "monthly" && (
        <div className={lh.monthGrid}>
          <section className={lh.card}>
            <div className={lh.cardHeader}>
              <div>
                <h2>Quy trình đối soát hằng tháng (chỉ mất ~5 phút)</h2>
                <p>Cuối mỗi tháng (hoặc ngày 01 tháng sau), làm đúng 3 bước dưới đây và cất vào Google Drive là xong hoàn toàn.</p>
              </div>
              <input
                type="month"
                className={s.dateInput}
                aria-label="Chọn tháng đối soát"
                value={selectedMonth}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  setSelectedMonth(val);
                  const yr = Number(val.slice(0, 4));
                  if (Number.isSafeInteger(yr) && yr !== selectedYear) setSelectedYear(yr);
                }}
              />
            </div>

            <div className={lh.callout} style={{ marginBottom: 16 }}>
              <strong>Tháng {selectedMonth}:</strong>{" "}
              SePay nội địa: <strong>{formatMoney(monthSepayVnd, "vn")}</strong>{" "}
              · Polar quốc tế: <strong>{formatMoney(monthPolarUsd, "international")}</strong> ({monthPolarOrders.length} đơn)
              {" · "}Tổng {monthPaidOrders.length} đơn thành công.
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div className={`${lh.checkRow} ${currentMonthLog.sepayStatementSaved ? lh.checkRowDone : ""}`}>
                <label className={lh.checkLabel}>
                  <input
                    type="checkbox"
                    checked={currentMonthLog.sepayStatementSaved}
                    onChange={(e) => updateCurrentMonthField("sepayStatementSaved", e.target.checked)}
                  />
                  <div>
                    <strong>Bước 1: Tải sao kê PDF/Excel tài khoản ngân hàng SePay tháng {selectedMonth}</strong>
                    <small>
                      Mở app ngân hàng của tài khoản riêng → Sao kê từ ngày 01 đến ngày cuối tháng {selectedMonth} → tải PDF/Excel bỏ vào thư mục <code>Thang-{selectedMonth.slice(5)}</code> trên Google Drive.
                    </small>
                  </div>
                </label>
              </div>

              <div className={`${lh.checkRow} ${currentMonthLog.csvExported ? lh.checkRowDone : ""}`}>
                <label className={lh.checkLabel}>
                  <input
                    type="checkbox"
                    checked={currentMonthLog.csvExported}
                    onChange={(e) => updateCurrentMonthField("csvExported", e.target.checked)}
                  />
                  <div>
                    <strong>Bước 2: Xuất file CSV đối soát đơn hàng tháng {selectedMonth} từ hệ thống</strong>
                    <small>
                      File CSV tự động gồm mã đơn LL..., mã GD ngân hàng/Polar, số tiền và thông tin biên nhận khách nhập. Cất chung thư mục với sao kê ngân hàng.
                    </small>
                  </div>
                </label>
                <button
                  type="button"
                  className={s.secondary}
                  onClick={() => {
                    exportOrdersCsv(monthPaidOrders, `hypermockup-doi-soat-${selectedMonth}.csv`);
                    saveCurrentMonthLog(
                      { csvExported: true },
                      `Đã tải CSV tháng ${selectedMonth} và đánh dấu hoàn thành Bước 2 trên D1.`,
                    );
                  }}
                >
                  <Download size={14} aria-hidden="true" />Tải CSV tháng {selectedMonth.slice(5)}
                </button>
              </div>

              <div className={`${lh.checkRow} ${currentMonthLog.polarSettled ? lh.checkRowDone : ""}`}>
                <label className={lh.checkLabel}>
                  <input
                    type="checkbox"
                    checked={currentMonthLog.polarSettled}
                    onChange={(e) => updateCurrentMonthField("polarSettled", e.target.checked)}
                  />
                  <div>
                    <strong>Bước 3: Rút Payout Polar.sh &amp; tải Reverse Invoice (nếu có đơn quốc tế ≥ $10)</strong>
                    <small>
                      {monthPolarOrders.length > 0
                        ? `Tháng này có ${monthPolarOrders.length} đơn Polar (${formatMoney(monthPolarUsd, "international")}). Vào Polar Dashboard → Finance → Payouts → bấm rút về ngân hàng VN → bấm '...' → Download invoice (PDF) cất vào thư mục tháng.`
                        : "Tháng này không có đơn Polar.sh — bạn có thể tích luôn là xong (không cần thao tác gì trên Polar)."}
                    </small>
                  </div>
                </label>
                {monthPolarOrders.length > 0 && (
                  <a href="https://polar.sh" target="_blank" rel="noopener noreferrer" className={lh.extBtn}>
                    Mở Polar <ExternalLink size={13} />
                  </a>
                )}
              </div>

              <label className={s.field} style={{ marginTop: 4 }}>
                Ghi chú riêng cho tháng {selectedMonth} (tùy chọn)
                <textarea
                  className={s.textarea}
                  rows={2}
                  placeholder="Ví dụ: Đã cất sao kê MBBank và CSV lên Google Drive, tổng doanh thu dưới ngưỡng đóng thuế."
                  value={currentMonthLog.note}
                  onChange={(e) => updateCurrentMonthField("note", e.target.value)}
                />
              </label>

              <div className={s.actions} style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className={s.primary}
                  disabled={saving}
                  onClick={() => saveCurrentMonthLog()}
                >
                  <CalendarCheck2 size={15} aria-hidden="true" />
                  {saving ? "Đang lưu…" : `Lưu nhật ký tháng ${selectedMonth} lên D1`}
                </button>
              </div>
            </div>
          </section>

          <section className={lh.card}>
            <div className={lh.cardHeader}>
              <div>
                <h2>Lịch sử các tháng đã chốt</h2>
                <p>Nhìn nhanh để biết tháng nào đã sao lưu đủ giấy tờ.</p>
              </div>
            </div>
            {sortedMonthlyHistory.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                {sortedMonthlyHistory.map(([mKey, log]) => {
                  const doneCount = [log.sepayStatementSaved, log.csvExported, log.polarSettled].filter(Boolean).length;
                  return (
                    <button
                      key={mKey}
                      type="button"
                      onClick={() => setSelectedMonth(mKey)}
                      style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: `1px solid ${mKey === selectedMonth ? "#b83d61" : "#e7e8ec"}`,
                        background: mKey === selectedMonth ? "#fdf6f8" : "#fafbfc",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <strong>Tháng {mKey}</strong>
                        <span className={s.status} data-status={doneCount === 3 ? "paid" : "pending"}>
                          {doneCount === 3 ? <><CheckCircle2 size={12} /> Đủ 3/3 bước</> : `${doneCount}/3 bước`}
                        </span>
                      </div>
                      {log.note && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#656874" }}>{log.note}</p>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className={s.subtle}>Chưa có tháng nào được lưu. Khi bạn lưu nhật ký tháng đầu tiên, lịch sử sẽ hiện tại đây.</p>
            )}
          </section>
        </div>
      )}

      {tab === "inspection" && (
        <>
          <section className={lh.card}>
            <div className={lh.cardHeader}>
              <div>
                <h2>Xuất nhanh hồ sơ đối soát năm {selectedYear}</h2>
                <p>Nếu cơ quan thuế, ngân hàng hoặc Sở Công Thương yêu cầu đối chiếu doanh thu, chỉ cần xuất 2 file bên dưới kèm sao kê ngân hàng.</p>
              </div>
              <div className={s.actions}>
                <button
                  type="button"
                  className={s.primary}
                  onClick={() => exportOrdersCsv(paidYearOrders, `hypermockup-doi-soat-thue-ca-nam-${selectedYear}.csv`)}
                >
                  <Download size={15} aria-hidden="true" />
                  Xuất CSV doanh thu năm {selectedYear} ({paidYearOrders.length} đơn)
                </button>
                <button
                  type="button"
                  className={s.secondary}
                  onClick={() => exportOrdersCsv(yearOrders, `hypermockup-toan-bo-don-hang-${selectedYear}.csv`)}
                >
                  <Download size={15} aria-hidden="true" />
                  Xuất toàn bộ đơn gồm hủy/hoàn ({yearOrders.length} đơn)
                </button>
              </div>
            </div>

            <div className={lh.callout}>
              <strong>Tình trạng nghĩa vụ thuế năm {selectedYear}:</strong> Tổng doanh thu ước tính cả năm là{" "}
              <strong>{formatMoney(taxSummary?.totalEstimatedVnd ?? 0, "vn")}</strong> (SePay:{" "}
              <strong>{formatMoney(taxSummary?.sepayVnd ?? 0, "vn")}</strong> + Polar:{" "}
              <strong>{formatMoney(taxSummary?.polarUsd ?? 0, "international")}</strong>).{" "}
              {taxSummary && taxSummary.totalEstimatedVnd <= 1_000_000_000
                ? "Doanh thu đang nằm dưới ngưỡng 1 tỷ đồng/năm theo Nghị định 141/2026/NĐ-CP → thuộc diện miễn thuế GTGT & TNCN cá nhân và không bắt buộc xuất hóa đơn điện tử."
                : "Doanh thu đã vượt mốc 1 tỷ đồng/năm → liên hệ đại lý thuế để thực hiện kê khai thuế và đăng ký hóa đơn điện tử."}
            </div>
          </section>

          <section className={lh.card}>
            <div className={lh.cardHeader}>
              <div>
                <h2><FolderArchive size={17} style={{ verticalAlign: "-3px", marginRight: 6 }} />Cấu trúc thư mục Google Drive chuẩn (lưu tối thiểu 3 năm)</h2>
                <p>Cứ lưu đúng cấu trúc gọn gàng này để bất cứ khi nào cần giải trình là gửi được ngay trong 1 phút.</p>
              </div>
              <button type="button" className={s.secondary} onClick={() => void copyDriveTree()}>
                {copiedTree ? <Check size={14} /> : <Copy size={14} />}
                {copiedTree ? "Đã sao chép" : "Sao chép cấu trúc"}
              </button>
            </div>
            <pre className={lh.folderTree}>{DRIVE_TREE_TEMPLATE}</pre>
          </section>

          <section className={lh.card}>
            <div className={lh.cardHeader}>
              <div>
                <h2>Kịch bản trả lời nhanh khi có cơ quan nhà nước / ngân hàng hỏi</h2>
                <p>Lưu sẵn làm sổ tay tham khảo để xử lý bình tĩnh, đúng quy định pháp luật hiện hành (2026).</p>
              </div>
            </div>
            <div className={lh.faqGrid}>
              <article className={lh.faqCard}>
                <h3>1. Cơ quan thuế hỏi dòng tiền tài khoản ngân hàng</h3>
                <p>
                  Cung cấp <strong>Sao kê tài khoản ngân hàng riêng</strong> + <strong>CSV doanh thu cả năm</strong> xuất ở trên. Giải trình rõ: đây là doanh thu bán dịch vụ công cụ mockup 3D trực tuyến của cá nhân, tổng doanh thu cả năm dưới ngưỡng <strong>1 tỷ đồng/năm</strong> nên thuộc diện không phải nộp thuế GTGT và TNCN theo Nghị định 141/2026/NĐ-CP (sửa đổi NĐ 68/2026/NĐ-CP).
                </p>
              </article>

              <article className={lh.faqCard}>
                <h3>2. Ngân hàng hỏi nguồn tiền nước ngoài từ Stripe / Polar.sh</h3>
                <p>
                  Gửi file PDF <strong>Reverse Invoice</strong> tải từ Polar Dashboard (<code>Finance → Payouts</code>) kèm CSV đơn hàng Polar từ hệ thống. Giải thích: Polar.sh là đơn vị Merchant of Record bán phần mềm/công cụ web trực tuyến ra thị trường quốc tế và chuyển trả doanh thu chia sẻ về cho tác giả cá nhân tại Việt Nam.
                </p>
              </article>

              <article className={lh.faqCard}>
                <h3>3. Sở Công Thương / Quản lý thị trường kiểm tra website</h3>
                <p>
                  Trình <strong>Xác nhận đã thông báo website TMĐT bán hàng (online.gov.vn)</strong>, <strong>Ảnh xác nhận tên miền quốc tế (thongbaotenmien.vn)</strong>, bộ 4 trang điều khoản tiếng Việt tại <code>/legal/*</code>, cơ chế chỉ niêm yết VND cho IP Việt Nam (đúng TT 32/2013/TT-NHNN) và log đồng ý khách hàng (<code>legal_consents</code> trên D1).
                </p>
              </article>

              <article className={lh.faqCard}>
                <h3>4. Khách hàng tại Việt Nam hỏi xuất hóa đơn VAT</h3>
                <p>
                  Trả lời minh bạch: Website vận hành dưới hình thức cá nhân kinh doanh có doanh thu dưới ngưỡng 1 tỷ đồng/năm (chưa thuộc diện bắt buộc xuất hóa đơn GTGT theo NĐ 254/2026/NĐ-CP &amp; NĐ 141/2026/NĐ-CP). Bạn gửi khách <strong>Xác nhận đơn hàng + Chứng từ chuyển khoản SePay</strong>; nếu khách doanh nghiệp bắt buộc cần hóa đơn bán hàng có mã cơ quan thuế, có thể xin cấp hóa đơn theo từng lần phát sinh tại cơ quan thuế địa phương (hoặc cân nhắc nâng lên Công ty TNHH khi có nhiều khách B2B).
                </p>
              </article>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
