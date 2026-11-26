"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Lock,
  Milk,
  Package,
  PauseCircle,
  PlayCircle,
  RefreshCw,
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
import { buildShareFormData, packageProjectsForShare } from "@/lib/labellab/share-packager";
import type { CloudProjectItem } from "@/lib/projects/contracts";
import {
  computeExpiryIso,
  SHARE_LIMITS,
  type ShareExpiryPreset,
  type SharedProjectItemInput,
  type SharedProjectSummary,
} from "@/lib/share/contracts";
import { useLocale } from "./LocaleProvider";
import styles from "./ShareProjectDialog.module.css";

interface Props {
  open: boolean;
  collection: StudioProjectCollection;
  thumbUrls: Record<string, string>;
  existingShare?: SharedProjectSummary | null;
  shareCost: number;
  onShareCreatedOrUpdated: (share: SharedProjectSummary, chargedCoins: number) => void;
  onShareDeleted: (shareId: string, groupId: string) => void;
  onRequireLogin: (message: string) => void;
  onClose: () => void;
}

interface ShareableRowItem {
  id: string;
  name: string;
  kind: "beverage" | "packaging";
  modelId: string;
  thumbUrl?: string;
  cloudItem?: CloudProjectItem;
  localRecord?: CustomProjectRecord;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ShareProjectDialog({
  open,
  collection,
  thumbUrls,
  existingShare,
  shareCost,
  onShareCreatedOrUpdated,
  onShareDeleted,
  onRequireLogin,
  onClose,
}: Props) {
  const { t } = useLocale();
  const copy = t.studio.shareDialog;
  const dialogRef = useRef<HTMLDialogElement>(null);

  const sourceItems = useMemo<ShareableRowItem[]>(() => {
    if (collection.source === "cloud" && collection.cloudItems) {
      return collection.cloudItems.map((item) => {
        const baseModel = getLabModel(item.payload.settings.modelId);
        return {
          id: item.id,
          name: item.name,
          kind: item.kind,
          modelId: item.payload.settings.modelId,
          thumbUrl: item.thumbnailHash
            ? cloudProjectAssetUrl(collection.id, item.thumbnailHash)
            : item.kind === "beverage"
              ? baseModel.poster
              : undefined,
          cloudItem: item,
        };
      });
    }
    return (collection.localGroup?.items ?? []).map((item) => {
      const baseModel = getLabModel(item.settings.modelId);
      return {
        id: item.id,
        name: item.name,
        kind: item.kind,
        modelId: item.settings.modelId,
        thumbUrl: thumbUrls[item.id] || (item.kind === "beverage" ? baseModel.poster : undefined),
        localRecord: item,
      };
    });
  }, [collection, thumbUrls]);

  const [orderedIds, setOrderedIds] = useState<string[]>(() => sourceItems.map((item) => item.id));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(sourceItems.slice(0, SHARE_LIMITS.maxItems).map((item) => item.id)),
  );
  const [title, setTitle] = useState(existingShare?.title || collection.name);
  const [brandName, setBrandName] = useState(existingShare?.brandName || collection.brandName || "");
  const [description, setDescription] = useState(existingShare?.description || collection.description || "");
  const [expiryPreset, setExpiryPreset] = useState<ShareExpiryPreset>("30d");
  const [usePasscode, setUsePasscode] = useState<boolean>(Boolean(existingShare?.hasPasscode));
  const [passcode, setPasscode] = useState("");
  const [clearExistingPasscode, setClearExistingPasscode] = useState(false);
  const [allowFold, setAllowFold] = useState(existingShare?.options.allowFold ?? true);
  const [allowDimensions, setAllowDimensions] = useState(existingShare?.options.allowDimensions ?? true);
  const [allowBgSwitch, setAllowBgSwitch] = useState(existingShare?.options.allowBgSwitch ?? true);

  const [shareState, setShareState] = useState<SharedProjectSummary | null>(existingShare ?? null);
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  const itemById = useMemo(() => new Map(sourceItems.map((item) => [item.id, item])), [sourceItems]);

  const orderedItems = useMemo(() => {
    const list = orderedIds
      .map((id) => itemById.get(id))
      .filter((item): item is ShareableRowItem => Boolean(item));
    for (const item of sourceItems) {
      if (!orderedIds.includes(item.id)) list.push(item);
    }
    return list;
  }, [orderedIds, itemById, sourceItems]);

