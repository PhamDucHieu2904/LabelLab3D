import type { Metadata } from "next";
import Link from "next/link";
import { getUiMessages } from "@/lib/i18n/messages";
import { NOINDEX_ROBOTS } from "@/lib/seo/site";
import { readServerLocale } from "@/lib/server/locale";
import PolarResult from "./PolarResult";

export const metadata: Metadata = {
  title: "Polar Checkout Result",
  robots: NOINDEX_ROBOTS,
};

export default async function PolarResultPage({ params, searchParams }: {
  params: Promise<{ status: string }>;
  searchParams: Promise<{ order?: string; id?: string }>;
}) {
  const [{ status }, query, locale] = await Promise.all([params, searchParams, readServerLocale()]);
  const m = getUiMessages(locale).paymentResult;
  if (!["success", "cancel"].includes(status) || !query.id) {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>{m.notFoundTitle}</h1>
        <Link href="/">{m.backHome}</Link>
      </main>
    );
  }
  return <PolarResult status={status as "success" | "cancel"} orderId={query.id} />;
}
