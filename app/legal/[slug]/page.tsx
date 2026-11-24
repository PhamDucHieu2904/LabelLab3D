import Link from "next/link";
import styles from "../legal.module.css";

const pages = {
  terms: {
    title: "Điều khoản sử dụng credit",
    intro: "Trang này mô tả nguyên tắc dự kiến cho credit nội bộ của LabelLab3D. Nội dung sẽ được rà soát và cập nhật trước khi có thanh toán thật.",
    sections: [
      ["Credit nội bộ", "Coin chỉ là credit dùng trong LabelLab3D để sử dụng các tính năng được công bố. Coin không phải tiền điện tử, không phải tài sản đầu tư, không được quy đổi tiền mặt, chuyển nhượng hoặc mua bán giữa người dùng."],
      ["Giá và cung cấp dịch vụ", "Giá, loại tiền và số coin được hiển thị trước khi tạo đơn. Trong bản xem trước hiện tại chưa có giao dịch và chưa có coin nào được cộng."],
      ["Sử dụng hợp lệ", "Không sử dụng credit để thực hiện hành vi gian lận, rửa tiền, né tránh giới hạn dịch vụ hoặc vi phạm pháp luật. Chúng tôi có thể tạm khóa giao dịch bất thường để kiểm tra."],
    ],
  },
  privacy: {
    title: "Chính sách bảo mật",
    intro: "Bản xem trước này chưa kết nối payment provider. Khi bật thanh toán, chính sách sẽ được hoàn thiện theo dữ liệu thực tế và nhà cung cấp được chọn.",
    sections: [
      ["Dữ liệu tối thiểu", "Hệ thống chỉ nên xử lý dữ liệu cần cho tài khoản, đơn hàng, hỗ trợ và đối soát. Không lưu số thẻ hoặc CVV trên LabelLab3D."],
      ["Nhà cung cấp thanh toán", "Thông tin cần thiết có thể được truyền tới payment provider để tạo và xác nhận giao dịch. Thông tin chi tiết, thời hạn lưu trữ và quyền của người dùng sẽ được công bố trước production."],
      ["Liên hệ và yêu cầu dữ liệu", "Người dùng có thể yêu cầu kiểm tra, chỉnh sửa hoặc xóa dữ liệu theo quy trình được công bố khi tính năng tài khoản và thanh toán hoàn thiện."],
    ],
  },
  refund: {
    title: "Chính sách thanh toán và hoàn tiền",
    intro: "Chưa có thanh toán thật trong bản hiện tại. Chính sách dưới đây là khung dự kiến, không tạo quyền yêu cầu hoàn tiền cho một giao dịch chưa phát sinh.",
    sections: [
      ["Thanh toán", "QR demo và mã đơn trong panel chỉ phục vụ xem giao diện. Không chuyển tiền theo QR demo và không gửi ảnh biên lai để yêu cầu cộng credit."],
      ["Khi nào xử lý hoàn tiền", "Khi production được bật, các trường hợp thanh toán thất bại, thu trùng hoặc giao dịch được provider xác nhận hoàn sẽ được xử lý theo trạng thái order và chứng từ đối soát."],
      ["Hỗ trợ tranh chấp", "Người dùng cần cung cấp mã đơn và thông tin liên hệ phù hợp. Credit đã sử dụng có thể cần kiểm tra thủ công theo điều khoản công bố trước giao dịch."],
    ],
  },
} as const;

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug as keyof typeof pages] ?? pages.terms;

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <Link className={styles.back} href="/">← Quay lại LabelLab3D</Link>
        <p className={styles.eyebrow}>LABEL LAB · BẢN XEM TRƯỚC</p>
        <h1>{page.title}</h1>
        <p className={styles.intro}>{page.intro}</p>
        {page.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{body}</p>
          </section>
        ))}
        <p className={styles.note}>Khi thanh toán thật được bật, nội dung pháp lý sẽ được cập nhật theo chủ thể bán, provider, thuế và quy định áp dụng.</p>
      </article>
    </main>
  );
}
