import ComingSoon from "@/components/labellab/ComingSoon";
import HomePage from "@/components/labellab/HomePage";
import DesktopViewport from "@/components/labellab/DesktopViewport";
import { shouldShowComingSoon } from "@/lib/server/launch-gate";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await shouldShowComingSoon()) {
    return <ComingSoon />;
  }
  return <DesktopViewport><HomePage /></DesktopViewport>;
}
