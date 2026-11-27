"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Download,
  Gamepad2,
  HelpCircle,
  Home,
  Lightbulb,
  Maximize2,
  Package,
  Palette,
  Share2,
  Sticker,
  X,
} from "lucide-react";
import { useLocale } from "./LocaleProvider";
import { START_STUDIO_TOUR_EVENT } from "./StudioOnboardingTour";
import styles from "./UserGuideModal.module.css";

export type GuideChapterId = "overview" | "models" | "artwork" | "scene" | "packaging" | "export" | "share";

type OpenGuideFn = (chapter?: GuideChapterId) => void;

const GuideContext = createContext<OpenGuideFn | null>(null);

export function useGuideDialog(): OpenGuideFn {
  const openGuide = useContext(GuideContext);
  if (!openGuide) throw new Error("useGuideDialog requires GuideDialogProvider.");
  return openGuide;
}

interface GuideFeatureItem {
  titleVi: string;
  titleEn: string;
  descVi: string;
  descEn: string;
}

interface GuideChapter {
  id: GuideChapterId;
  icon: typeof Home;
  exclusive?: boolean;
  navVi: string;
  navEn: string;
  subVi: string;
  subEn: string;
  titleVi: string;
  titleEn: string;
  introVi: string;
  introEn: string;
  image: string;
  captionVi: string;
  captionEn: string;
  items: GuideFeatureItem[];
  tipVi: string;
  tipEn: string;
}

