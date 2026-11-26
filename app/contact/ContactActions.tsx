"use client";

import { useState } from "react";
import { ArrowUpRight, Bug, Check, Coins, Copy, Lightbulb, Mail, ShieldAlert } from "lucide-react";
import type { UiLocale } from "@/lib/i18n/locale";
import styles from "@/app/legal/legal.module.css";

function buildMailto(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function ContactActions({
  email,
  locale,
}: {
  email: string;
  locale: UiLocale;
}) {
  const [copied, setCopied] = useState(false);
  const en = locale === "en";

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission errors in restricted contexts.
    }
  }

  const topics = en
    ? [
        {
          Icon: Coins,
          title: "Coin Top-Up & Order Support",
          desc: "Delayed coin credit, VietQR / Polar payment verification, or receipt requests.",
          subject: "[HyperMockup] Order / Coin Top-Up Support",
          body: "Hello HyperMockup Support,\n\n- Account email:\n- Order code (e.g. HM... or Polar Order ID):\n- Payment time & amount:\n- Issue description:\n",
          cta: "Email about an order",
        },
        {
          Icon: Bug,
          title: "3D Studio & Technical Bugs",
          desc: "Report rendering issues, label UV alignment bugs, or CAD dieline export errors.",
          subject: "[HyperMockup] Technical / 3D Studio Bug Report",
          body: "Hello HyperMockup Support,\n\n- 3D model / CAD box name:\n- Browser & device:\n- What happened:\n(Feel free to attach a screenshot)\n",
          cta: "Report a bug",
        },
        {
          Icon: Lightbulb,
          title: "Request New 3D Models & Feedback",
          desc: "Suggest new bottles, jars, cans, carton templates, or custom studio improvements.",
          subject: "[HyperMockup] New 3D Packaging Model Request",
          body: "Hello HyperMockup,\n\n- Packaging type (bottle / box / jar / can):\n- Approximate dimensions (mm / ml):\n- Notes or reference:\n",
          cta: "Send model feedback",
        },
        {
          Icon: ShieldAlert,
          title: "Copyright, Takedown & Data Privacy",
          desc: "IP/content takedown requests or personal data export / deletion requests (Law 91/2025/QH15).",
          subject: "[HyperMockup] Copyright / Content Takedown / Privacy Request",
          body: "Hello HyperMockup,\n\n- Request type (Copyright / Takedown / Data Export / Account Deletion):\n- Account email or relevant URL:\n- Details & supporting proof:\n",
          cta: "Send legal / privacy notice",
        },
      ]
    : [
        {
          Icon: Coins,
          title: "Hỗ trợ nạp coin & đơn hàng",
          desc: "Tra soát đơn chuyển khoản VietQR / Polar bị chậm cộng coin hoặc yêu cầu biên nhận.",
          subject: "[HyperMockup] Hỗ trợ đơn hàng / Nạp coin",
          body: "Chào bộ phận hỗ trợ HyperMockup,\n\n- Email tài khoản:\n- Mã đơn hàng (VD: HM... hoặc mã Polar):\n- Thời gian & số tiền giao dịch:\n- Nội dung cần hỗ trợ:\n",
          cta: "Gửi email hỗ trợ đơn hàng",
        },
        {
          Icon: Bug,
          title: "Báo lỗi kỹ thuật / 3D Studio",
          desc: "Báo lỗi hiển thị 3D, lỗi dán nhãn UV, lỗi xuất ảnh PNG hoặc xuất khuôn bế CAD.",
          subject: "[HyperMockup] Báo lỗi kỹ thuật 3D Studio",
          body: "Chào HyperMockup,\n\n- Tên mẫu 3D / mẫu hộp CAD:\n- Trình duyệt & thiết bị đang dùng:\n- Mô tả lỗi gặp phải:\n(Bạn có thể đính kèm ảnh chụp màn hình)\n",
          cta: "Gửi báo lỗi",
        },
        {
          Icon: Lightbulb,
          title: "Đề xuất mẫu bao bì 3D mới & Góp ý",
          desc: "Đề xuất thêm chai, lon, hũ, mẫu hộp carton mới hoặc tính năng bạn muốn có trong Studio.",
          subject: "[HyperMockup] Đề xuất mẫu bao bì 3D mới",
          body: "Chào HyperMockup,\n\n- Loại bao bì cần thêm (chai / hộp / lon / hũ):\n- Dung tích hoặc kích thước dự kiến (mm / ml):\n- Ghi chú hoặc hình tham khảo:\n",
          cta: "Gửi góp ý / đề xuất",
        },
        {
          Icon: ShieldAlert,
          title: "Bản quyền, gỡ nội dung & dữ liệu cá nhân",
          desc: "Gửi yêu cầu gỡ nội dung vi phạm bản quyền hoặc trích xuất / xóa dữ liệu theo Luật 91/2025/QH15.",
          subject: "[HyperMockup] Yêu cầu Bản quyền / Gỡ nội dung / Dữ liệu cá nhân",
          body: "Chào HyperMockup,\n\n- Loại yêu cầu (Bản quyền / Gỡ nội dung / Trích xuất hoặc Xóa dữ liệu):\n- Email tài khoản hoặc đường dẫn liên quan:\n- Chi tiết & tài liệu chứng minh:\n",
          cta: "Gửi yêu cầu pháp lý",
        },
      ];

  return (
    <>
      <div className={styles.emailHero}>
        <div className={styles.emailMeta}>
          <span className={styles.emailLabel}>
            {en ? "Official Support & Feedback Email" : "Email hỗ trợ & nhận phản hồi chính thức"}
          </span>
          <a href={`mailto:${email}`} className={styles.emailAddress}>
            {email}
          </a>
          <span className={styles.slaNote}>
            {en
              ? "Typical response time: within 24–48 business hours (GMT+7)."
              : "Thời gian phản hồi dự kiến: trong vòng 24–48 giờ làm việc (GMT+7)."}
          </span>
        </div>
        <div className={styles.emailButtons}>
          <button type="button" className={styles.copyBtn} onClick={() => void copyEmail()}>
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            <span>{copied ? (en ? "Copied email" : "Đã sao chép") : (en ? "Copy email" : "Sao chép email")}</span>
          </button>
          <a href={`mailto:${email}`} className={styles.ctaPrimary}>
            <Mail size={15} aria-hidden="true" />
            <span>{en ? "Send email now" : "Gửi email ngay"}</span>
          </a>
        </div>
      </div>

      <section>
        <h2>{en ? "Quick Email Templates by Topic" : "Chọn nhanh chủ đề cần hỗ trợ"}</h2>
        <p>
          {en
            ? "Pick the topic that matches your request — your email app will open pre-filled with the details we need to assist you faster."
            : "Chọn đúng nhóm vấn đề bên dưới — ứng dụng email sẽ tự điền sẵn tiêu đề và các thông tin cần thiết giúp xử lý nhanh hơn."}
        </p>
        <div className={styles.topicGrid}>
          {topics.map(({ Icon, title, desc, subject, body, cta }) => (
            <a
              key={title}
              href={buildMailto(email, subject, body)}
              className={styles.topicCard}
            >
              <strong>
                <Icon size={17} aria-hidden="true" style={{ color: "#a12e56" }} />
                <span>{title}</span>
              </strong>
              <p>{desc}</p>
              <span className={styles.topicAction}>
                <span>{cta}</span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
