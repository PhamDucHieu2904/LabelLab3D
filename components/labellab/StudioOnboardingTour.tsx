"use client";

import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Camera,
  CheckCircle2,
  Download,
  Gamepad2,
  Layers,
  Lightbulb,
  Package,
  Save,
  Share2,
  Sliders,
  Sticker,
  X,
} from "lucide-react";
import { useLocale } from "./LocaleProvider";
import styles from "./StudioOnboardingTour.module.css";

export const START_STUDIO_TOUR_EVENT = "hypermockup-start-studio-tour";

export type StudioTourStepId =
  | "welcome"
  | "domains"
  | "library"
  | "rail"
  | "artwork"
  | "camera"
  | "projects"
  | "share"
  | "render";

interface TourStepDef {
  id: StudioTourStepId;
  target: string | null;
  padding?: number;
  icon: typeof Gamepad2;
  exclusive?: boolean;
  titleVi: string;
  titleEn: string;
  descVi: string;
  descEn: string;
  tipVi?: string;
  tipEn?: string;
  keycaps?: Array<{ keys: string[]; labelVi: string; labelEn: string }>;
}

const TOUR_STEPS: readonly TourStepDef[] = [
  {
    id: "welcome",
    target: null,
    icon: Gamepad2,
    titleVi: "Chào mừng đến Mockup Studio 3D!",
    titleEn: "Welcome to 3D Mockup Studio!",
    descVi:
      "Chỉ mất 30 giây làm quen qua 8 điểm thao tác chính để bạn tự tay tạo ảnh mockup 3D sắc nét, xuất khuôn bế 1:1 mm và tạo Link chia sẻ Project 3D xoay 360° gửi khách hàng.",
    descEn:
      "Take a quick 30-second interactive walkthrough of the 8 core tools so you can craft sharp 3D mockups, export 1:1 mm dielines, and publish interactive 360° 3D Project Share Links.",
  },
  {
    id: "domains",
    target: "domain-bar",
    padding: 8,
    icon: Package,
    titleVi: "Chuyển chế độ Chai/Lon & Hộp/Khay",
    titleEn: "Switch Between Bottles/Cans & Boxes/Trays",
    descVi:
      "Chuyển nhanh giữa khu vực Chai & Lon (thủy tinh, lon nhôm, nhựa PET/PP) và khu vực Hộp & Khay tham số (tùy chỉnh kích thước mm, gấp mở nắp 3D và xếp sản phẩm bên trong).",
    descEn:
      "Switch smoothly between Beverages (glass bottles, aluminum cans, PET/PP) and Parametric Boxes & Trays (custom mm dimensions, interactive folding, and product packing).",
    tipVi: "Bạn có thể thiết kế chai trước rồi đưa trực tiếp vào khay 6/12/24 sản phẩm trong mục Hộp & Khay.",
    tipEn: "Design a bottle first, then pack it directly into 6/12/24-count trays in Boxes & Trays mode.",
  },
  {
    id: "library",
    target: "library-panel",
    padding: 8,
    icon: Box,
    titleVi: "Thư viện mẫu 3D & Biến thể",
    titleEn: "3D Model Library & Variants",
    descVi:
      "Tìm kiếm hoặc lọc theo chất liệu để chọn kiểu dáng chai, lon hoặc hộp. Những mẫu có nhiều dung tích (250ml, 330ml, 500ml...) sẽ mở thêm bảng biến thể ngay bên cạnh.",
    descEn:
      "Search or filter by material to pick a bottle, can, or box template. Families with multiple sizes (250 ml, 330 ml, 500 ml...) open a variant picker right beside the panel.",
  },
  {
    id: "rail",
    target: "editor-rail",
    padding: 8,
    icon: Sliders,
    titleVi: "Thanh công cụ chỉnh từng thành phần",
    titleEn: "Component Tool Rail",
    descVi:
      "Mỗi nút bên trái điều khiển một phần riêng biệt: Nhãn/Artwork, Nước bên trong, Nắp/Vỏ lon, Thân chai và Cảnh & Ánh sáng (hoặc Kích thước, Thêm SP, Cấu trúc khi ở chế độ Hộp).",
    descEn:
      "Each left-rail button controls a dedicated aspect: Label/Artwork, Liquid, Cap/Top, Body, and Scene & Lighting (or Size, Add Product, Material, Structure in Box mode).",
  },
  {
    id: "artwork",
    target: "controls-panel",
    padding: 8,
    icon: Sticker,
    titleVi: "Tải Artwork & Tùy chỉnh chất liệu",
    titleEn: "Upload Artwork & Material Finish",
    descVi:
      "Tải lên file thiết kế (PNG, JPG, SVG, PDF), căn chỉnh vị trí/tỉ lệ và chọn hiệu ứng bề mặt (Mờ, Bóng, Ánh kim). Mẹo hay: bạn có thể bấm trực tiếp lên nhãn hoặc mặt hộp trên khung 3D để thay ảnh ngay!",
    descEn:
      "Upload PNG, JPG, SVG, or PDF artwork, fine-tune alignment/scale, and adjust surface finish (Matte, Gloss, Metallic). Pro tip: click directly on the 3D label or box face to swap artwork instantly!",
    tipVi: "Dùng PNG nền trong suốt nếu muốn nhìn xuyên qua chất liệu thủy tinh hoặc vỏ lon kim loại.",
    tipEn: "Use transparent PNGs to let realistic glass or metallic aluminum show through.",
  },
  {
    id: "camera",
    target: "camera-controls",
    padding: 8,
    icon: Camera,
    titleVi: "Góc nhìn 3D, Camera & Phím WASD",
    titleEn: "3D Camera, Views & WASD Panning",
    descVi:
      "Kéo chuột trên sân khấu 3D để xoay tự do, cuộn để phóng to/nhỏ, hoặc chọn nhanh các góc máy dựng sẵn ở đây. Thanh bên phải sân khấu còn có chuyển nền Trắng / Hồng / Dark và chất lượng đồ họa.",
    descEn:
      "Drag on the 3D stage to orbit, scroll to zoom, or pick preset angles here. Use the right vertical rail to switch White / Pink / Dark backdrops and graphics quality.",
    keycaps: [
      { keys: ["W", "A", "S", "D"], labelVi: "Di chuyển góc nhìn mượt", labelEn: "Smooth camera pan" },
    ],
  },
  {
    id: "projects",
    target: "project-actions",
    padding: 8,
    icon: Save,
    titleVi: "Lưu Dự án & Gom bộ nhiều sản phẩm",
    titleEn: "Save Projects & Group Multiple SKUs",
    descVi:
      "Bấm Lưu dự án để lưu toàn bộ thiết kế hiện tại (chất liệu, artwork, kích thước hộp) lên Cloud hoặc trình duyệt. Bạn có thể lưu nhiều chai, lon và thùng/khay vào chung một bộ dự án để quản lý và chia sẻ cùng lúc.",
    descEn:
      "Click Save Project to store your mockup (materials, artwork, box specs) to Cloud or local storage. Group multiple bottles, cans, and boxes into one collection for unified client review.",
  },
  {
    id: "share",
    target: "my-projects-btn",
    padding: 8,
    icon: Share2,
    exclusive: true,
    titleVi: "Chia sẻ Link Project 3D tương tác",
    titleEn: "Interactive 3D Project Share Link",
    descVi:
      "Mở 'Dự án của tôi' → chọn bộ sản phẩm → bấm 'Chia sẻ 3D' để xuất đường link xem trực tiếp trên trình duyệt! Khách hàng có thể xoay 360°, chuyển đổi giữa các sản phẩm trong bộ, kéo mở/đóng nắp hộp và xem kích thước mm mà không cần đăng nhập hay cài app.",
    descEn:
      "Open 'My Projects' → pick a collection → click 'Share 3D' to publish a live interactive browser link! Clients can orbit 360°, switch between SKUs, slide open 3D boxes, and inspect mm dimensions with zero login or installs.",
    tipVi: "Hỗ trợ chọn thời hạn (1 / 7 / 14 / tối đa 30 ngày), đặt mật khẩu truy cập, theo dõi lượt xem và cập nhật thiết kế lên link cũ hoàn toàn miễn phí (0 coin)!",
    tipEn: "Choose expiry (1 / 7 / 14 / max 30 days), add a passcode, track views, and sync future design updates to the same link for free (0 coins)!",
  },
  {
    id: "render",
    target: "render-panel",
    padding: 8,
    icon: Download,
    titleVi: "Xuất ảnh 1K–8K & Dieline 1:1 mm",
    titleEn: "Export 1K–8K Renders & 1:1 mm Dielines",
    descVi:
      "Chọn tỉ lệ khung hình (1:1, 4:5, 16:9, 9:16), độ phân giải tới 8K, bật Nền trong suốt (PNG) rồi bấm Render ảnh. Ở chế độ Hộp, bảng tải Dieline chuẩn 1:1 mm (PDF/SVG/DXF) nằm ngay bên dưới.",
    descEn:
      "Pick an aspect ratio (1:1, 4:5, 16:9, 9:16), resolution up to 8K, toggle Transparent PNG, and hit Render. In Box mode, 1:1 mm vector Dieline exports (PDF/SVG/DXF) appear right underneath.",
    tipVi: "Cần xem lại hướng dẫn chi tiết có ảnh minh họa? Bấm nút tròn (?) trên thanh Header bất cứ lúc nào!",
    tipEn: "Need the full illustrated guide anytime? Click the circular (?) button in the top Header!",
  },
];

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface StudioOnboardingTourProps {
  open: boolean;
  onStepChange?: (stepId: StudioTourStepId) => void;
  onFinish: (status: "completed" | "skipped") => void;
}