const GUIDE_CHAPTERS: readonly GuideChapter[] = [
  {
    id: "overview",
    icon: Home,
    navVi: "Tổng quan & Tài khoản",
    navEn: "Overview & Account",
    subVi: "Trang chủ, Coin, Điểm danh",
    subEn: "Home, Coins, Check-in",
    titleVi: "Tổng quan Trang chủ, Ví Coin & Tài khoản",
    titleEn: "Home Dashboard, Coin Wallet & Account",
    introVi:
      "Trang chủ tập hợp nhanh toàn bộ công cụ tài khoản: xem thử mockup 3D trực tiếp, điểm danh nhận coin miễn phí, quản lý ví và gửi góp ý trực tiếp cho đội ngũ HyperMockup.",
    introEn:
      "The Home dashboard gathers everything in one place: live 3D mockup preview, daily coin check-in, wallet statements, Admin notifications, and direct feedback.",
    image: "/guide/home-dashboard.webp",
    captionVi: "Giao diện Trang chủ: Mockup 3D tương tác bên trái, Gói nạp & Cập nhật ở giữa, Hồ sơ & Điểm danh bên phải.",
    captionEn: "Home dashboard: interactive 3D hero on the left, Coin packages & Updates in the center, Profile & Daily Check-in on the right.",
    items: [
      {
        titleVi: "Thử nhanh 3D ngay tại Trang chủ",
        titleEn: "Instant 3D Hero Preview",
        descVi: "Kéo xoay mô hình 360°, chuyển nhanh Thủy tinh / Lon 330 / PET 500 / Hộp 3D hoặc kéo thả ảnh nhãn trực tiếp vào khung xem.",
        descEn: "Drag to orbit 360°, switch between Glass / Can 330 / PET 500 / 3D Box, or drop a label image directly onto the hero bottle.",
      },
      {
        titleVi: "Điểm danh 7 ngày nhận Coin miễn phí",
        titleEn: "7-Day Daily Check-in Rewards",
        descVi: "Đăng nhập và bấm ô 'Hôm nay' mỗi ngày để tích coin miễn phí. Duy trì chuỗi liên tiếp tới Ngày 4 (+20) và Ngày 7 (+30).",
        descEn: "Sign in and tap 'Today' daily to earn free coins. Keep your consecutive streak going for Day 4 (+20) and Day 7 (+30) bonuses.",
      },
      {
        titleVi: "Hồ sơ & Tải sao kê Coin (CSV)",
        titleEn: "Profile & Coin Statement (CSV)",
        descVi: "Theo dõi số ngày điểm danh, số dư coin, huy hiệu tài khoản và lịch sử dùng coin gần nhất. Bấm 'Tải sao kê' để xuất file CSV.",
        descEn: "Check your login days, coin balance, badge, and recent transactions. Click 'Statement' anytime to export your full CSV history.",
      },
      {
        titleVi: "Chuông thông báo Admin & Thư góp ý",
        titleEn: "Admin Notifications Bell & Feedback",
        descVi: "Gửi góp ý / báo lỗi / đề xuất mẫu 3D mới ngay tại trang chủ (tối đa 10 thư/ngày). Khi Admin phản hồi hoặc gửi thông báo riêng, biểu tượng Chuông trên Header sẽ báo đỏ.",
        descEn: "Send suggestions, bug reports, or 3D model requests right from Home (up to 10/day). Admin replies and direct notices appear in the Header Bell icon.",
      },
    ],
    tipVi: "Tài khoản mới đăng ký được tặng sẵn Coin chào mừng để trải nghiệm Render ảnh chất lượng cao và xuất Dieline 1:1 mm ngay lập tức.",
    tipEn: "Newly registered accounts receive welcome coins right away to try high-res renders and 1:1 mm Dieline exports immediately.",
  },
  {
    id: "models",
    icon: Box,
    navVi: "Chai, Lon & Thư viện 3D",
    navEn: "Bottles, Cans & Models",
    subVi: "22+ mẫu PBR, Nước, Nắp",
    subEn: "22+ PBR models, Materials",
    titleVi: "Chọn mẫu 3D & Tùy chỉnh chất liệu Chai / Lon",
    titleEn: "3D Model Library & Beverage Material Controls",
    introVi:
      "Mockup Studio cung cấp hơn 22 dòng sản phẩm dựng chuẩn PBR (Thủy tinh khúc xạ thực, Lon nhôm in màng, Nhựa PET & PP) với đầy đủ tùy chỉnh từng bộ phận.",
    introEn:
      "Mockup Studio includes 22+ physically accurate PBR product lines (refractive Glass, Sleeve-Print Aluminum Cans, PET & PP) with per-part material editing.",
    image: "/guide/studio-models.webp",
    captionVi: "Chế độ Chai & Lon với Thư viện mẫu 3D (22 dòng), thanh công cụ bên trái và bảng Xuất ảnh Render bên phải.",
    captionEn: "Beverages mode with the 22-family 3D Model Library on the left, component rail, and live Render preview on the right.",
    items: [
      {
        titleVi: "Tìm kiếm, lọc chất liệu & biến thể",
        titleEn: "Search, Filter & Size Variants",
        descVi: "Lọc nhanh theo Thủy tinh, Lon nhôm, Nhựa PET, Nhựa PP. Các dòng có nhiều dung tích (180ml, 250ml, 330ml, 500ml...) sẽ hiển thị bảng chọn biến thể ngay cạnh thư viện.",
        descEn: "Filter by Glass, Aluminum Can, PET, or PP. Families with multiple volumes open a quick variant picker right beside the library.",
      },
      {
        titleVi: "Nước bên trong (Chai trong suốt)",
        titleEn: "Realistic Liquid Optics",
        descVi: "Tùy chỉnh màu nước, độ trong suốt, độ đục, độ sáng và chỉ số khúc xạ ánh sáng thực tế cho chai thủy tinh và chai PET.",
        descEn: "Fine-tune liquid color, clarity, turbidity, brightness, and optical refraction for glass and PET bottles.",
      },
      {
        titleVi: "Nắp / Đỉnh lon & Thân sản phẩm",
        titleEn: "Cap / Can Top & Body Finish",
        descVi: "Đổi màu nắp nhôm, nắp nhựa, vỏ lon hoặc thân chai; điều chỉnh độ ánh kim (Metallic) và độ nhám (Roughness) cho đúng chất liệu thực tế.",
        descEn: "Customize cap, can top, or bottle body colors along with PBR Metallic and Roughness sliders to match real manufacturing finishes.",
      },
      {
        titleVi: "Chuyển chế độ Chai/Lon ↔ Hộp/Khay",
        titleEn: "Switch Beverages ↔ Boxes & Trays",
        descVi: "Thanh chọn phía trên sân khấu giúp chuyển tức thì giữa thiết kế sản phẩm đơn lẻ (Chai & Lon) và thiết kế bao bì thùng/khay (Hộp & Khay).",
        descEn: "Use the top-center pill to jump instantly between single-SKU bottles/cans and parametric packaging boxes & trays.",
      },
    ],
    tipVi: "Khi chuyển qua lại giữa các mẫu chai/lon, Studio tự động ghi nhớ màu nắp/nước của từng mẫu để bạn so sánh phương án nhanh chóng.",
    tipEn: "Studio remembers per-model material tweaks as you switch between bottles and cans, making A/B comparisons effortless.",
  },
  {
    id: "artwork",
    icon: Sticker,
    navVi: "Gắn Artwork & Nhãn 3D",
    navEn: "Artwork & Labels",
    subVi: "Tải file, Căn chỉnh, Click 3D",
    subEn: "Upload, Align, Click 3D",
    titleVi: "Tải Artwork, Căn chỉnh nhãn & Hiệu ứng in",
    titleEn: "Upload Artwork, Label Alignment & Print Finishes",
    introVi:
      "Đưa thiết kế 2D (PNG, JPG, WebP, SVG) bọc chuẩn xác lên thân chai, lon hoặc từng mặt hộp trong vài giây với phản chiếu ánh sáng PBR chân thực.",
    introEn:
      "Wrap 2D designs (PNG, JPG, WebP, SVG) accurately onto bottles, cans, or individual box panels in seconds with real-time PBR lighting.",
    image: "/guide/studio-artwork.webp",
    captionVi: "Bảng Nhãn: Tải ảnh thiết kế, xoay góc nhãn quanh thân chai và chỉnh hiệu ứng Ánh kim / Độ nhám bề mặt nhãn.",
    captionEn: "Label panel: upload artwork, rotate wrap position around the bottle, and tune Metallic & Roughness finish.",
    items: [
      {
        titleVi: "Bấm trực tiếp lên mô hình 3D để thay ảnh",
        titleEn: "Direct Click-to-Replace on 3D",
        descVi: "Rê chuột lên nhãn chai hoặc bất kỳ mặt hộp nào (Mặt ngoài / Mặt trong) sẽ thấy nhãn gợi ý — bấm vào là mở ngay hộp tải/đổi Artwork cho đúng vị trí đó!",
        descEn: "Hover any bottle label or box face (outside/inside) to see its label & dimensions, then click directly to upload or swap artwork for that exact surface.",
      },
      {
        titleVi: "Xoay vị trí & Căn chỉnh trong trình sửa 2D",
        titleEn: "Wrap Offset & 2D Crop Editor",
        descVi: "Kéo thanh 'Xoay vị trí nhãn' để đưa mặt chính logo về đúng hướng camera; dùng trình chỉnh sửa để phóng to, dịch chuyển hoặc xoay artwork.",
        descEn: "Slide the Label Offset control to orient your front logo toward the camera, or open the 2D editor to scale, pan, and rotate artwork.",
      },
      {
        titleVi: "Hiệu ứng Chất liệu nhãn in (PBR)",
        titleEn: "Print Material Finish (PBR)",
        descVi: "Tăng 'Ánh kim' cho hiệu ứng ép kim / nhãn decal bạc; giảm 'Độ nhám' cho cán màng bóng hoặc tăng lên cho giấy mỹ thuật mờ.",
        descEn: "Increase Metallic for foil/silver decal sheen; lower Roughness for glossy laminate or raise it for uncoated matte paper.",
      },
      {
        titleVi: "Thư viện Artwork lưu sẵn trên máy",
        titleEn: "Reusable Local Artwork Library",
        descVi: "Ảnh đã tải lên được lưu sẵn trong thư viện phiên làm việc để tái sử dụng nhanh cho nhiều dung tích chai hoặc nhiều mặt hộp mà không cần upload lại.",
        descEn: "Uploaded artworks stay cached in your session library so you can reuse them across sizes and box faces without re-uploading.",
      },
    ],
    tipVi: "Dùng file PNG nền trong suốt (transparent) nếu muốn tạo hiệu ứng in trực tiếp lên thủy tinh trong hoặc thân lon kim loại ánh bạc.",
    tipEn: "Upload transparent PNGs to achieve direct screen-print effects on clear glass or brushed aluminum cans.",
  },
  {
    id: "scene",
    icon: Palette,
    navVi: "Cảnh, Ánh sáng & WASD",
    navEn: "Scene, Lighting & WASD",
    subVi: "Nền Dark, HDRI, Spotlight",
    subEn: "Dark theme, HDRI, Spotlight",
    titleVi: "Màu nền, Ánh sáng HDRI, Spotlight & Điều khiển 3D",
    titleEn: "Backdrops, HDRI Lighting, Spotlight & Camera Controls",
    introVi:
      "Làm chủ không gian trình diễn 3D với 3 giao diện nền (Trắng, Hồng, Dark), 6 môi trường ánh sáng HDRI, đèn chiếu điểm tùy chỉnh và thao tác camera mượt mà bằng chuột + phím WASD.",
    introEn:
      "Control the entire 3D stage with 3 studio themes (White, Pink, Dark), 6 HDRI lighting setups, customizable Spotlight, and smooth mouse + WASD camera movement.",
    image: "/guide/studio-scene.webp",
    captionVi: "Chế độ nền Dark đơn sắc kết hợp bảng Cảnh: 6 môi trường Ánh sáng HDRI, Đèn chiếu điểm Spotlight và Chuyển động.",
    captionEn: "Dark monochrome Studio theme with Scene panel: 6 HDRI lighting presets, customizable Spotlight, and motion controls.",
    items: [
      {
        titleVi: "3 Giao diện nền: Trắng · Hồng · Dark",
        titleEn: "3 Backdrop Themes: White · Pink · Dark",
        descVi: "Đổi nhanh giữa nền Trắng tinh gọn, Hồng thương hiệu hoặc Dark đen-xám chuyên nghiệp (cả lưới nền & UI tự đồng bộ theo tone Dark).",
        descEn: "Switch effortlessly between clean White, brand Pink, or monochrome Dark studio (grid and UI panels automatically adapt).",
      },
      {
        titleVi: "6 Môi trường HDRI & Đèn chiếu điểm (Spotlight)",
        titleEn: "6 HDRI Presets & Studio Spotlight",
        descVi: "Thử các bộ phản chiếu Studio gốc, Studio sáng, Softbox nổi, Cửa sổ sáng, Thiên nhiên... Bật Spotlight để chỉnh cường độ, góc chiếu, độ cao và màu đèn.",
        descEn: "Pick from 6 HDRI reflection rigs and enable Studio Spotlight to dial in intensity, azimuth angle, height, and light color.",
      },
      {
        titleVi: "Di chuyển góc nhìn mượt với phím W A S D",
        titleEn: "Smooth W A S D Camera Panning",
        descVi: "Kéo chuột trái để xoay 360°, cuộn chuột để zoom. Giữ các phím W / A / S / D để dịch chuyển vị trí sản phẩm trong khung hình mượt mà theo góc nhìn hiện tại.",
        descEn: "Drag to orbit 360°, scroll to zoom, and hold W / A / S / D to pan the product smoothly across the frame relative to your camera angle.",
      },
      {
        titleVi: "Thanh hiển thị bên phải (S1 / S2 / Đồ họa)",
        titleEn: "Viewport Display Rail (S1 / S2 / Quality)",
        descVi: "Chuyển nhanh Scene 1 (có nền & lưới) sang Scene 2 (Studio trắng tinh khiết), nút Toàn màn hình và chọn mức Đồ họa (Auto / Low / Med / High / Ultra) phù hợp máy.",
        descEn: "Toggle Scene 1 (styled backdrop) vs Scene 2 (pure white studio), go Fullscreen, or pick 3D Graphics Quality (Auto to Ultra).",
      },
    ],
    tipVi: "Nếu máy yếu hoặc dùng laptop pin, chuyển chất lượng đồ họa sang MED hoặc LOW để xoay 3D siêu mượt — ảnh Render xuất ra vẫn sắc nét tối đa.",
    tipEn: "On low-power laptops, switch preview quality to MED or LOW for buttery orbiting — final exported renders remain crystal sharp.",
  },
  {
    id: "packaging",
    icon: Package,
    navVi: "Hộp, Khay & Thêm SP",
    navEn: "Boxes, Trays & Pack",
    subVi: "Kích thước mm, Xếp 6/12/24 SP",
    subEn: "mm Sizing, Pack 6/12/24 items",
    titleVi: "Thiết kế Hộp & Khay tham số, Gấp 3D & Xếp sản phẩm",
    titleEn: "Parametric Boxes & Trays, 3D Folding & Product Packing",
    introVi:
      "Tạo thùng carton, hộp nắp gài, khay trưng bày đúng chuẩn FEFCO theo từng milimet, gập mở nắp 3D trực quan và tự động xếp chai/lon vào trong khay.",
    introEn:
      "Build FEFCO-standard cartons, tuck boxes, and display trays to exact millimeter specs, animate 3D folding, and auto-pack bottles or cans inside.",
    image: "/guide/studio-packaging.webp",
    captionVi: "Chế độ Hộp & Khay với tính năng Thêm SP: 6 chai thủy tinh xếp tự động vừa khít bên trong khay trưng bày FEFCO 0421.",
    captionEn: "Boxes & Trays mode with Add Product enabled: 6 glass bottles auto-fitted inside a FEFCO 0421 Display Tray.",
    items: [
      {
        titleVi: "Tùy chỉnh kích thước (mm) & Độ dày sóng giấy",
        titleEn: "Exact Millimeter Sizing & Board Thickness",
        descVi: "Nhập chính xác Dài × Rộng × Cao (lọt lòng hoặc phủ bì), chọn loại giấy (Kraft nâu, Trắng, Sóng E/B) và tùy chỉnh màu mặt ngoài / mặt trong riêng biệt.",
        descEn: "Enter exact inner or outer L × W × H in mm, pick board material (Kraft, White, E/B-flute), and tint outside/inside surfaces independently.",
      },
      {
        titleVi: "Thêm sản phẩm (Thêm SP) & Tự căn hộp",
        titleEn: "Add Product & Auto-Fit Box",
        descVi: "Chọn sản phẩm từ Thư viện hoặc Dự án đã lưu, chọn lốc 4 / 6 / 8 / 12 / 24 (hoặc số Cột × Hàng tùy ý). Bật 'Tự chỉnh cỡ hộp' để kích thước hộp tự ôm khít sản phẩm!",
        descEn: "Pick any catalog item or saved project, choose 4 / 6 / 8 / 12 / 24-pack grids, and auto-fit box inner dimensions with one click.",
      },
      {
        titleVi: "Mô phỏng Đóng / Mở nắp 3D & Vách ngăn",
        titleEn: "Interactive 3D Fold Slider & Dividers",
        descVi: "Kéo thanh Đóng hộp dưới đáy màn hình (0% trải phẳng ↔ 100% đóng kín) hoặc bấm nút Play để xem chuyển động gập hộp; bật vách tổ ong trong mục Cấu trúc.",
        descEn: "Drag the bottom fold slider from 0% flat sheet to 100% closed box, hit Play for folding animation, and add honeycomb dividers in Structure.",
      },
      {
        titleVi: "Gắn Artwork từng mặt hoặc trải khuôn Dieline",
        titleEn: "Per-Face or Full-Dieline Artwork",
        descVi: "Vào mục Artwork hoặc bấm trực tiếp vào từng mặt trên hộp 3D / bản vẽ 2D để chèn hình, tô màu nền riêng hoặc dán trọn bộ file trải khuôn.",
        descEn: "Open the Artwork tab or click any panel directly in 3D or 2D view to apply images, face tints, or a complete flat dieline layout.",
      },
    ],
    tipVi: "Bạn có thể đổi nhãn cho toàn bộ 6/12/24 sản phẩm trong khay chỉ với 1 lần nhấn nút 'Đổi nhãn (cả N SP)' hoặc chọn từ sản phẩm đã thiết kế ở Dự án của tôi.",
    tipEn: "Swap the label across all packed bottles/cans in one click via 'Change label (all items)' or load a saved beverage design from My Projects.",
  },
  {
    id: "export",
    icon: Download,
    navVi: "Xuất ảnh 8K & Dieline",
    navEn: "8K Render & Dieline",
    subVi: "PNG 1K–8K, SVG/PDF/DXF",
    subEn: "1K–8K PNG, SVG/PDF/DXF",
    titleVi: "Xuất ảnh Render 1K–8K & Khuôn bế Dieline 1:1 mm",
    titleEn: "1K–8K High-Res Renders & 1:1 mm Vector Dielines",
    introVi:
      "Xuất hình ảnh sản phẩm siêu sắc nét tới 8K (hỗ trợ tách nền PNG trong suốt) và tải file khuôn bế kỹ thuật chuẩn 1:1 mm để gửi thẳng xưởng in hoặc chỉnh sửa trong Illustrator / AutoCAD.",
    introEn:
      "Render crisp studio imagery up to 8K (including transparent PNGs) and export production-ready 1:1 mm vector dielines directly for print houses, Illustrator, or AutoCAD.",
    image: "/guide/studio-export.webp",
    captionVi: "Chế độ Chia đôi 2D + 3D: Khuôn bế Dieline (đường Cắt / Cấn gập / Tràn lề) bên trái, mô hình 3D ở giữa và bảng Xuất ảnh + Dieline bên phải.",
    captionEn: "2D + 3D Split view: parametric CAD Dieline (Cut/Crease/Bleed) on the left, live 3D box in the center, and Render + Vector Dieline export on the right.",
    items: [
      {
        titleVi: "Xuất ảnh PNG chất lượng 1024px – 8129px",
        titleEn: "High-Res PNG Renders (1K – 8K)",
        descVi: "Chọn tỉ lệ 1:1 Vuông, 4:5 Dọc, 16:9 Ngang hoặc 9:16 Story cùng 4 mức độ phân giải từ 1024 px tới 8129 px sắc nét chuẩn in ấn.",
        descEn: "Pick 1:1, 4:5, 16:9, or 9:16 aspect ratios across four resolution tiers from 1024 px up to print-grade 8129 px.",
      },
      {
        titleVi: "Tách nền trong suốt (Transparent PNG)",
        titleEn: "Transparent Background PNG",
        descVi: "Bật công tắc 'Tách nền trong suốt' trong bảng Xuất ảnh Render để tải về file PNG không nền — ghép trực tiếp lên banner, poster hay sàn TMĐT.",
        descEn: "Enable 'Transparent Background' in the Render panel to export clean alpha-channel PNGs ready for banners, posters, and e-commerce listings.",
      },
      {
        titleVi: "Tải khuôn bế Dieline 1:1 mm (SVG / PDF / DXF)",
        titleEn: "1:1 mm Vector Dielines (SVG / PDF / DXF)",
        descVi: "Chuyển chế độ Chia đôi (2D + 3D) hoặc 2D ở thanh đáy để kiểm tra đường cắt (đỏ), cấn gập (xanh lá) và tràn lề, rồi tải file chuẩn kích thước mm.",
        descEn: "Switch to Split or 2D mode in the bottom dock to verify Cut, Crease, and Bleed lines before downloading exact 1:1 mm SVG, PDF, or DXF files.",
      },
      {
        titleVi: "Lưu Dự án lên Cloud & Quản lý nhiều SKU",
        titleEn: "Cloud Projects & Multi-SKU Collections",
        descVi: "Bấm 'Lưu dự án' ở góc trên phải sân khấu để gom nhiều mẫu chai, lon và hộp vào cùng một bộ dự án — sẵn sàng mở lại hoặc chia sẻ link 3D ở phần tiếp theo.",
        descEn: "Click 'Save Project' at the top-right of the stage to save multiple bottles, cans, and boxes into one collection — ready to publish via 3D Share Link next.",
      },
    ],
    tipVi: "Khung xem trước (Preview) ở góc trên bên phải luôn phản ánh đúng bố cục cắt cúp theo tỉ lệ khung hình bạn chọn trước khi bấm Render.",
    tipEn: "The live preview window at top-right shows the exact framing for your chosen aspect ratio before you commit coins to render.",
  },
  {
    id: "share",
    icon: Share2,
    exclusive: true,
    navVi: "Chia sẻ Link Project 3D",
    navEn: "3D Project Share Link",
    subVi: "Độc quyền · Xoay 360° online",
    subEn: "Exclusive · Live 360° review",
    titleVi: "Chia sẻ Link Project 3D tương tác (Tính năng độc quyền)",
    titleEn: "Interactive 3D Project Share Link (Exclusive Feature)",
    introVi:
      "Thay vì gửi hàng chục ảnh chụp tĩnh rời rạc, hãy gửi cho khách hàng một đường link 3D sống động — xoay 360°, chuyển đổi toàn bộ chai/lon/thùng trong cùng một bộ sưu tập và kéo mở nắp hộp ngay trên trình duyệt!",
    introEn:
      "Instead of sending dozens of static renders, share one live 3D link where clients can orbit 360°, switch across every bottle/can/box in a collection, and fold open packaging right in their browser!",
    image: "/guide/studio-share.webp",
    captionVi: "Hộp thoại Dự án của tôi: gom nhiều sản phẩm (chai 290ml + khay 6 chai) vào chung một bộ dự án và bấm 'Chia sẻ 3D' để tạo link gửi khách.",
    captionEn: "My Projects modal: group multiple SKUs (290 mL bottle + 6-pack tray) in one collection and click 'Share 3D' to publish an interactive client link.",
    items: [
      {
        titleVi: "Bước 1 — Gom trọn bộ sản phẩm vào 1 Dự án",
        titleEn: "Step 1 — Group Full Product Lines in 1 Project",
        descVi: "Khi thiết kế xong từng mẫu (chai thủy tinh, lon nhôm, hộp/khay...), bấm 'Lưu dự án' và chọn lưu vào cùng một tên dự án. Một link chia sẻ hỗ trợ tối đa 15 sản phẩm 3D.",
        descEn: "As you finish each mockup (bottles, cans, trays, cartons), click 'Save Project' into the same project group. One link supports up to 15 interactive 3D items.",
      },
      {
        titleVi: "Bước 2 — Mở 'Dự án của tôi' & bấm 'Chia sẻ 3D'",
        titleEn: "Step 2 — Open 'My Projects' & Click 'Share 3D'",
        descVi: "Bấm 'Dự án của tôi' trên thanh Header, chọn bộ dự án muốn gửi rồi bấm 'Chia sẻ 3D'. Chọn những sản phẩm cần đưa vào link, sắp xếp thứ tự mở đầu tiên và thêm ghi chú cho khách.",
        descEn: "Click 'My Projects' in the header, choose your collection, and click 'Share 3D'. Check the items to include, arrange their display order, and add a client note.",
      },
      {
        titleVi: "Bước 3 — Tùy chỉnh Thời hạn, Mật khẩu & Quyền xem",
        titleEn: "Step 3 — Set Expiry, Passcode & Viewer Permissions",
        descVi: "Chọn thời hạn link (1 ngày, 7 ngày, 14 ngày hoặc tối đa 30 ngày), bật mật khẩu bảo vệ cho dự án bảo mật, và bật/tắt quyền kéo mở hộp 3D, xem kích thước mm hoặc đổi màu nền.",
        descEn: "Pick link expiration (1, 7, 14, or max 30 days), protect confidential launches with a passcode, and toggle client controls (3D box folding, mm dimensions, backdrop switcher).",
      },
      {
        titleVi: "Bước 4 — Gửi link duyệt 360° & Cập nhật miễn phí 0 coin",
        titleEn: "Step 4 — Send Live 360° Link & Free 0-Coin Updates",
        descVi: "Khách mở link trên điện thoại hay máy tính đều xoay 3D mượt mà không cần tài khoản. Khi cần sửa thiết kế, chỉ cần lưu lại và bấm 'Cập nhật lên link' — hoàn toàn 0 coin và giữ nguyên đường link cũ!",
        descEn: "Clients inspect your 3D lineup on mobile or desktop with no login required. Need revisions? Sync updates to the exact same URL anytime completely free (0 coins)!",
      },
    ],
    tipVi: "Bạn có thể theo dõi số lượt khách đã xem, bấm 'Tạm dừng link' bất cứ lúc nào khi cần chỉnh sửa hoặc 'Thu hồi & xóa' vĩnh viễn ngay trong hộp thoại Chia sẻ 3D.",
    tipEn: "Track live client view counts, pause the link anytime during revisions, or permanently revoke and delete it right from the Share 3D dialog.",
  },
];

