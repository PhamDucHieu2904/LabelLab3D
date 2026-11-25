import ComingSoon from "@/components/labellab/ComingSoon";
import LabellabApp from "@/components/labellab/LabellabApp";
import DesktopViewport from "@/components/labellab/DesktopViewport";
import { shouldShowComingSoon } from "@/lib/server/launch-gate";

export const dynamic = "force-dynamic";

export default async function Studio() {
  if (await shouldShowComingSoon()) {
    return <ComingSoon />;
  }
  return <DesktopViewport layout="studio"><LabellabApp /></DesktopViewport>;
}
