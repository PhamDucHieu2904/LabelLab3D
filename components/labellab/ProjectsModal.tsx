"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Clock,
  Cloud,
  CloudUpload,
  FolderOpen,
  HardDrive,
  Layers3,
  Loader2,
  Milk,
  Package,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { getLabModel } from "@/lib/labellab/catalog";
import {
  cloudProjectAssetUrl,
  type StudioProjectCollection,
} from "@/lib/labellab/cloud-projects-client";
import type { CustomProjectRecord } from "@/lib/labellab/project-store";
import { getPackagingTemplate } from "@/lib/packaging-cad/templates/registry";
import {
  CLOUD_PROJECT_LIMITS,
  daysRemainingFromIso,
  type CloudProjectItem,
  type CloudProjectSummary,
} from "@/lib/projects/contracts";
import type { SharedProjectSummary } from "@/lib/share/contracts";
import { numberLocale } from "@/lib/i18n/locale";
import { useLocale } from "./LocaleProvider";
import styles from "./ProjectsModal.module.css";

type FilterTab = "all" | "shared" | "expiring";

interface NormalizedCardItem {
  id: string;
  name: string;
  kind: "beverage" | "packaging";
  subtitle: string;
  thumbUrl?: string;
  isPosterFallback: boolean;
  hasCustomLabel: boolean;
  cloudProject?: CloudProjectSummary;
  cloudItem?: CloudProjectItem;
  localRecord?: CustomProjectRecord;
}

interface Props {
  open: boolean;
  collections: readonly StudioProjectCollection[];
  cloudProjects: readonly CloudProjectSummary[];
  cloudAuthenticated: boolean;
  projectThumbUrls: Record<string, string>;
  shareByGroupId: Map<string, SharedProjectSummary>;
  extendCost: number;
  busy?: boolean;
  onOpenLocalItem: (item: CustomProjectRecord) => void;
  onOpenCloudItem: (project: CloudProjectSummary, item: CloudProjectItem) => Promise<void>;
  onDeleteLocalItem: (item: CustomProjectRecord) => void;
  onDeleteLocalGroup: (groupId: string, groupName: string) => void;
  onDeleteCloudItem: (projectId: string, itemId: string, itemName: string) => Promise<void>;
  onDeleteCloudProject: (projectId: string, projectName: string) => Promise<void>;
  onToggleAutoRenew: (projectId: string, nextValue: boolean) => Promise<void>;
  onExtendCloudProject: (projectId: string) => Promise<void>;
  onMigrateLocalToCloud: (groupId: string) => Promise<void>;
  onOpenShare: (collectionId: string) => void;
  onRequireLogin: () => void;
  onClose: () => void;
}

