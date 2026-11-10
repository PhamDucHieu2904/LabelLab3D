import type { MockupAnimation } from "../mockup/contracts";

type MotionSettings = {
  sceneMode: "website" | "studio";
  motion: "showcase" | "off";
};

/** Keep the chosen animation mode while temporarily stopping its render loop for artwork editing. */
export function artworkEditAnimation(settings: MotionSettings, editing: boolean): MockupAnimation {
  const showcase = settings.sceneMode === "website" && settings.motion === "showcase";
  return { mode: showcase ? "showcase" : "off", playing: showcase && !editing, speed: 1 };
}
