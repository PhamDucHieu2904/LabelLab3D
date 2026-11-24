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
import styles from "./PackagingStudio.module.css";

interface Props {
  activeTemplateId: string;
  tone: "neutral" | "pink" | "white";
  disabled?: boolean;
  onSelectTemplate: (template: PackagingTemplateDefinition) => void;
}

const CATEGORIES: ReadonlyArray<{ id: "all" | PackagingTemplateCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "tray", label: "Trays" },
  { id: "carton", label: "Cartons" },
  { id: "mailer", label: "Mailers" },
  { id: "folding-box", label: "Retail" },
];

export default function PackagingLibrary({
  activeTemplateId,
  tone,
  disabled = false,
  onSelectTemplate,
}: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | PackagingTemplateCategory>("all");

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
    <div data-tone={tone}>
      <label className="search-box">
        <Search size={16} />
        <input
          placeholder="Search FEFCO / box..."
          aria-label="Search packaging templates"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="category-filters" aria-label="Filter box structures">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            aria-pressed={category === cat.id}
            disabled={disabled}
            onClick={() => setCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

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
          <p>No matching box templates.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
