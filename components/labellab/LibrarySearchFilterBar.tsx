"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import styles from "./packaging/PackagingStudio.module.css";

export interface LibraryFilterOption<T extends string = string> {
  readonly id: T;
  readonly label: string;
  readonly count: number;
}

interface Props<T extends string> {
  tone: "neutral" | "pink" | "white";
  query: string;
  placeholder: string;
  category: T;
  allCategoryId: T;
  categories: ReadonlyArray<LibraryFilterOption<T>>;
  activeResultCount: number;
  filterLabel: string;
  menuAriaLabel: string;
  resetLabel: string;
  clearLabel: string;
  disabled?: boolean;
  onQueryChange: (nextQuery: string) => void;
  onCategoryChange: (nextCategory: T) => void;
}

export default function LibrarySearchFilterBar<T extends string>({
  tone,
  query,
  placeholder,
  category,
  allCategoryId,
  categories,
  activeResultCount,
  filterLabel,
  menuAriaLabel,
  resetLabel,
  clearLabel,
  disabled = false,
  onQueryChange,
  onCategoryChange,
}: Props<T>) {
  const [filterOpen, setFilterOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (toolbarRef.current && target && !toolbarRef.current.contains(target)) {
        setFilterOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filterOpen]);

  const activeCategoryLabel =
    categories.find((cat) => cat.id === category)?.label ?? categories[0]?.label ?? "";
  const hasActiveCategory = category !== allCategoryId;

  return (
    <div className={styles.filterBarRoot} data-tone={tone}>
      <div ref={toolbarRef} className={styles.templateToolbar}>
        <div className={`search-box ${styles.templateSearchBox}`}>
          <Search size={15} aria-hidden="true" className={styles.templateSearchIcon} />
          <input
            placeholder={placeholder}
            aria-label={placeholder}
            value={query}
            disabled={disabled}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className={styles.templateSearchClear}
              aria-label={clearLabel}
              disabled={disabled}
              onClick={() => onQueryChange("")}
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
          <span className={styles.templateSearchDivider} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.templateFilterBtn} ${hasActiveCategory ? styles.templateFilterBtnActive : ""}`}
            aria-label={filterLabel}
            aria-expanded={filterOpen}
            aria-haspopup="menu"
            title={hasActiveCategory ? `${filterLabel}: ${activeCategoryLabel}` : filterLabel}
            disabled={disabled}
            onClick={() => setFilterOpen((prev) => !prev)}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            {hasActiveCategory && <span className={styles.templateFilterDot} aria-hidden="true" />}
          </button>
        </div>

        {filterOpen && (
          <div className={styles.templateFilterPopover} role="menu" aria-label={menuAriaLabel}>
            <div className={styles.templateFilterHeader}>
              <span>{filterLabel}</span>
              {hasActiveCategory && (
                <button
                  type="button"
                  className={styles.templateFilterReset}
                  onClick={() => {
                    onCategoryChange(allCategoryId);
                    setFilterOpen(false);
                  }}
                >
                  {resetLabel}
                </button>
              )}
            </div>
            <div className={styles.templateFilterList}>
              {categories.map((cat) => {
                const selected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={`${styles.templateFilterOption} ${selected ? styles.templateFilterOptionActive : ""}`}
                    disabled={disabled}
                    onClick={() => {
                      onCategoryChange(cat.id);
                      setFilterOpen(false);
                    }}
                  >
                    <span className={styles.templateFilterOptionLeft}>
                      <span className={styles.templateFilterCheckSlot} aria-hidden="true">
                        {selected && <Check size={13} />}
                      </span>
                      <span>{cat.label}</span>
                    </span>
                    <span className={styles.templateFilterCount}>{cat.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {hasActiveCategory && (
        <div className={styles.templateActiveFilterRow}>
          <button
            type="button"
            className={styles.templateActiveFilterChip}
            disabled={disabled}
            onClick={() => onCategoryChange(allCategoryId)}
            title={clearLabel}
          >
            <span>{activeCategoryLabel}</span>
            <span className={styles.templateActiveFilterCount}>{activeResultCount}</span>
            <X size={11} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
