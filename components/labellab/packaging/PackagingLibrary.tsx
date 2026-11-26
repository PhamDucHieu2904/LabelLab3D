"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { PackagingTemplateCategory, PackagingTemplateDefinition } from "@/lib/packaging-cad/types";
import {
  createDefaultPackagingParams,
  filterPackagingTemplates,
  PACKAGING_TEMPLATES,
  solvePackagingTemplate,
} from "@/lib/packaging-cad/templates/registry";
import { exportDielineSvg } from "@/lib/packaging-cad/exporters/vector-dieline";
import LibrarySearchFilterBar, { type LibraryFilterOption } from "../LibrarySearchFilterBar";
import { useLocale } from "../LocaleProvider";
import styles from "./PackagingStudio.module.css";

interface Props {
  activeTemplateId: string;
  tone: "neutral" | "pink" | "white";
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

  // Pre-compute razor-sharp miniature SVG dieline previews directly from the CAD solver!
  const thumbnails = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tpl of PACKAGING_TEMPLATES) {
      const solved = solvePackagingTemplate(createDefaultPackagingParams(tpl.id));
      map[tpl.id] = exportDielineSvg(solved, {
        side: "outside",
        marginMm: 10,
        includeDimensions: false,
        includeLabels: false,
        includeBleed: false,
        includeFill: true,
      });
    }
    return map;
  }, []);

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
        <div className={styles.templateGrid} role="list" aria-label="Parametric box templates">
          {templates.map((tpl) => {
            const selected = tpl.id === activeTemplateId;
            return (
              <button
                key={tpl.id}
                type="button"
                className={styles.templateCard}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onSelectTemplate(tpl)}
                title={tpl.description}
              >
                <div className={styles.templateThumb}>
                  <span className={styles.templateCode}>{tpl.code}</span>
                  {selected && (
                    <span className={styles.templateCheck} aria-hidden="true">
                      <Check size={11} />
                    </span>
                  )}
                  <div
                    style={{ width: "100%", height: "100%" }}
                    dangerouslySetInnerHTML={{ __html: thumbnails[tpl.id] }}
                  />
                </div>
                <strong className={styles.templateName}>{tpl.shortName}</strong>
                <span className={styles.templateMeta}>
                  {tpl.defaultDimensions.length}×{tpl.defaultDimensions.width}×{tpl.defaultDimensions.height} mm
                </span>
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
