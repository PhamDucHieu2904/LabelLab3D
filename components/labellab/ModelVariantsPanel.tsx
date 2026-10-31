"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { Check } from "lucide-react";
import { getOrderedFamilyVariants, type LabModelFamily } from "@/lib/labellab/catalog";
import styles from "./ModelVariantsPanel.module.css";

type Props = {
  family: LabModelFamily;
  modelId: string;
  tone: "pink" | "white" | "neutral";
  libraryRef: RefObject<HTMLElement | null>;
  layoutRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
  onChoose: (modelId: string) => void;
  onDismiss: () => void;
};

export default function ModelVariantsPanel({
  family, modelId, tone, libraryRef, layoutRef, busy, onChoose, onDismiss,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const library = libraryRef.current;
    const layout = layoutRef.current;
    if (!panel || !library || !layout) return;
    const place = () => {
      const anchor = layout.querySelector<HTMLButtonElement>(".model-card.selected");
      if (!anchor) return;
      const root = layout.getBoundingClientRect();
      const card = anchor.getBoundingClientRect();
      const shelf = library.getBoundingClientRect();
      // Account for UI scaling without touching the scene/canvas dimensions.
      const scaleX = root.width / (layout.offsetWidth || 1);
      const scaleY = root.height / (layout.offsetHeight || 1);
      const top = Math.max(20, Math.min(
        (card.top - root.top) / scaleY,
        layout.clientHeight - panel.offsetHeight - 20,
      ));
      panel.style.setProperty("--variants-top", `${top}px`);
      panel.style.setProperty("--variants-left", `${(shelf.right - root.left) / scaleX + 12}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    [panel, library, layout].forEach((element) => observer.observe(element));
    library.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      library.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [family.id, libraryRef, layoutRef]);

  useEffect(() => {
    if (busy) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !panelRef.current?.contains(target) &&
        !libraryRef.current?.contains(target)) onDismiss();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      layoutRef.current?.querySelector<HTMLButtonElement>(".model-card.selected")?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, [busy, layoutRef, libraryRef, onDismiss]);

  return (
    <aside
      ref={panelRef}
      id="model-variants-panel"
      className={styles.panel}
      data-tone={tone}
      aria-label={`${family.name} variants`}
      inert={busy}
    >
      <div className={styles.list} role="group" aria-label="Choose product variant">
        {getOrderedFamilyVariants(family).map((variant) => {
          const selected = variant.modelId === modelId;
          return (
            <button
              type="button"
              key={variant.id}
              className={styles.row}
              aria-pressed={selected}
              disabled={!variant.available || !variant.modelId || busy}
              onClick={() => variant.available && variant.modelId && onChoose(variant.modelId)}
            >
              <span>{variant.label}</span>
              {variant.available
                ? <Check className={styles.check} size={15} aria-hidden="true" />
                : <span className={styles.soon}>Coming soon</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
