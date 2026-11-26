"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Cloud, FolderPlus, Milk, Package, Save, Sparkles, X } from "lucide-react";
import type { LabModel } from "@/lib/labellab/catalog";
import type { ScenePreferences } from "@/lib/labellab/preferences";
import type { PackagingTemplateDefinition } from "@/lib/packaging-cad/types";
import { CLOUD_PROJECT_LIMITS } from "@/lib/projects/contracts";
import { useLocale } from "./LocaleProvider";
import styles from "./SaveProjectDialog.module.css";

export interface SaveProjectGroupOption {
  id: string;
  name: string;
  itemCount: number;
  source?: "cloud" | "local";
}

export interface SaveProjectPayload {
  itemName: string;
  mode: "new" | "update";
  /** Existing project group id when saving into an existing project, or undefined to create a new project. */
  groupId?: string;
  /** Project collection name (used when creating a new project or updating the group's cached name). */
  groupName: string;
  /** Whether to enable automatic +30d coin renewal on newly created Cloud projects. */
  autoRenew?: boolean;
}

interface Props {
  open: boolean;
  kind: "beverage" | "packaging";
  model: LabModel;
  packagingTemplate?: PackagingTemplateDefinition;
  settings: ScenePreferences;
  hasCustomLabel: boolean;
  customLabelUrl?: string;
  previewUrl?: string;
  initialName: string;
  existingProjectName?: string;
  existingGroupId?: string;
  availableGroups: readonly SaveProjectGroupOption[];
  isCloudAuthenticated?: boolean;
  extendCost?: number;
  busy?: boolean;
  onSave: (payload: SaveProjectPayload) => Promise<void>;
  onClose: () => void;
}

const NEW_GROUP_VALUE = "__new__";