function buildNormalizedItems(
  col: StudioProjectCollection,
  projectThumbUrls: Record<string, string>,
  customLabelText: string,
): NormalizedCardItem[] {
  if (col.source === "cloud" && col.cloudItems) {
    const cloudProject: CloudProjectSummary = {
      id: col.id,
      name: col.name,
      description: col.description,
      brandName: col.brandName,
      itemCount: col.cloudItems.length,
      totalBytes: col.totalBytes ?? 0,
      autoRenew: Boolean(col.autoRenew),
      renewalCount: col.renewalCount ?? 0,
      expiresAt: col.expiresAt ?? "",
      createdAt: new Date(col.createdAt).toISOString(),
      updatedAt: new Date(col.updatedAt).toISOString(),
      items: col.cloudItems,
    };
    return col.cloudItems.map((item) => {
      const baseModel = getLabModel(item.payload.settings.modelId);
      const hasThumb = Boolean(item.thumbnailHash);
      const thumbUrl = hasThumb
        ? cloudProjectAssetUrl(col.id, item.thumbnailHash!)
        : item.kind === "beverage"
          ? baseModel.poster
          : undefined;
      const hasCustomLabel =
        item.payload.kind === "beverage"
          ? Boolean(item.payload.labelHash)
          : Boolean(item.payload.packagingArtwork);
      const subtitle =
        item.subtitle ||
        (item.kind === "packaging" && item.payload.kind === "packaging"
          ? `${getPackagingTemplate(item.payload.packagingParams.templateId).code} · ${Math.round(item.payload.packagingParams.lengthMm)}×${Math.round(item.payload.packagingParams.widthMm)}×${Math.round(item.payload.packagingParams.heightMm)} mm`
          : `${baseModel.name} (${baseModel.volume})${hasCustomLabel ? ` · ${customLabelText}` : ""}`);
      return {
        id: item.id,
        name: item.name,
        kind: item.kind,
        subtitle,
        thumbUrl,
        isPosterFallback: !hasThumb && item.kind === "beverage",
        hasCustomLabel,
        cloudProject,
        cloudItem: item,
      };
    });
  }

  if (col.localGroup) {
    return col.localGroup.items.map((item) => {
      const baseModel = getLabModel(item.settings.modelId);
      const capturedUrl = projectThumbUrls[item.id];
      const thumbUrl = capturedUrl || (item.kind === "beverage" ? baseModel.poster : undefined);
      const hasCustomLabel = Boolean(item.artworkBlob || item.packagingArtwork);
      const subtitle =
        item.kind === "packaging" && item.packagingParams
          ? `${getPackagingTemplate(item.packagingParams.templateId).code} · ${Math.round(item.packagingParams.lengthMm)}×${Math.round(item.packagingParams.widthMm)}×${Math.round(item.packagingParams.heightMm)} mm`
          : `${baseModel.name} (${baseModel.volume})${item.artworkBlob ? ` · ${customLabelText}` : ""}`;
      return {
        id: item.id,
        name: item.name,
        kind: item.kind,
        subtitle,
        thumbUrl,
        isPosterFallback: !capturedUrl && item.kind === "beverage",
        hasCustomLabel,
        localRecord: item,
      };
    });
  }

  return [];
}

