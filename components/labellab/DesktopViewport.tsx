"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { fitDesktopViewport, fitStudioWorkspace } from "@/lib/labellab/desktop-viewport";
import styles from "./DesktopViewport.module.css";

export default function DesktopViewport({ children, layout = "home" }: {
  children: ReactNode;
  layout?: "home" | "studio";
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const surface = surfaceRef.current;
    if (!viewport || !surface) return;
    const fit = () => {
      const size = fitDesktopViewport(viewport.clientWidth, window.innerHeight);
      if (!size) return;
      surface.style.setProperty("--labellab-scale", String(size.scale));
      surface.style.setProperty("--labellab-page-width", `${size.width}px`);
      surface.style.setProperty("--labellab-page-height", `${size.height}px`);
      if (layout === "studio") {
        const workspace = fitStudioWorkspace(viewport.clientWidth, window.innerHeight);
        if (workspace) {
          surface.style.setProperty("--labellab-workspace-scale", String(workspace.relativeScale));
          surface.style.setProperty("--labellab-workspace-width", `${workspace.width}px`);
          surface.style.setProperty("--labellab-workspace-height", `${workspace.height}px`);
          surface.style.setProperty("--labellab-studio-page-height", `${workspace.pageHeight}px`);
        }
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [layout]);

  return (
    <div className={styles.viewport} ref={viewportRef}>
      <div className={styles.surface} ref={surfaceRef} data-labellab-surface data-layout={layout}>
        {children}
      </div>
    </div>
  );
}