export default function SaveProjectDialog({
  open,
  kind,
  model,
  packagingTemplate,
  settings,
  hasCustomLabel,
  customLabelUrl,
  previewUrl,
  initialName,
  existingProjectName,
  existingGroupId,
  availableGroups,
  isCloudAuthenticated = false,
  extendCost = 10,
  busy = false,
  onSave,
  onClose,
}: Props) {
  const { t } = useLocale();
  const copy = t.studio.saveDialog;
  const defaultGroupId =
    existingGroupId && availableGroups.some((g) => g.id === existingGroupId)
      ? existingGroupId
      : availableGroups.length > 0
        ? availableGroups[0].id
        : NEW_GROUP_VALUE;

  const [selectedGroupId, setSelectedGroupId] = useState<string>(defaultGroupId);
  const [newGroupName, setNewGroupName] = useState<string>(
    defaultGroupId === NEW_GROUP_VALUE ? initialName : "",
  );
  const [name, setName] = useState(initialName);
  const [mode, setMode] = useState<"new" | "update">(existingProjectName ? "update" : "new");
  const [autoRenew, setAutoRenew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const trimmedItemName = name.trim();
  const isCreatingNewGroup = selectedGroupId === NEW_GROUP_VALUE;
  const activeGroupOption = !isCreatingNewGroup
    ? availableGroups.find((g) => g.id === selectedGroupId)
    : undefined;
  const trimmedGroupName = isCreatingNewGroup
    ? (newGroupName.trim() || trimmedItemName)
    : (activeGroupOption?.name ?? trimmedItemName);

  const isBeverage = kind === "beverage";
  const hasLiquid = Boolean(model.asset.materialSlots?.liquid?.length);
  const hasCap = Boolean(model.asset.materialSlots?.cap?.length || model.asset.materialSlots?.tab?.length);
  const hasBody = Boolean(model.asset.materialSlots?.body?.length);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || busy) return;
    if (!trimmedItemName) {
      setError(copy.errItemNameRequired);
      inputRef.current?.focus();
      return;
    }
    if (isCreatingNewGroup && !trimmedGroupName) {
      setError(copy.errGroupNameRequired);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        itemName: trimmedItemName,
        mode: existingProjectName ? mode : "new",
        groupId: isCreatingNewGroup ? undefined : selectedGroupId,
        groupName: trimmedGroupName,
        ...(isCreatingNewGroup && isCloudAuthenticated ? { autoRenew } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save project. Please try again.");
      setSaving(false);
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="save-project-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving && !busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !busy) onClose();
      }}
    >
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>
              {isBeverage ? (
                <>
                  <Milk size={12} aria-hidden="true" /> {copy.eyebrowBeverage}
                </>
              ) : (
                <>
                  <Package size={12} aria-hidden="true" /> {copy.eyebrowPackaging}
                </>
              )}
            </span>
            <h2 id="save-project-title">{copy.title}</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close save dialog"
            disabled={saving || busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.previewCard}>
            <div className={styles.previewFrame}>
              {previewUrl || model.poster ? (
                <img src={previewUrl || model.poster} alt="" />
              ) : (
                <Package size={36} strokeWidth={1.3} />
              )}
            </div>
            <div className={styles.previewDetails}>
              <strong>
                {isBeverage
                  ? `${model.name} (${model.volume})`
                  : `${packagingTemplate?.code ?? "Box"} · ${packagingTemplate?.name ?? "Packaging"}`}
              </strong>
              {isBeverage && (
                <>
                  <div className={styles.swatchList}>
                    {hasLiquid && (
                      <span className={styles.swatchPill}>
                        <i style={{ backgroundColor: settings.liquidColor }} /> {t.studio.rail.liquid}
                      </span>
                    )}
                    {hasCap && (
                      <span className={styles.swatchPill}>
                        <i style={{ backgroundColor: settings.capColor }} /> {model.category === "can" ? t.studio.rail.top : t.studio.rail.cap}
                      </span>
                    )}
                    {hasBody && (
                      <span className={styles.swatchPill}>
                        <i style={{ backgroundColor: settings.bodyColor }} /> {t.studio.rail.body}
                      </span>
                    )}
                  </div>
                  <div className={styles.labelStatus}>
                    {hasCustomLabel && customLabelUrl ? (
                      <>
                        <img src={customLabelUrl} alt="" className={styles.miniLabel} />
                        <span>{copy.customLabelIncluded}</span>
                      </>
                    ) : (
                      <span>{copy.usingDefaultLabel}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <label className={styles.field}>
            <span>{copy.projectCollectionLabel}</span>
            <select
              className={styles.select}
              value={selectedGroupId}
              disabled={saving || busy}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedGroupId(next);
                if (next === NEW_GROUP_VALUE && !newGroupName.trim()) {
                  setNewGroupName(trimmedItemName);
                }
                if (error) setError("");
              }}
            >
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({copy.itemsUnit(g.itemCount)})
                </option>
              ))}
              <option value={NEW_GROUP_VALUE}>{copy.createNewCollection}</option>
            </select>
          </label>

          {isCreatingNewGroup && (
            <label className={styles.field}>
              <span className={styles.inlineLabel}>
                <FolderPlus size={13} aria-hidden="true" /> {copy.newProjectName}
              </span>
              <input
                type="text"
                maxLength={80}
                placeholder={copy.newProjectPlaceholder}
                value={newGroupName}
                disabled={saving || busy}
                onChange={(e) => {
                  setNewGroupName(e.target.value);
                  if (error) setError("");
                }}
              />
            </label>
          )}

          <label className={styles.field}>
            <span>{isBeverage ? copy.flavorItemLabel : copy.boxItemLabel}</span>
            <input
              ref={inputRef}
              type="text"
              maxLength={80}
              placeholder={isBeverage ? copy.flavorPlaceholder : copy.boxPlaceholder}
              value={name}
              disabled={saving || busy}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
            />
          </label>

          {existingProjectName && (
            <div className={styles.modeRow} role="radiogroup" aria-label="Save mode">
              <button
                type="button"
                className={styles.modeBtn}
                aria-pressed={mode === "new"}
                disabled={saving || busy}
                onClick={() => setMode("new")}
              >
                {mode === "new" && <Check size={13} aria-hidden="true" />}
                {copy.saveAsNewItem}
              </button>
              <button
                type="button"
                className={styles.modeBtn}
                aria-pressed={mode === "update"}
                disabled={saving || busy}
                onClick={() => setMode("update")}
              >
                {mode === "update" && <Check size={13} aria-hidden="true" />}
                {copy.updateItem(existingProjectName)}
              </button>
            </div>
          )}

          {isCloudAuthenticated && isCreatingNewGroup && (
            <label className={styles.autoRenewRow}>
              <input
                type="checkbox"
                checked={autoRenew}
                disabled={saving || busy}
                onChange={(e) => setAutoRenew(e.target.checked)}
              />
              <span>{copy.autoRenewCheckbox(extendCost)}</span>
            </label>
          )}

          <div className={styles.comboNotice}>
            {isCloudAuthenticated ? (
              <Cloud size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            ) : (
              <Sparkles size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            )}
            <span>
              {isCloudAuthenticated ? (
                <>
                  <strong>{copy.cloudRetentionTitle(CLOUD_PROJECT_LIMITS.retentionDays)}</strong>{" "}
                  {copy.cloudRetentionBody(extendCost)}
                </>
              ) : (
                copy.guestSaveNotice
              )}
            </span>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            disabled={saving || busy}
            onClick={onClose}
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            className={styles.saveBtn}
            disabled={saving || busy || !trimmedItemName}
          >
            <Save size={15} aria-hidden="true" />
            <span>{saving ? copy.saving : copy.save}</span>
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