export default function StudioOnboardingTour({
  open,
  onStepChange,
  onFinish,
}: StudioOnboardingTourProps) {
  const { locale } = useLocale();
  const isVi = locale === "vi";
  const maskId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<RectBox | null>(null);
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });

  const step = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];

  const measureTarget = useCallback(() => {
    if (typeof window === "undefined") return;
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    if (!step.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) {
      setTargetRect(null);
      return;
    }
    const pad = step.padding ?? 8;
    const left = Math.max(6, rect.left - pad);
    const top = Math.max(6, rect.top - pad);
    const right = Math.min(window.innerWidth - 6, rect.right + pad);
    const bottom = Math.min(window.innerHeight - 6, rect.bottom + pad);
    setTargetRect({
      top,
      left,
      width: Math.max(24, right - left),
      height: Math.max(24, bottom - top),
    });
  }, [step.padding, step.target]);

  useEffect(() => {
    if (!open) return;
    onStepChange?.(step.id);
    const r1 = requestAnimationFrame(measureTarget);
    const t1 = window.setTimeout(measureTarget, 90);
    const t2 = window.setTimeout(measureTarget, 320);

    const onViewportChange = () => measureTarget();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      cancelAnimationFrame(r1);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, step.id, onStepChange, measureTarget]);

  const handleNext = useCallback(() => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      onFinish("completed");
      setStepIndex(0);
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, onFinish]);

  const handlePrev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleSkip = useCallback(() => {
    onFinish("skipped");
    setStepIndex(0);
  }, [onFinish]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleSkip();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        handleNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        handlePrev();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, handleNext, handlePrev, handleSkip]);

  const cardStyle = useMemo<CSSProperties>(() => {
    if (!targetRect) return {};
    const cardW = Math.min(376, viewport.w - 24);
    const estH = 268;
    const gap = 16;
    const margin = 14;

    const spaceRight = viewport.w - (targetRect.left + targetRect.width);
    const spaceLeft = targetRect.left;
    const spaceBottom = viewport.h - (targetRect.top + targetRect.height);
    const spaceTop = targetRect.top;

    let left = margin;
    let top = margin;

    if (spaceRight >= cardW + gap + margin) {
      left = targetRect.left + targetRect.width + gap;
      top = Math.max(margin, Math.min(viewport.h - estH - margin, targetRect.top + targetRect.height * 0.5 - estH * 0.45));
    } else if (spaceLeft >= cardW + gap + margin) {
      left = targetRect.left - cardW - gap;
      top = Math.max(margin, Math.min(viewport.h - estH - margin, targetRect.top + targetRect.height * 0.5 - estH * 0.45));
    } else if (spaceBottom >= estH + gap + margin) {
      left = Math.max(margin, Math.min(viewport.w - cardW - margin, targetRect.left + targetRect.width * 0.5 - cardW * 0.5));
      top = targetRect.top + targetRect.height + gap;
    } else if (spaceTop >= estH + gap + margin) {
      left = Math.max(margin, Math.min(viewport.w - cardW - margin, targetRect.left + targetRect.width * 0.5 - cardW * 0.5));
      top = Math.max(margin, targetRect.top - estH - gap);
    } else {
      left = Math.max(margin, (viewport.w - cardW) * 0.5);
      top = Math.max(margin, Math.min(viewport.h - estH - margin, viewport.h * 0.5 - estH * 0.5));
    }

    return { left: Math.round(left), top: Math.round(top) };
  }, [targetRect, viewport.h, viewport.w]);

  if (!open || typeof document === "undefined") return null;

  const Icon = step.icon;
  const progressPct = ((stepIndex + 1) / TOUR_STEPS.length) * 100;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const isCentered = !targetRect;

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={isVi ? "Hướng dẫn sử dụng Mockup Studio" : "Mockup Studio interactive tutorial"}
    >
      <svg className={styles.maskSvg} aria-hidden="true">
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="16"
                ry="16"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(16, 10, 20, 0.72)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {targetRect && (
        <div
          className={styles.spotlightRing}
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
          aria-hidden="true"
        />
      )}

      <div
        key={step.id}
        className={`${styles.card} ${isCentered ? styles.cardWelcome : ""}`}
        style={isCentered ? undefined : cardStyle}
      >
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>

        <div className={styles.cardHeader}>
          <div className={styles.stepBadgeRow}>
            <span className={styles.stepBadge}>
              <span>
                {isFirst
                  ? isVi
                    ? "Khởi động Studio"
                    : "Studio Quest"
                  : isVi
                    ? `Bước ${stepIndex} / ${TOUR_STEPS.length - 1}`
                    : `Step ${stepIndex} / ${TOUR_STEPS.length - 1}`}
              </span>
            </span>
            {step.exclusive && (
              <span className={styles.exclusiveBadge}>
                ★ {isVi ? "Độc quyền" : "Exclusive"}
              </span>
            )}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label={isVi ? "Đóng hướng dẫn" : "Close tutorial"}
            onClick={handleSkip}
          >
            <X size={15} />
          </button>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.titleRow}>
            <span className={styles.iconBadge} aria-hidden="true">
              <Icon size={19} />
            </span>
            <h3>{isVi ? step.titleVi : step.titleEn}</h3>
          </div>

          <p className={styles.description}>{isVi ? step.descVi : step.descEn}</p>

          {isFirst && (
            <div className={styles.welcomeHighlights}>
              <div className={styles.welcomeChip}>
                <Box size={18} aria-hidden="true" />
                <span>{isVi ? "Chọn mẫu 3D" : "Pick 3D Model"}</span>
              </div>
              <div className={styles.welcomeChip}>
                <Layers size={18} aria-hidden="true" />
                <span>{isVi ? "Gắn Artwork" : "Apply Artwork"}</span>
              </div>
              <div className={styles.welcomeChip}>
                <Download size={18} aria-hidden="true" />
                <span>{isVi ? "Xuất 8K & 3D" : "8K & 3D Share"}</span>
              </div>
            </div>
          )}

          {step.keycaps && step.keycaps.length > 0 && (
            <div className={styles.keysRow}>
              {step.keycaps.map((group) => (
                <div key={group.keys.join("")} className={styles.keysRow}>
                  {group.keys.map((k) => (
                    <kbd key={k} className={styles.keycap}>
                      {k}
                    </kbd>
                  ))}
                  <span className={styles.keyLabel}>{isVi ? group.labelVi : group.labelEn}</span>
                </div>
              ))}
            </div>
          )}

          {(isVi ? step.tipVi : step.tipEn) && (
            <div className={styles.tipBox}>
              <Lightbulb size={15} aria-hidden="true" />
              <span>{isVi ? step.tipVi : step.tipEn}</span>
            </div>
          )}
        </div>

        <div className={styles.cardFooter}>
          <div className={styles.dots} aria-hidden="true">
            {TOUR_STEPS.map((s, idx) => (
              <span
                key={s.id}
                className={`${styles.dot} ${idx === stepIndex ? styles.dotActive : idx < stepIndex ? styles.dotDone : ""}`}
              />
            ))}
          </div>

          <div className={styles.footerActions}>
            {!isLast && (
              <button type="button" className={styles.skipBtn} onClick={handleSkip}>
                {isVi ? "Bỏ qua" : "Skip"}
              </button>
            )}
            {stepIndex > 0 && (
              <button type="button" className={styles.prevBtn} onClick={handlePrev}>
                <ArrowLeft size={14} aria-hidden="true" />
                <span>{isVi ? "Trước" : "Back"}</span>
              </button>
            )}
            <button type="button" className={styles.nextBtn} onClick={handleNext}>
              <span>
                {isFirst || isLast
                  ? isVi
                    ? "Bắt đầu"
                    : "Start"
                  : isVi
                    ? "Tiếp"
                    : "Next"}
              </span>
              {isLast ? <CheckCircle2 size={15} aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
