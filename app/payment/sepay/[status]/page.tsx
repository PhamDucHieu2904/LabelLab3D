import Link from "next/link";
import { getUiMessages } from "@/lib/i18n/messages";
import { readServerLocale } from "@/lib/server/locale";
import PaymentResult from "./PaymentResult";

export default async function SepayResultPage({ params, searchParams }: {
  params: Promise<{ status: string }>;
  searchParams: Promise<{ order?: string; id?: string }>;
}) {
  const [{ status }, query, locale] = await Promise.all([params, searchParams, readServerLocale()]);
  const m = getUiMessages(locale).paymentResult;
  if (!["success", "error", "cancel"].includes(status) || !query.id) {
    return (
      <main style={{ maxWidth: 640, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>{m.notFoundTitle}</h1>
        <Link href="/">{m.backHome}</Link>
      </main>
    );
  }
  return <PaymentResult status={status as "success" | "error" | "cancel"} orderId={query.id} />;
}
