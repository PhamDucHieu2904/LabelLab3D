"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { PackagingTemplateCategory, PackagingTemplateDefinition } from "@/lib/packaging-cad/types";
import {
  filterPackagingTemplates,
  PACKAGING_TEMPLATES,
} from "@/lib/packaging-cad/templates/registry";
import { renderPackagingTemplateThumbnails } from "@/lib/packaging-cad/thumbnail-renderer";
import LibrarySearchFilterBar, { type LibraryFilterOption } from "../LibrarySearchFilterBar";
import { useLocale } from "../LocaleProvider";
import modelLibrary from "../ModelLibrary.module.css";
import styles from "./PackagingStudio.module.css";

interface Props {
  activeTemplateId: string;
  tone: "neutral" | "pink" | "white" | "dark";
  disabled?: boolean;
  onSelectTemplate: (template: PackagingTemplateDefinition) => void;
}

export default function PackagingLibrary({
  activeTemplateId,
  tone,
  disabled = false,
  onSelectTemplate,
}: Props) {
  const { t } = useLocale();
  const lib = t.studio.library;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | PackagingTemplateCategory>("all");
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  // Render crisp finished-3D WebP thumbnails directly from our parametric CAD engine once per session.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setThumbnails(renderPackagingTemplateThumbnails(PACKAGING_TEMPLATES));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: PACKAGING_TEMPLATES.length };
    for (const tpl of PACKAGING_TEMPLATES) {
      counts[tpl.category] = (counts[tpl.category] ?? 0) + 1;
    }
    return counts;
  }, []);

  const categoryOptions: ReadonlyArray<LibraryFilterOption<"all" | PackagingTemplateCategory>> = [
    { id: "all" as const, label: lib.catAll, count: categoryCounts.all ?? 0 },
    { id: "tray" as const, label: lib.catTrays, count: categoryCounts.tray ?? 0 },
    { id: "carrier" as const, label: lib.catCarriers, count: categoryCounts.carrier ?? 0 },
    { id: "carton" as const, label: lib.catCartons, count: categoryCounts.carton ?? 0 },
    { id: "rigid-box" as const, label: lib.catRigid, count: categoryCounts["rigid-box"] ?? 0 },
    { id: "mailer" as const, label: lib.catMailers, count: categoryCounts.mailer ?? 0 },
    { id: "folding-box" as const, label: lib.catRetail, count: categoryCounts["folding-box"] ?? 0 },
  ].filter((opt) => opt.id === "all" || opt.count > 0);

  const templates = useMemo(() => filterPackagingTemplates(query, category), [query, category]);

  return (
    <div className={styles.templateLibrary} data-tone={tone}>
      <LibrarySearchFilterBar
        tone={tone}
        query={query}
        placeholder={lib.searchTemplates}
        category={category}
        allCategoryId="all"
        categories={categoryOptions}
        activeResultCount={templates.length}
        filterLabel={lib.filterCategory}
        menuAriaLabel={lib.boxTemplates}
        resetLabel={lib.resetFilter}
        clearLabel={lib.clearFilters}
        disabled={disabled}
        onQueryChange={setQuery}
        onCategoryChange={setCategory}
      />

      <div className={styles.templateScroll}>
        <div
          className={`models-grid ${modelLibrary.grid} ${styles.packagingModelsGrid}`}
          data-tone={tone}
          role="list"
          aria-label={lib.boxTemplates}
        >
          {templates.map((tpl) => {
            const selected = tpl.id === activeTemplateId;
            const thumbSrc = thumbnails[tpl.id];
            const dims = `${tpl.defaultDimensions.length}×${tpl.defaultDimensions.width}×${tpl.defaultDimensions.height} mm`;
            return (
              <button
                key={tpl.id}
                type="button"
                className={`model-card ${modelLibrary.card} ${selected ? "selected" : ""}`}
                aria-label={`${tpl.shortName} (${tpl.code}), ${dims}`}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onSelectTemplate(tpl)}
                title={`${tpl.name} · ${dims} — ${tpl.description}`}
              >
                <div className={`model-image ${modelLibrary.image}`}>
                  {thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt=""
                      className={styles.packagingThumbImg}
                    />
                  ) : (
                    <span className={styles.packagingThumbPlaceholder} aria-hidden="true" />
                  )}
                  {selected && (
                    <span className="selected-check">
                      <Check size={12} />
                    </span>
                  )}
                </div>
                <strong className={modelLibrary.name}>{tpl.shortName}</strong>
                <span className={modelLibrary.caption}>({tpl.code})</span>
              </button>
            );
          })}
        </div>

        {!templates.length && (
          <div className="empty-state">
            <Search size={24} />
            <p>{lib.noModels}</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              {lib.clearFilters}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
