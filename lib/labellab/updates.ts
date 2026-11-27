import {
  LAUNCH_PROMO_ANNOUNCEMENT_ID,
  LAUNCH_PROMO_COINS,
  LAUNCH_PROMO_END_DATE,
  LAUNCH_PROMO_START_DATE,
} from "@/lib/promotions/launch-event";

export type AnnouncementTone = "pink" | "blue" | "mint";
export type AnnouncementCategory = "Tính năng mới" | "Nâng cấp" | "Ưu đãi" | "Hệ thống";

export interface DefaultAnnouncementSeed {
  readonly id: string;
  readonly tone: AnnouncementTone;
  readonly category: AnnouncementCategory;
  readonly pinned: boolean;
  readonly title: string;
  readonly body: string;
  readonly titleEn: string;
  readonly bodyEn: string;
  readonly ctaLabel: string;
  readonly ctaLabelEn: string;
  readonly url: string;
  readonly time: string;
  readonly start?: string;
  readonly end?: string;
  readonly unread: boolean;
}

/** Exact legacy placeholder titles seeded in early demos, detected cleanly for 1-time upgrade. */
export const LEGACY_DEMO_ANNOUNCEMENT_TITLES: ReadonlySet<string> = new Set([
  "Weekend top-up bonus is live",
  "New 3D packaging bottles added to the library",
  "Parametric CAD boxes & dielines ready in Studio",
]);

export const LABELLAB_UPDATES: readonly DefaultAnnouncementSeed[] = Object.freeze([
  {
    id: LAUNCH_PROMO_ANNOUNCEMENT_ID,
    tone: "pink",
    category: "Ưu đãi",
    pinned: true,
    title: `Chào mừng ra mắt HyperMockup: Tặng ngay +${LAUNCH_PROMO_COINS} Coin`,
    body: `Sự kiện chào mừng chính thức ra mắt website! Tặng ngay ${LAUNCH_PROMO_COINS} Coin miễn phí cho bất kỳ ai đăng ký tài khoản từ 27/11/2026 đến hết 04/12/2026 (mỗi tài khoản nhận 1 lần duy nhất). Bấm để mở banner và nhận xu ngay!`,
    titleEn: `HyperMockup Launch Event: Claim +${LAUNCH_PROMO_COINS} Free Coins`,
    bodyEn: `Celebrate the official HyperMockup launch! Every new account registered from Nov 27 to Dec 4, 2026 gets +${LAUNCH_PROMO_COINS} free Studio coins (strictly one claim per account). Open to claim now!`,
    ctaLabel: `Nhận ngay ${LAUNCH_PROMO_COINS} Coin`,
    ctaLabelEn: `Claim ${LAUNCH_PROMO_COINS} Coins`,
    url: "/#launch-promo",
    time: "27/11/2026",
    start: LAUNCH_PROMO_START_DATE,
    end: LAUNCH_PROMO_END_DATE,
    unread: true,
  },
  {
    id: "release-cad-boxes",
    tone: "mint",
    category: "Tính năng mới",
    pinned: true,
    title: "Ra mắt Hộp CAD 3D: FEFCO 0201, 0201E & Vách tổ ong",
    body: "Thiết kế thùng carton nắp trên FEFCO 0201, thùng carton mở hông FEFCO 0201E, khay trưng bày FEFCO 0421 và hộp cứng 2 mảnh có vách ngăn tổ ong tự động xếp sản phẩm — xuất bản vẽ Dieline 1:1 mm (SVG, DXF, PDF).",
    titleEn: "Parametric 3D Boxes: FEFCO 0201, 0201E & Honeycomb Dividers",
    bodyEn: "Design top-open FEFCO 0201 shipping cartons, side-open FEFCO 0201E cartons, FEFCO 0421 display trays, and luxury 2-piece rigid boxes with automatic product packing, honeycomb dividers, and 1:1 mm SVG/DXF/PDF dielines.",
    ctaLabel: "Mở Studio hộp CAD",
    ctaLabelEn: "Open CAD Box Studio",
    url: "/studio?domain=packaging#workspace",
    time: "26/11/2026",
    unread: true,
  },
  {
    id: "release-hdri-cloud",
    tone: "blue",
    category: "Nâng cấp",
    pinned: false,
    title: "Ánh sáng HDRI + Spotlight 3D, Lưu Cloud & Link chia sẻ",
    body: "Tùy chỉnh 6 môi trường ánh sáng HDRI, xoay đèn Spotlight thực tế, đồng bộ dự án lên đám mây và tạo liên kết chia sẻ 3D tương tác để khách hàng xoay xem trực tiếp trên trình duyệt.",
    titleEn: "HDRI + Spotlight Rig, Cloud Projects & 3D Share Links",
    bodyEn: "Switch between 6 calibrated HDRI domes, aim directional studio spotlights, sync projects to the cloud, and share interactive 3D preview links with clients.",
    ctaLabel: "Trải nghiệm Studio 3D",
    ctaLabelEn: "Launch 3D Studio",
    url: "/studio#workspace",
    time: "26/11/2026",
    unread: true,
  },
  {
    id: "promo-checkin-streak",
    tone: "pink",
    category: "Ưu đãi",
    pinned: false,
    title: "Điểm danh 7 ngày nhận chuỗi thưởng đến +100 coin miễn phí",
    body: "Đăng nhập điểm danh mỗi ngày để nhận coin miễn phí dùng thử Studio 3D, với mốc thưởng đặc biệt Ngày 4 (+20 coin) và Ngày 7 (+30 coin). Hỗ trợ nạp thêm tức thì qua VietQR.",
    titleEn: "7-Day Check-In Streak: Claim Free Studio Coins Daily",
    bodyEn: "Sign in every day to collect free studio coins with bonus milestones on Day 4 (+20 coins) and Day 7 (+30 coins) for 2K, 4K, and 8K renders.",
    ctaLabel: "Điểm danh ngay",
    ctaLabelEn: "Go to Check-In",
    url: "/#home-checkin",
    time: "26/11/2026",
    unread: false,
  },
]);