export default function ProjectsModal({
  open,
  collections,
  cloudProjects,
  cloudAuthenticated,
  projectThumbUrls,
  shareByGroupId,
  extendCost,
  busy = false,
  onOpenLocalItem,
  onOpenCloudItem,
  onDeleteLocalItem,
  onDeleteLocalGroup,
  onDeleteCloudItem,
  onDeleteCloudProject,
  onToggleAutoRenew,
  onExtendCloudProject,
  onMigrateLocalToCloud,
  onOpenShare,
  onRequireLogin,
  onClose,
}: Props) {
  const { locale, t } = useLocale();
  const copy = t.studio.projectsModal;
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [query, setQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyProjectIds, setBusyProjectIds] = useState<Record<string, string>>({});
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  const activeDetailCollection = useMemo(
    () => (selectedCollectionId ? collections.find((c) => c.id === selectedCollectionId) ?? null : null),
    [selectedCollectionId, collections],
  );

  const sharedCount = useMemo(
    () => collections.filter((c) => shareByGroupId.has(c.id)).length,
    [collections, shareByGroupId],
  );

  const expiringCount = useMemo(
    () =>
      collections.filter(
        (c) => c.source === "cloud" && c.expiresAt && daysRemainingFromIso(c.expiresAt) <= 7,
      ).length,
    [collections],
  );

  const filteredCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return collections.filter((col) => {
      if (filterTab === "shared" && !shareByGroupId.has(col.id)) return false;
      if (filterTab === "expiring") {
        if (col.source !== "cloud" || !col.expiresAt) return false;
        if (daysRemainingFromIso(col.expiresAt) > 7) return false;
      }
      if (!q) return true;
      if (col.name.toLowerCase().includes(q)) return true;
      const items = col.source === "cloud" ? (col.cloudItems ?? []) : (col.localGroup?.items ?? []);
      return items.some((item) => item.name.toLowerCase().includes(q));
    });
  }, [collections, filterTab, query, shareByGroupId]);

  const formatShortDate = (ms: number) =>
    new Intl.DateTimeFormat(numberLocale(locale), {
      day: "numeric",
      month: "short",
    }).format(new Date(ms));

  if (!open || typeof document === "undefined") return null;

  const setProjectBusy = (id: string, kind: string | null) => {
    setBusyProjectIds((prev) => {
      const next = { ...prev };
      if (kind) next[id] = kind;
      else delete next[id];
      return next;
    });
  };

  const handleOpenCardItem = async (item: NormalizedCardItem) => {
    if (busy || openingItemId) return;
    if (item.cloudProject && item.cloudItem) {
      setOpeningItemId(item.id);
      try {
        await onOpenCloudItem(item.cloudProject, item.cloudItem);
      } finally {
        setOpeningItemId(null);
      }
    } else if (item.localRecord) {
      onOpenLocalItem(item.localRecord);
    }
  };

  const handleExtend = async (projectId: string) => {
    if (busy || busyProjectIds[projectId]) return;
    setProjectBusy(projectId, "extend");
    try {
      await onExtendCloudProject(projectId);
    } finally {
      setProjectBusy(projectId, null);
    }
  };

  const handleToggleAuto = async (projectId: string, nextValue: boolean) => {
    if (busy || busyProjectIds[projectId]) return;
    setProjectBusy(projectId, "auto");
    try {
      await onToggleAutoRenew(projectId, nextValue);
    } finally {
      setProjectBusy(projectId, null);
    }
  };

  const handleSyncLocal = async (groupId: string) => {
    if (!cloudAuthenticated) {
      onRequireLogin();
      return;
    }
    if (busy || busyProjectIds[groupId]) return;
    setProjectBusy(groupId, "sync");
    try {
      await onMigrateLocalToCloud(groupId);
    } finally {
      setProjectBusy(groupId, null);
    }
  };

  const handleDeleteCollection = async (col: StudioProjectCollection) => {
    setConfirmDeleteId(null);
    if (col.source === "cloud") {
      setProjectBusy(col.id, "delete");
      try {
        await onDeleteCloudProject(col.id, col.name);
        if (selectedCollectionId === col.id) setSelectedCollectionId(null);
      } finally {
        setProjectBusy(col.id, null);
      }
    } else {
      onDeleteLocalGroup(col.id, col.name);
      if (selectedCollectionId === col.id) setSelectedCollectionId(null);
    }
  };

  const handleDeleteSingleItem = async (col: StudioProjectCollection, item: NormalizedCardItem) => {
    setConfirmDeleteId(null);
    if (col.source === "cloud") {
      setProjectBusy(item.id, "delete");
      try {
        await onDeleteCloudItem(col.id, item.id, item.name);
      } finally {
        setProjectBusy(item.id, null);
      }
    } else if (item.localRecord) {
      onDeleteLocalItem(item.localRecord);
    }
  };

  const renderTtlPill = (col: StudioProjectCollection) => {
    if (col.source !== "cloud" || !col.expiresAt) {
      return (
        <span className={styles.localBadge}>
          <HardDrive size={11} aria-hidden="true" /> {copy.localOnlyBadge}
        </span>
      );
    }
    const days = daysRemainingFromIso(col.expiresAt);
    const toneClass = days <= 3 ? styles.ttlUrgent : days <= 7 ? styles.ttlWarn : "";
    return (
      <>
        <span className={`${styles.ttlBadge} ${toneClass}`}>
          <Clock size={11} aria-hidden="true" />
          {days <= 0 ? copy.expiresToday : copy.daysLeft(days)}
        </span>
        {col.autoRenew && (
          <span className={styles.autoChip} title={copy.autoRenewTooltip(extendCost)}>
            <RefreshCw size={9} aria-hidden="true" /> Auto
          </span>
        )}
      </>
    );
  };

  const renderStage = (items: NormalizedCardItem[], onActivate: () => void) => {
    const count = items.length;
    if (count <= 1) {
      const first = items[0];
      return (
        <div
          className={first?.isPosterFallback ? styles.stageSinglePoster : styles.stageSingle}
          onClick={onActivate}
        >
          {first?.thumbUrl ? (
            <img src={first.thumbUrl} alt="" />
          ) : first?.kind === "packaging" ? (
            <Package size={36} strokeWidth={1.4} className={styles.stageEmptyIcon} />
          ) : (
            <Box size={36} strokeWidth={1.4} className={styles.stageEmptyIcon} />
          )}
        </div>
      );
    }

    const layoutClass =
      count === 2 ? styles.stageSplit2 : count === 3 ? styles.stageBento3 : styles.stageGrid4;
    const shown = items.slice(0, 4);
    const extra = Math.max(0, count - 4);

    return (
      <div className={layoutClass} onClick={onActivate}>
        {shown.map((item, idx) => (
          <span
            key={item.id}
            className={`${styles.stageCell} ${item.isPosterFallback ? styles.stageCellPoster : ""}`}
          >
            {item.thumbUrl ? (
              <img src={item.thumbUrl} alt="" />
            ) : item.kind === "packaging" ? (
              <Package size={20} strokeWidth={1.5} />
            ) : (
              <Milk size={20} strokeWidth={1.5} />
            )}
            {idx === 3 && extra > 0 && <span className={styles.stageMoreOverlay}>+{extra}</span>}
          </span>
        ))}
      </div>
    );
  };

  const detailItems = activeDetailCollection
    ? buildNormalizedItems(activeDetailCollection, projectThumbUrls, copy.customLabel)
    : [];
  const detailLiveShare = activeDetailCollection ? shareByGroupId.get(activeDetailCollection.id) : undefined;
  const detailBusyKind = activeDetailCollection ? busyProjectIds[activeDetailCollection.id] : undefined;

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="projects-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !openingItemId) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy && !openingItemId) onClose();
      }}
    >
      <div className={styles.shell}>
        <header className={styles.header}>
          {activeDetailCollection ? (
            <div className={styles.detailHeaderRow}>
              <div className={styles.detailLeft}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => {
                    setSelectedCollectionId(null);
                    setConfirmDeleteId(null);
                  }}
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  <span>{copy.backToAllProjects}</span>
                </button>
                <h2 id="projects-modal-title" className={styles.detailTitle}>
                  {activeDetailCollection.name}
                </h2>
                {renderTtlPill(activeDetailCollection)}
              </div>

              <div className={styles.detailRight}>
                {activeDetailCollection.source === "cloud" && (
                  <>
                    <button
                      type="button"
                      className={styles.autoToggle}
                      disabled={Boolean(detailBusyKind) || busy}
                      title={copy.autoRenewTooltip(extendCost)}
                      onClick={() =>
                        void handleToggleAuto(activeDetailCollection.id, !activeDetailCollection.autoRenew)
                      }
                    >
                      <span
                        className={styles.switchTrack}
                        data-on={activeDetailCollection.autoRenew ? "true" : "false"}
                      >
                        <span className={styles.switchThumb} />
                      </span>
                      <span>{copy.autoRenewLabel}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.extendBtn}
                      disabled={Boolean(detailBusyKind) || busy}
                      onClick={() => void handleExtend(activeDetailCollection.id)}
                    >
                      {detailBusyKind === "extend" ? (
                        <Loader2 size={12} className={styles.spin} />
                      ) : extendCost > 0 ? (
                        <Image src="/branding/hypermockup-coin.svg" alt="" width={12} height={12} aria-hidden="true" />
                      ) : (
                        <Clock size={12} />
                      )}
                      <span>
                        {detailBusyKind === "extend"
                          ? copy.extending
                          : extendCost > 0
                            ? copy.extendBtn(CLOUD_PROJECT_LIMITS.extensionDays, extendCost)
                            : copy.extendFreeBtn(CLOUD_PROJECT_LIMITS.extensionDays)}
                      </span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={`${styles.shareBtn} ${detailLiveShare ? styles.shareBtnLive : ""}`}
                  style={{ flex: "0 0 auto", padding: "0 14px" }}
                  disabled={busy}
                  onClick={() => onOpenShare(activeDetailCollection.id)}
                >
                  <Share2 size={14} aria-hidden="true" />
                  <span>{detailLiveShare ? copy.manageLink : copy.share3d}</span>
                </button>
                <button
                  type="button"
                  className={styles.closeBtn}
                  aria-label={copy.closeAria}
                  disabled={busy || Boolean(openingItemId)}
                  onClick={onClose}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.headerTop}>
                <div className={styles.titleBlock}>
                  <span className={styles.brandMark}>
                    <Layers3 size={19} aria-hidden="true" />
                  </span>
                  <div className={styles.titleGroup}>
                    <div className={styles.titleLine}>
                      <h2 id="projects-modal-title">{copy.title}</h2>
                      {cloudAuthenticated && (
                        <span className={styles.quotaChip}>
                          <Cloud size={12} aria-hidden="true" />
                          {copy.cloudQuota(cloudProjects.length, CLOUD_PROJECT_LIMITS.maxProjectsPerUser)}
                        </span>
                      )}
                    </div>
                    <span className={styles.ruleChip}>
                      <Clock size={12} aria-hidden="true" />
                      {copy.retentionRuleChip(CLOUD_PROJECT_LIMITS.retentionDays, extendCost)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.closeBtn}
                  aria-label={copy.closeAria}
                  disabled={busy || Boolean(openingItemId)}
                  onClick={onClose}
                >
                  <X size={18} />
                </button>
              </div>

              {collections.length > 0 && (
                <div className={styles.toolbar}>
                  <label className={styles.searchField}>
                    <Search size={14} aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      placeholder={copy.searchPlaceholder}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <div className={styles.filterTabs} role="group" aria-label="Filter projects">
                    <button
                      type="button"
                      className={styles.filterTab}
                      aria-pressed={filterTab === "all"}
                      onClick={() => setFilterTab("all")}
                    >
                      <span>{copy.filterAll}</span>
                      <span className={styles.filterBadge}>{collections.length}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.filterTab}
                      aria-pressed={filterTab === "shared"}
                      onClick={() => setFilterTab("shared")}
                    >
                      <span>{copy.filterShared}</span>
                      {sharedCount > 0 && <span className={styles.filterBadge}>{sharedCount}</span>}
                    </button>
                    <button
                      type="button"
                      className={styles.filterTab}
                      aria-pressed={filterTab === "expiring"}
                      onClick={() => setFilterTab("expiring")}
                    >
                      <span>{copy.filterExpiring}</span>
                      {expiringCount > 0 && <span className={styles.filterBadge}>{expiringCount}</span>}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </header>

        <div className={styles.body}>
          {!activeDetailCollection && !cloudAuthenticated && (
            <div className={styles.guestBanner}>
              <div className={styles.guestText}>
                <Cloud size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>{copy.guestBannerTitle}</strong>
                  <span>{copy.guestBannerBody}</span>
                </div>
              </div>
              <button type="button" className={styles.guestSignInBtn} onClick={onRequireLogin}>
                {copy.signInBtn}
              </button>
            </div>
          )}

          {activeDetailCollection ? (
            <div className={styles.detailGrid}>
              {detailItems.map((item) => {
                const isOpening = openingItemId === item.id;
                const isDeleting = busyProjectIds[item.id] === "delete";
                const confirming = confirmDeleteId === `item:${item.id}`;
                return (
                  <article className={styles.itemCard} key={item.id}>
                    <div
                      className={`${styles.itemStage} ${item.isPosterFallback ? styles.itemStagePoster : ""}`}
                      onClick={() => void handleOpenCardItem(item)}
                    >
                      {item.thumbUrl ? (
                        <img src={item.thumbUrl} alt="" />
                      ) : item.kind === "packaging" ? (
                        <Package size={30} strokeWidth={1.4} className={styles.stageEmptyIcon} />
                      ) : (
                        <Milk size={30} strokeWidth={1.4} className={styles.stageEmptyIcon} />
                      )}
                      <span className={styles.itemKindTag}>
                        {item.kind === "packaging" ? (
                          <>
                            <Package size={10} /> CAD
                          </>
                        ) : (
                          <>
                            <Milk size={10} /> 3D
                          </>
                        )}
                      </span>
                    </div>

                    <div className={styles.itemBody}>
                      <strong title={item.name}>{item.name}</strong>
                      <small title={item.subtitle}>{item.subtitle}</small>
                    </div>

                    <div className={styles.itemFooter}>
                      <button
                        type="button"
                        className={styles.itemOpenBtn}
                        disabled={busy || Boolean(openingItemId) || isDeleting}
                        onClick={() => void handleOpenCardItem(item)}
                      >
                        {isOpening ? (
                          <>
                            <Loader2 size={13} className={styles.spin} />
                            <span>{copy.loadingItem}</span>
                          </>
                        ) : (
                          <>
                            <span>{copy.openInStudio}</span>
                            <ArrowRight size={13} aria-hidden="true" />
                          </>
                        )}
                      </button>

                      {confirming ? (
                        <span className={styles.confirmDeleteWrap}>
                          <button
                            type="button"
                            className={styles.confirmDeleteYes}
                            disabled={isDeleting}
                            onClick={() => void handleDeleteSingleItem(activeDetailCollection, item)}
                          >
                            {copy.confirmDelete}
                          </button>
                          <button
                            type="button"
                            className={styles.confirmDeleteNo}
                            aria-label={copy.cancelDelete}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          aria-label={`${copy.deleteItem} ${item.name}`}
                          title={copy.deleteItem}
                          disabled={busy || isDeleting}
                          onClick={() => setConfirmDeleteId(`item:${item.id}`)}
                        >
                          {isDeleting ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : filteredCollections.length > 0 ? (
            <div className={styles.grid}>
              {filteredCollections.map((col) => {
                const items = buildNormalizedItems(col, projectThumbUrls, copy.customLabel);
                const beverageCount = items.filter((i) => i.kind === "beverage").length;
                const packagingCount = items.filter((i) => i.kind === "packaging").length;
                const singleItem = items.length === 1 ? items[0] : null;
                const liveShare = shareByGroupId.get(col.id);
                const busyKind = busyProjectIds[col.id];
                const confirming = confirmDeleteId === `col:${col.id}`;
                const isOpeningSingle = singleItem ? openingItemId === singleItem.id : false;

                const onPrimaryOpen = () => {
                  if (singleItem) void handleOpenCardItem(singleItem);
                  else setSelectedCollectionId(col.id);
                };

                return (
                  <article className={styles.card} key={col.id}>
                    <div className={styles.stage}>
                      {renderStage(items, onPrimaryOpen)}

                      <div className={styles.stageTopLeft}>{renderTtlPill(col)}</div>

                      {liveShare && (
                        <div className={styles.stageTopRight}>
                          <span
                            className={`${styles.sharePill} ${
                              liveShare.status === "paused" ? styles.sharePillPaused : ""
                            }`}
                          >
                            <span className={styles.liveDot} />
                            {liveShare.status === "paused"
                              ? copy.pausedBadge
                              : copy.sharedBadge(liveShare.viewCount)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.cardTitleRow}>
                        <h3 title={col.name}>{col.name}</h3>
                        <span className={styles.dateText}>{formatShortDate(col.updatedAt)}</span>
                      </div>

                      <div className={styles.metaChips}>
                        {beverageCount > 0 && (
                          <span className={styles.metaChip}>
                            <Milk size={11} aria-hidden="true" /> {copy.bottlesUnit(beverageCount)}
                          </span>
                        )}
                        {packagingCount > 0 && (
                          <span className={styles.metaChip}>
                            <Package size={11} aria-hidden="true" /> {copy.boxesUnit(packagingCount)}
                          </span>
                        )}
                      </div>

                      <div className={styles.retentionBar}>
                        {col.source === "cloud" ? (
                          <>
                            <button
                              type="button"
                              className={styles.autoToggle}
                              disabled={Boolean(busyKind) || busy}
                              title={copy.autoRenewTooltip(extendCost)}
                              onClick={() => void handleToggleAuto(col.id, !col.autoRenew)}
                            >
                              <span
                                className={styles.switchTrack}
                                data-on={col.autoRenew ? "true" : "false"}
                              >
                                <span className={styles.switchThumb} />
                              </span>
                              <span>{copy.autoRenewLabel}</span>
                            </button>
                            <button
                              type="button"
                              className={styles.extendBtn}
                              disabled={Boolean(busyKind) || busy}
                              onClick={() => void handleExtend(col.id)}
                            >
                              {busyKind === "extend" ? (
                                <Loader2 size={12} className={styles.spin} />
                              ) : extendCost > 0 ? (
                                <Image
                                  src="/branding/hypermockup-coin.svg"
                                  alt=""
                                  width={12}
                                  height={12}
                                  aria-hidden="true"
                                />
                              ) : (
                                <Clock size={12} />
                              )}
                              <span>
                                {busyKind === "extend"
                                  ? copy.extending
                                  : extendCost > 0
                                    ? copy.extendBtn(CLOUD_PROJECT_LIMITS.extensionDays, extendCost)
                                    : copy.extendFreeBtn(CLOUD_PROJECT_LIMITS.extensionDays)}
                              </span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={styles.syncCloudBtn}
                            disabled={Boolean(busyKind) || busy}
                            onClick={() => void handleSyncLocal(col.id)}
                          >
                            {busyKind === "sync" ? (
                              <>
                                <Loader2 size={13} className={styles.spin} />
                                <span>{copy.syncingCloud}</span>
                              </>
                            ) : (
                              <>
                                <CloudUpload size={13} aria-hidden="true" />
                                <span>{copy.syncToCloud}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className={styles.cardFooter}>
                      <button
                        type="button"
                        className={styles.openBtn}
                        disabled={busy || Boolean(busyKind) || isOpeningSingle}
                        onClick={onPrimaryOpen}
                      >
                        {isOpeningSingle ? (
                          <>
                            <Loader2 size={13} className={styles.spin} />
                            <span>{copy.loadingItem}</span>
                          </>
                        ) : singleItem ? (
                          <>
                            <span>{copy.open}</span>
                            <ArrowRight size={13} aria-hidden="true" />
                          </>
                        ) : (
                          <>
                            <span>{copy.viewItems(items.length)}</span>
                            <ArrowRight size={13} aria-hidden="true" />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        className={`${styles.shareBtn} ${liveShare ? styles.shareBtnLive : ""}`}
                        disabled={busy || Boolean(busyKind)}
                        onClick={() => onOpenShare(col.id)}
                      >
                        <Share2 size={13} aria-hidden="true" />
                        <span>{liveShare ? copy.manageLink : copy.share3d}</span>
                      </button>

                      {confirming ? (
                        <span className={styles.confirmDeleteWrap}>
                          <button
                            type="button"
                            className={styles.confirmDeleteYes}
                            disabled={Boolean(busyKind)}
                            onClick={() => void handleDeleteCollection(col)}
                          >
                            {copy.confirmDelete}
                          </button>
                          <button
                            type="button"
                            className={styles.confirmDeleteNo}
                            aria-label={copy.cancelDelete}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          aria-label={`${copy.deleteProject} ${col.name}`}
                          title={copy.deleteProject}
                          disabled={busy || Boolean(busyKind)}
                          onClick={() => setConfirmDeleteId(`col:${col.id}`)}
                        >
                          {busyKind === "delete" ? (
                            <Loader2 size={14} className={styles.spin} />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : collections.length > 0 ? (
            <div className={styles.emptyState}>
              <Search size={28} strokeWidth={1.5} />
              <p>{query.trim() ? copy.noSearchMatch : copy.emptyFilterMatch}</p>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>
                <FolderOpen size={28} strokeWidth={1.5} />
              </span>
              <h3>{copy.emptyTitle}</h3>
              <p>{copy.emptyBody}</p>
              <button type="button" className={styles.emptyCta} onClick={onClose}>
                <span>{copy.backToStudio}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
