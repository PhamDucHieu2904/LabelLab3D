import Link from "next/link";
import PaymentResult from "./PaymentResult";

export default async function SepayResultPage({ params, searchParams }: {
  params: Promise<{ status: string }>;
  searchParams: Promise<{ order?: string; id?: string }>;
}) {
  const { status } = await params;
  const query = await searchParams;
  if (!["success", "error", "cancel"].includes(status) || !query.id) {
    return <main style={{ maxWidth: 640, margin: "80px auto", padding: 24 }}><h1>Không tìm thấy giao dịch</h1><Link href="/">Về trang chủ</Link></main>;
  }
  return <PaymentResult status={status as "success" | "error" | "cancel"} orderId={query.id} />;
}
