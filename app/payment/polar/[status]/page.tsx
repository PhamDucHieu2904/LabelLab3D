import Link from "next/link";
import PolarResult from "./PolarResult";

export default async function PolarResultPage({ params, searchParams }: {
  params: Promise<{ status: string }>;
  searchParams: Promise<{ order?: string; id?: string }>;
}) {
  const { status } = await params;
  const query = await searchParams;
  if (!["success", "cancel"].includes(status) || !query.id) {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>Order not found</h1>
        <Link href="/">Back to Home</Link>
      </main>
    );
  }
  return <PolarResult status={status as "success" | "cancel"} orderId={query.id} />;
}
