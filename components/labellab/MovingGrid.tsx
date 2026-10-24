"use client";

import { useEffect, useRef, useState } from "react";
import { backgroundConfig, labellabWhiteIconUrl } from "@/lib/background-config";
import { backgroundTileUrl } from "@/lib/background-render-state";
import { loadBackgroundTile } from "@/lib/background-image-tile";
import {
  BackgroundAutodrift,
  backgroundPointerVelocity,
} from "@/lib/background-motion";

const period = backgroundConfig.cellSize * backgroundConfig.iconSpacing;
const tile = backgroundTileUrl("berry", {
  ...backgroundConfig,
  lineOpacity: 0.2,
  iconOpacity: 0.42,
});
const brandTileTheme = { id: "labellab", color: "#ffffff", icon: "berry", iconUrl: labellabWhiteIconUrl } as const;

export default function MovingGrid({ enabled }: { enabled: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [gridTile, setGridTile] = useState(tile);
  useEffect(() => {
    let alive = true;
    void loadBackgroundTile(brandTileTheme, { ...backgroundConfig, lineOpacity: 0.2, iconOpacity: 0.42 })
      .then((value) => { if (alive) setGridTile(value); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !enabled) return;
    const surface = track.closest<HTMLElement>(".creative-space");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const drift = new BackgroundAutodrift(backgroundConfig);
    let raf = 0,
      last = 0,
      elapsed = 0,
      x = 0,
      y = 0,
      angle = 0;
    let pointerAngle: number | undefined;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = (surface ?? track).getBoundingClientRect();
      const velocity = backgroundPointerVelocity(
        event.clientX - rect.left - rect.width / 2,
        event.clientY - rect.top - rect.height / 2,
        backgroundConfig.maxSpeed,
      );
      pointerAngle = Math.atan2(velocity.y, velocity.x);
    };
    const release = () => {
      pointerAngle = undefined;
      drift.reset();
    };
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      const target = pointerAngle ?? drift.direction(elapsed);
      angle +=
        Math.atan2(Math.sin(target - angle), Math.cos(target - angle)) *
        (1 - Math.exp(-dt / backgroundConfig.dampingSeconds));
      x = (x + Math.cos(angle) * backgroundConfig.maxSpeed * dt) % period;
      y = (y + Math.sin(angle) * backgroundConfig.maxSpeed * dt) % period;
      track.style.transform = `translate3d(${x}px,${y}px,0)`;
      raf = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced.matches) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    surface?.addEventListener("pointermove", move, { passive: true });
    surface?.addEventListener("pointerleave", release);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      surface?.removeEventListener("pointermove", move);
      surface?.removeEventListener("pointerleave", release);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, [enabled]);
  return (
    <div className="moving-grid" aria-hidden="true" hidden={!enabled}>
      <div
        ref={trackRef}
        style={{
          inset: -period,
          backgroundImage: `url("${gridTile}")`,
          backgroundSize: `${period}px ${period}px`,
        }}
      />
    </div>
  );
}
