"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Milk, Package, Save, Sparkles, X } from "lucide-react";
import type { LabModel } from "@/lib/labellab/catalog";
import type { ScenePreferences } from "@/lib/labellab/preferences";
import type { PackagingTemplateDefinition } from "@/lib/packaging-cad/types";
import styles from "./SaveProjectDialog.module.css";

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
  busy?: boolean;
  onSave: (name: string, mode: "new" | "update") => Promise<void>;
  onClose: () => void;
}

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
  busy = false,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName);
  const [mode, setMode] = useState<"new" | "update">("new");
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

  const trimmed = name.trim();
  const isBeverage = kind === "beverage";
  const hasLiquid = Boolean(model.asset.materialSlots?.liquid?.length);
  const hasCap = Boolean(model.asset.materialSlots?.cap?.length || model.asset.materialSlots?.tab?.length);
  const hasBody = Boolean(model.asset.materialSlots?.body?.length);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || busy) return;
    if (!trimmed) {
      setError("Please enter a name for your custom project.");
      inputRef.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(trimmed, existingProjectName ? mode : "new");
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
                  <Milk size={12} aria-hidden="true" /> CUSTOM BOTTLE / CAN PROJECT
                </>
              ) : (
                <>
                  <Package size={12} aria-hidden="true" /> PACKAGING CAD PROJECT
                </>
              )}
            </span>
            <h2 id="save-project-title">Save custom project</h2>
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
                        <i style={{ backgroundColor: settings.liquidColor }} /> Liquid
                      </span>
                    )}
                    {hasCap && (
                      <span className={styles.swatchPill}>
                        <i style={{ backgroundColor: settings.capColor }} /> {model.category === "can" ? "Top" : "Cap"}
                      </span>
                    )}
                    {hasBody && (
                      <span className={styles.swatchPill}>
                        <i style={{ backgroundColor: settings.bodyColor }} /> Body
                      </span>
                    )}
                  </div>
                  <div className={styles.labelStatus}>
                    {hasCustomLabel && customLabelUrl ? (
                      <>
                        <img src={customLabelUrl} alt="" className={styles.miniLabel} />
                        <span>Custom label snapshot included</span>
                      </>
                    ) : (
                      <span>Using default model label</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <label className={styles.field}>
            <span>Project name</span>
            <input
              ref={inputRef}
              type="text"
              maxLength={80}
              placeholder={isBeverage ? `e.g. My ${model.name} Gold Edition` : "e.g. 6-Pack Gift Display Tray"}
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
                Save as new project
              </button>
              <button
                type="button"
                className={styles.modeBtn}
                aria-pressed={mode === "update"}
                disabled={saving || busy}
                onClick={() => setMode("update")}
              >
                {mode === "update" && <Check size={13} aria-hidden="true" />}
                Update &ldquo;{existingProjectName}&rdquo;
              </button>
            </div>
          )}

          {isBeverage && (
            <div className={styles.comboNotice}>
              <Sparkles size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>Ready for Pack Your Bottles:</strong> After saving, open{" "}
                <em>Boxes &amp; Trays → Pack Your Bottles</em> to pack this custom bottle/can
                (with all finishes &amp; label) directly inside any tray or box!
              </span>
            </div>
          )}

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
            Cancel
          </button>
          <button
            type="submit"
            className={styles.saveBtn}
            disabled={saving || busy || !trimmed}
          >
            <Save size={15} aria-hidden="true" />
            <span>{saving ? "Saving…" : "Save project"}</span>
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
