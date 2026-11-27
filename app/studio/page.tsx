import type { Metadata } from "next";
import ComingSoon from "@/components/labellab/ComingSoon";
import LabellabApp from "@/components/labellab/LabellabApp";
import DesktopViewport from "@/components/labellab/DesktopViewport";
import { buildBreadcrumbJsonLd, buildPageMetadata, serializeJsonLd } from "@/lib/seo/site";
import { shouldShowComingSoon } from "@/lib/server/launch-gate";
import { readServerLocale } from "@/lib/server/locale";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readServerLocale();
  const en = locale === "en";
  return buildPageMetadata({
    title: en
      ? "3D Packaging Mockup Studio — Bottles, Cans, Boxes & 1:1 mm Dielines"
      : "Mockup Studio 3D — Chai, Lon, Hộp & Dieline CAD 1:1 mm",
    description: en
      ? "Wrap label artwork live on 3D glass bottles, aluminum cans, PET containers, and parametric CAD boxes in WebGL. Render up to 8K PNG, export 1:1 mm PDF/SVG/DXF dielines, and share interactive 3D client links."
      : "Bọc nhãn trực tiếp lên chai thủy tinh, lon nhôm, chai PET và hộp giấy CAD tham số 3D bằng WebGL. Xuất ảnh PNG tới 8K, khuôn bế 1:1 mm PDF/SVG/DXF và chia sẻ link duyệt mẫu 3D.",
    path: "/studio",
    locale,
  });
}

export default async function Studio() {
  if (await shouldShowComingSoon()) {
    return <ComingSoon />;
  }
  const locale = await readServerLocale();
  const breadcrumbJsonLd = serializeJsonLd(
    buildBreadcrumbJsonLd([
      { name: locale === "en" ? "Home" : "Trang chủ", path: "/" },
      { name: "Mockup Studio 3D", path: "/studio" },
    ]),
  );
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
      />
      <DesktopViewport layout="studio"><LabellabApp /></DesktopViewport>
    </>
  );
}