  const selectedItems = useMemo(
    () => orderedItems.filter((item) => selectedIds.has(item.id)),
    [orderedItems, selectedIds],
  );

  if (!open || typeof document === "undefined") return null;

  const shareUrl =
    shareState && typeof window !== "undefined"
      ? `${window.location.origin}/s/${shareState.token}`
      : "";

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < SHARE_LIMITS.maxItems) {
        next.add(id);
      }
      return next;
    });
    if (error) setError("");
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= orderedItems.length) return;
    const next = orderedItems.map((i) => i.id);
    [next[index], next[target]] = [next[target], next[index]];
    setOrderedIds(next);
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError(copy.errCopyFailed);
    }
  };

  const handlePublishOrSync = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(copy.errTitleRequired);
      return;
    }
    if (selectedItems.length === 0) {
      setError(copy.errSelectOne);
      return;
    }
    if (usePasscode && (!shareState?.hasPasscode || passcode.trim().length > 0)) {
      const p = passcode.trim();
      if (p.length < SHARE_LIMITS.minPasscodeLength || p.length > SHARE_LIMITS.maxPasscodeLength) {
        setError(copy.errPasscodeLength(SHARE_LIMITS.minPasscodeLength, SHARE_LIMITS.maxPasscodeLength));
        return;
      }
    }

    setBusy(true);
    setError("");
    try {
      let shareItems: SharedProjectItemInput[];
      let uploadAssets = new Map<string, Blob>();

      if (collection.source === "cloud") {
        // Cloud project assets are already stored in R2 (<=2048px WebP); reuse them with 0 re-upload!
        setProgressText(copy.publishing);
        shareItems = selectedItems
          .map((row, idx): SharedProjectItemInput | null => {
            const ci = row.cloudItem;
            if (!ci) return null;
            return {
              id: `item_${ci.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48)}`,
              name: ci.name,
              kind: ci.kind,
              subtitle: ci.subtitle,
              sortOrder: idx,
              ...(ci.thumbnailHash ? { thumbnailHash: ci.thumbnailHash } : {}),
              payload: ci.payload,
            };
          })
          .filter((x): x is SharedProjectItemInput => Boolean(x));
      } else {
        const localRecords = selectedItems
          .map((row) => row.localRecord)
          .filter((r): r is CustomProjectRecord => Boolean(r));
        setProgressText(copy.compressingArtwork(0, localRecords.length));
        const packaged = await packageProjectsForShare(localRecords, {
          onProgress: (done, total) => {
            setProgressText(copy.optimizingArtwork(done, total));
          },
        });
        setProgressText(copy.uploadingAssets(packaged.assets.size, formatBytes(packaged.totalBytes)));
        shareItems = packaged.items;
        uploadAssets = packaged.assets;
      }

      const isUpdating = Boolean(shareState);
      const manifest: Record<string, unknown> = {
        localProjectId: collection.id,
        title: cleanTitle,
        description: description.trim(),
        brandName: brandName.trim(),
        expiresAt: computeExpiryIso(expiryPreset),
        options: {
          allowFold,
          allowDimensions,
          allowBgSwitch,
          defaultItemId: shareItems[0]?.id,
        },
        items: shareItems,
      };
      if (!isUpdating) {
        manifest.idempotencyKey = `reserve_${crypto.randomUUID().replaceAll("-", "")}`;
        if (usePasscode && passcode.trim()) manifest.passcode = passcode.trim();
      } else {
        if (clearExistingPasscode || !usePasscode) {
          manifest.passcode = null;
        } else if (passcode.trim()) {
          manifest.passcode = passcode.trim();
        }
      }

      const form = buildShareFormData(manifest, uploadAssets);
      const response = await fetch(isUpdating ? `/api/share/${shareState!.id}` : "/api/share", {
        method: isUpdating ? "PATCH" : "POST",
        credentials: "same-origin",
        body: form,
      });

      if (response.status === 401 || response.status === 403) {
        onRequireLogin(
          shareCost > 0
            ? t.studio.toasts.signInSharePaid(shareCost)
            : t.studio.toasts.signInShareFree,
        );
        onClose();
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        share?: SharedProjectSummary;
        chargedCoins?: number;
        error?: string;
      } | null;

      if (!response.ok || !payload?.share) {
        const code = payload?.error;
        if (code === "INSUFFICIENT_COINS") {
          throw new Error(copy.errInsufficientCoins(shareCost));
        }
        if (code === "SHARE_LIMIT_REACHED") {
          throw new Error(copy.errShareLimitReached(SHARE_LIMITS.maxActiveSharesPerUser));
        }
        if (code === "ASSET_TOO_LARGE" || code === "PAYLOAD_TOO_LARGE" || code === "IMAGE_TOO_LARGE") {
          throw new Error(copy.errPayloadTooLarge);
        }
        throw new Error(copy.errPublishFailed);
      }

      setShareState(payload.share);
      setPasscode("");
      setClearExistingPasscode(false);
      onShareCreatedOrUpdated(payload.share, Number(payload.chargedCoins ?? 0));
      if (!isUpdating && payload.chargedCoins && payload.chargedCoins > 0) {
        window.dispatchEvent(new Event("labellab-account-changed"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errPublishFailed);
    } finally {
      setBusy(false);
      setProgressText("");
    }
  };

  const handleTogglePause = async () => {
    if (!shareState || busy) return;
    setBusy(true);
    setError("");
    try {
      const nextStatus = shareState.status === "paused" ? "active" : "paused";
      const response = await fetch(`/api/share/${shareState.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json().catch(() => null)) as { share?: SharedProjectSummary } | null;
      if (!response.ok || !payload?.share) throw new Error(copy.errUpdateStatusFailed);
      setShareState(payload.share);
      onShareCreatedOrUpdated(payload.share, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errUpdateStatusFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteShare = async () => {
    if (!shareState || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/share/${shareState.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(copy.errRevokeFailed);
      const deletedId = shareState.id;
      setShareState(null);
      onShareDeleted(deletedId, collection.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errRevokeFailed);
    } finally {
      setBusy(false);
    }
  };

  const isUpdating = Boolean(shareState);

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="share-project-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form className={styles.form} onSubmit={(e) => void handlePublishOrSync(e)}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>
              <Share2 size={12} aria-hidden="true" /> {copy.eyebrow}
            </span>
            <h2 id="share-project-title">{copy.title(collection.name)}</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label={copy.closeAria}
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          {shareState && (
            <section className={styles.liveCard} aria-label={copy.liveLink}>
              <div className={styles.liveTop}>
                <span
                  className={`${styles.statusBadge} ${
                    shareState.status === "active" ? styles.statusActive : styles.statusPaused
                  }`}
                >
                  {shareState.status === "active" ? copy.liveLink : copy.pausedLink}
                </span>
                <span className={styles.liveMeta}>
                  <Eye size={13} aria-hidden="true" /> {copy.viewsCount(shareState.viewCount)}
                  {shareState.hasPasscode && (
                    <>
                      {" · "}
                      <Lock size={12} aria-hidden="true" /> {copy.passcodeOn}
                    </>
                  )}
                </span>
              </div>
              <div className={styles.urlRow}>
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  aria-label={copy.liveLink}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" className={styles.iconAction} onClick={() => void handleCopy()}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copied ? copy.copied : copy.copy}</span>
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.iconAction}
                  title={copy.openPreview}
                >
                  <ExternalLink size={15} />
                </a>
              </div>
              <div className={styles.liveActions}>
                <button
                  type="button"
                  className={styles.subtleBtn}
                  disabled={busy}
                  onClick={() => void handleTogglePause()}
                >
                  {shareState.status === "paused" ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                  <span>{shareState.status === "paused" ? copy.resumeLink : copy.pauseLink}</span>
                </button>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  disabled={busy}
                  onClick={() => void handleDeleteShare()}
                >
                  <Trash2 size={14} />
                  <span>{copy.revokeDelete}</span>
                </button>
              </div>
            </section>
          )}

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <strong>{copy.includedObjects(selectedItems.length, orderedItems.length)}</strong>
              <span>{copy.includedHint}</span>
            </div>
            <div className={styles.itemList}>
              {orderedItems.map((item, idx) => {
                const checked = selectedIds.has(item.id);
                const baseModel = getLabModel(item.modelId);
                return (
                  <div
                    key={item.id}
                    className={`${styles.itemRow} ${checked ? styles.itemChecked : ""}`}
                  >
                    <label className={styles.itemCheckLabel}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy || (!checked && selectedIds.size >= SHARE_LIMITS.maxItems)}
                        onChange={() => toggleItem(item.id)}
                      />
                      <span className={styles.itemThumb}>
                        {item.thumbUrl ? (
                          <img src={item.thumbUrl} alt="" />
                        ) : item.kind === "packaging" ? (
                          <Package size={16} />
                        ) : (
                          <Milk size={16} />
                        )}
                      </span>
                      <span className={styles.itemInfo}>
                        <strong>{item.name}</strong>
                        <small>
                          {item.kind === "packaging" ? copy.boxTrayLabel : `${baseModel.name} (${baseModel.volume})`}
                          {idx === 0 && checked ? ` · ${copy.defaultView}` : ""}
                        </small>
                      </span>
                    </label>
                    <div className={styles.orderBtns}>
                      <button
                        type="button"
                        aria-label={`Move ${item.name} up`}
                        disabled={busy || idx === 0}
                        onClick={() => moveItem(idx, -1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${item.name} down`}
                        disabled={busy || idx === orderedItems.length - 1}
                        onClick={() => moveItem(idx, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className={styles.gridTwo}>
            <label className={styles.field}>
              <span>{copy.reviewTitle}</span>
              <input
                type="text"
                maxLength={SHARE_LIMITS.maxTitleLength}
                value={title}
                disabled={busy}
                placeholder={copy.reviewTitlePlaceholder}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>{copy.brandStudio}</span>
              <input
                type="text"
                maxLength={SHARE_LIMITS.maxBrandNameLength}
                value={brandName}
                disabled={busy}
                placeholder={copy.brandPlaceholder}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>{copy.clientNote}</span>
            <textarea
              rows={2}
              maxLength={SHARE_LIMITS.maxDescriptionLength}
              value={description}
              disabled={busy}
              placeholder={copy.clientNotePlaceholder}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className={styles.gridTwo}>
            <label className={styles.field}>
              <span>{copy.linkExpiry}</span>
              <select
                value={expiryPreset}
                disabled={busy}
                onChange={(e) => setExpiryPreset(e.target.value as ShareExpiryPreset)}
              >
                <option value="7d">{copy.exp7d}</option>
                <option value="30d">{copy.exp30d}</option>
                <option value="90d">{copy.exp90d}</option>
                <option value="never">{copy.expNever}</option>
              </select>
            </label>

            <div className={styles.field}>
              <span>{copy.accessProtection}</span>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={usePasscode}
                  disabled={busy}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setUsePasscode(next);
                    if (!next && shareState?.hasPasscode) setClearExistingPasscode(true);
                    else setClearExistingPasscode(false);
                  }}
                />
                <span>{copy.requirePasscode}</span>
              </label>
            </div>
          </div>

          {usePasscode && (
            <label className={styles.field}>
              <span>
                {shareState?.hasPasscode ? copy.newPasscodeHint : copy.passcodeHint}
              </span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={SHARE_LIMITS.minPasscodeLength}
                maxLength={SHARE_LIMITS.maxPasscodeLength}
                value={passcode}
                disabled={busy}
                placeholder={
                  shareState?.hasPasscode
                    ? copy.passcodePlaceholderUnchanged
                    : copy.passcodePlaceholderNew
                }
                onChange={(e) => setPasscode(e.target.value)}
              />
            </label>
          )}

          <div className={styles.togglesBar}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={allowFold}
                disabled={busy}
                onChange={(e) => setAllowFold(e.target.checked)}
              />
              <span>{copy.allowFold}</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={allowDimensions}
                disabled={busy}
                onChange={(e) => setAllowDimensions(e.target.checked)}
              />
              <span>{copy.allowDimensions}</span>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={allowBgSwitch}
                disabled={busy}
                onChange={(e) => setAllowBgSwitch(e.target.checked)}
              />
              <span>{copy.allowBgSwitch}</span>
            </label>
          </div>

          {progressText && <p className={styles.progressNote}>{progressText}</p>}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className={styles.footer}>
          <span className={styles.costHint}>
            {isUpdating
              ? copy.costFreeUpdate
              : shareCost > 0
                ? copy.costNewPaid(shareCost)
                : copy.costNewFree}
          </span>
          <div className={styles.footerBtns}>
            <button type="button" className={styles.cancelBtn} disabled={busy} onClick={onClose}>
              {copy.close}
            </button>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={busy || selectedItems.length === 0}
            >
              {isUpdating ? <RefreshCw size={15} /> : <Share2 size={15} />}
              <span>
                {busy
                  ? copy.publishing
                  : isUpdating
                    ? copy.syncUpdates
                    : shareCost > 0
                      ? copy.createLinkPaid(shareCost)
                      : copy.createLinkFree}
              </span>
            </button>
          </div>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