export function GuideDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialChapter, setInitialChapter] = useState<GuideChapterId>("overview");

  const openGuide = useCallback<OpenGuideFn>((chapter) => {
    setInitialChapter(chapter ?? "overview");
    setOpen(true);
  }, []);

  return (
    <GuideContext.Provider value={openGuide}>
      {children}
      {open && (
        <UserGuideModal
          initialChapter={initialChapter}
          onClose={() => setOpen(false)}
        />
      )}
    </GuideContext.Provider>
  );
}

function UserGuideModal({
  initialChapter,
  onClose,
}: {
  initialChapter: GuideChapterId;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const isVi = locale === "vi";
  const pathname = usePathname();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [activeId, setActiveId] = useState<GuideChapterId>(initialChapter);
  const [zoomed, setZoomed] = useState(false);

  const activeIndex = Math.max(
    0,
    GUIDE_CHAPTERS.findIndex((c) => c.id === activeId),
  );
  const chapter = GUIDE_CHAPTERS[activeIndex] ?? GUIDE_CHAPTERS[0];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    return () => {
      document.documentElement.style.overflow = prevOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  const selectChapter = (id: GuideChapterId) => {
    setActiveId(id);
    setZoomed(false);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const launchInteractiveTour = () => {
    onClose();
    if (pathname?.startsWith("/studio")) {
      window.setTimeout(() => {
        window.dispatchEvent(new Event(START_STUDIO_TOUR_EVENT));
      }, 120);
    } else {
      router.push("/studio?tour=1#workspace");
    }
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          if (zoomed) setZoomed(false);
          else onClose();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            ) {
              onClose();
            }
          }
        }}
      >
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerBadge} aria-hidden="true">
              <HelpCircle size={20} />
            </span>
            <div>
              <h2 id={titleId}>
                {isVi ? "Hướng dẫn sử dụng HyperMockup" : "HyperMockup User Guide"}
              </h2>
              <p>
                {isVi
                  ? "Hướng dẫn chi tiết toàn bộ tính năng, phím tắt và quy trình thiết kế mockup 3D"
                  : "Complete guide to every tool, shortcut, and 3D mockup workflow"}
              </p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.tourCta}
              onClick={launchInteractiveTour}
              title={
                isVi
                  ? "Chạy hướng dẫn tương tác từng bước ngay trong Studio"
                  : "Launch interactive step-by-step tutorial in Studio"
              }
            >
              <Gamepad2 size={16} aria-hidden="true" />
              <span>{isVi ? "Hướng dẫn từng bước (Studio)" : "Interactive Studio Tour"}</span>
            </button>
            <button
              type="button"
              className={styles.closeBtn}
              aria-label={isVi ? "Đóng hướng dẫn" : "Close guide"}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <nav
            className={styles.sidebar}
            aria-label={isVi ? "Danh mục hướng dẫn" : "Guide chapters"}
          >
            {GUIDE_CHAPTERS.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === chapter.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navBtn} ${isActive ? styles.navBtnActive : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => selectChapter(item.id)}
                >
                  <span className={styles.navIcon} aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span className={styles.navText}>
                    <strong>
                      <span>{isVi ? item.navVi : item.navEn}</span>
                      {item.exclusive && (
                        <span className={styles.navExclusiveTag}>
                          ★ {isVi ? "Hot" : "New"}
                        </span>
                      )}
                    </strong>
                    <small>{isVi ? item.subVi : item.subEn}</small>
                  </span>
                </button>
              );
            })}

            <div className={styles.sidebarKeys}>
              <span className={styles.sidebarKeysTitle}>
                {isVi ? "Phím tắt 3D nhanh" : "Quick 3D Controls"}
              </span>
              <div className={styles.shortcutRow}>
                <span>{isVi ? "Di chuyển góc nhìn" : "Pan camera"}</span>
                <span className={styles.keyGroup}>
                  <kbd className={styles.keycap}>W</kbd>
                  <kbd className={styles.keycap}>A</kbd>
                  <kbd className={styles.keycap}>S</kbd>
                  <kbd className={styles.keycap}>D</kbd>
                </span>
              </div>
              <div className={styles.shortcutRow}>
                <span>{isVi ? "Xoay 360°" : "Orbit 360°"}</span>
                <kbd className={styles.keycap}>{isVi ? "Kéo chuột" : "Drag"}</kbd>
              </div>
              <div className={styles.shortcutRow}>
                <span>{isVi ? "Phóng to / nhỏ" : "Zoom"}</span>
                <kbd className={styles.keycap}>{isVi ? "Cuộn" : "Scroll"}</kbd>
              </div>
              <div className={styles.shortcutRow}>
                <span>{isVi ? "Đổi nhãn nhanh" : "Quick swap"}</span>
                <kbd className={styles.keycap}>{isVi ? "Click 3D" : "Click 3D"}</kbd>
              </div>
            </div>
          </nav>

          <div ref={contentRef} className={styles.content}>
            <div className={styles.chapterIntro}>
              <span className={styles.chapterKicker}>
                <span>
                  {isVi
                    ? `Phần ${activeIndex + 1} / ${GUIDE_CHAPTERS.length}`
                    : `Chapter ${activeIndex + 1} / ${GUIDE_CHAPTERS.length}`}
                </span>
                {chapter.exclusive && (
                  <span className={styles.navExclusiveTag}>
                    ★ {isVi ? "Tính năng độc quyền" : "Exclusive feature"}
                  </span>
                )}
              </span>
              <h3>{isVi ? chapter.titleVi : chapter.titleEn}</h3>
              <p>{isVi ? chapter.introVi : chapter.introEn}</p>
            </div>

            <button
              type="button"
              className={styles.shotCard}
              onClick={() => setZoomed(true)}
              aria-label={isVi ? "Phóng to ảnh minh họa" : "Enlarge guide screenshot"}
            >
              <img
                src={chapter.image}
                alt={isVi ? chapter.captionVi : chapter.captionEn}
                width={960}
                height={600}
                loading="eager"
              />
              <span className={styles.shotCaptionBar}>
                <span>{isVi ? chapter.captionVi : chapter.captionEn}</span>
                <span className={styles.zoomHint}>
                  <Maximize2 size={13} aria-hidden="true" />
                  <span>{isVi ? "Phóng to" : "Zoom"}</span>
                </span>
              </span>
            </button>

            <div className={styles.itemsGrid}>
              {chapter.items.map((item, idx) => (
                <article key={item.titleEn} className={styles.featureCard}>
                  <div className={styles.featureHead}>
                    <span className={styles.featureNum}>{idx + 1}</span>
                    <strong>{isVi ? item.titleVi : item.titleEn}</strong>
                  </div>
                  <p>{isVi ? item.descVi : item.descEn}</p>
                </article>
              ))}
            </div>

            <div className={styles.tipBanner}>
              <Lightbulb size={17} aria-hidden="true" />
              <div>
                <strong>{isVi ? "Mẹo hữu ích: " : "Pro tip: "}</strong>
                <span>{isVi ? chapter.tipVi : chapter.tipEn}</span>
              </div>
            </div>
          </div>
        </div>

        <footer className={styles.footer}>
          <span className={styles.footerMeta}>
            {isVi
              ? `${activeIndex + 1} / ${GUIDE_CHAPTERS.length} · ${chapter.navVi}`
              : `${activeIndex + 1} / ${GUIDE_CHAPTERS.length} · ${chapter.navEn}`}
          </span>

          <div className={styles.footerNav}>
            <button
              type="button"
              className={styles.footerBtn}
              disabled={activeIndex === 0}
              onClick={() => {
                if (activeIndex > 0) selectChapter(GUIDE_CHAPTERS[activeIndex - 1].id);
              }}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span>{isVi ? "Phần trước" : "Previous"}</span>
            </button>

            {activeIndex < GUIDE_CHAPTERS.length - 1 ? (
              <button
                type="button"
                className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
                onClick={() => selectChapter(GUIDE_CHAPTERS[activeIndex + 1].id)}
              >
                <span>{isVi ? "Phần tiếp theo" : "Next chapter"}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
                onClick={launchInteractiveTour}
              >
                <Gamepad2 size={15} aria-hidden="true" />
                <span>{isVi ? "Thực hành trong Studio" : "Try in Studio"}</span>
              </button>
            )}
          </div>
        </footer>

        {zoomed && (
          <div
            className={styles.lightbox}
            role="button"
            tabIndex={0}
            aria-label={isVi ? "Đóng xem ảnh phóng to" : "Close enlarged preview"}
            onClick={() => setZoomed(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setZoomed(false);
              }
            }}
          >
            <img
              src={chapter.image}
              alt={isVi ? chapter.captionVi : chapter.captionEn}
            />
            <span className={styles.lightboxCaption}>
              {isVi ? chapter.captionVi : chapter.captionEn} —{" "}
              {isVi ? "Bấm bất kỳ đâu để đóng" : "Click anywhere to close"}
            </span>
          </div>
        )}
      </dialog>
    </>
  );
}
