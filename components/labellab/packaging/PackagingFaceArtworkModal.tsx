"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ArtworkEditor, { type ArtworkEditorResult } from "../ArtworkEditor";
import { getArtworkDieline, type ArtworkDieline } from "@/lib/labellab/artwork-transform";
import {
  bottleArtworkScope,
  deleteArtwork,
  listArtworks,
  packagingFaceArtworkScope,
  saveArtwork,
  setArtworkSelection,
  type StoredArtwork,
} from "@/lib/labellab/artwork-store";
import { getLabModel } from "@/lib/labellab/catalog";
import type { InteractivePickTarget } from "@/lib/mockup/contracts";

interface Props {
  target: InteractivePickTarget;
  /** Currently active artwork record id for this exact face or packed bottle (if any). */
  activeArtworkId?: string;
  /** True when the target currently displays a custom artwork that can be cleared. */
  hasCurrentArtwork: boolean;
  /** Current board face tint (for packaging-face targets). */
  faceTint?: string;
  /** Default board surface color behind transparent artwork (for packaging-face targets). */
  boardSurfaceColor?: string;
  onFaceTintChange?: (color: string | undefined) => void;
  onApplyFaceArtwork: (input: {
    templateId: string;
    panelId: string;
    surface: "outside" | "inside";
    record: StoredArtwork;
  }) => void;
  onRemoveFaceArtwork: (panelId: string, surface: "outside" | "inside") => void;
  onApplyPackedBottleLabel: (modelId: string, record: StoredArtwork) => void;
  onRemovePackedBottleLabel: () => void;
  onClose: () => void;
}

/**
 * Independent Pacdora-style 3D click-to-edit artwork modal.
 * Isolates every box face (`templateId:surface:panelId`) and every bottle/can model
 * (`bottle:modelId`) into its own independent artwork editor and saved history!
 */
export default function PackagingFaceArtworkModal({
  target,
  activeArtworkId,
  hasCurrentArtwork,
  faceTint,
  boardSurfaceColor = "#c49a6c",
  onFaceTintChange,
  onApplyFaceArtwork,
  onRemoveFaceArtwork,
  onApplyPackedBottleLabel,
  onRemovePackedBottleLabel,
  onClose,
}: Props) {
  const isFace = target.kind === "packaging-face";

  const scope = useMemo(
    () =>
      isFace
        ? packagingFaceArtworkScope(target.templateId, target.surface, target.panelId)
        : bottleArtworkScope(target.modelId),
    [isFace, target],
  );

  const dieline = useMemo<ArtworkDieline>(() => {
    if (isFace) {
      return {
        width: Math.max(1, target.widthMm),
        height: Math.max(1, target.heightMm),
        unit: "mm",
      };
    }
    return getArtworkDieline(target.modelId);
  }, [isFace, target]);

  const bottleModel = useMemo(
    () => (isFace ? null : getLabModel(target.modelId)),
    [isFace, target],
  );

  const [records, setRecords] = useState<StoredArtwork[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [initialRecord, setInitialRecord] = useState<StoredArtwork | undefined>(undefined);
  const [editorRevision, setEditorRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listArtworks(scope)
      .then((items) => {
        if (cancelled) return;
        setRecords(items);
        const initial = activeArtworkId
          ? items.find((item) => item.id === activeArtworkId)
          : undefined;
        setInitialRecord(initial);
        setEditorRevision((rev) => rev + 1);
        setError("");
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not load saved artwork history.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, activeArtworkId]);

  useEffect(() => {
    const urls = Object.fromEntries(
      records.map((record) => [record.id, URL.createObjectURL(record.preview)]),
    );
    const frame = requestAnimationFrame(() => setThumbnails(urls));
    return () => {
      cancelAnimationFrame(frame);
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [records]);

  const selectSaved = (record?: StoredArtwork) => {
    setInitialRecord(record);
    setEditorRevision((rev) => rev + 1);
  };

  const handleConfirm = async (result: ArtworkEditorResult) => {
    const now = Date.now();
    const editingSameSource =
      Boolean(initialRecord) &&
      initialRecord?.scope === scope &&
      result.source === initialRecord.source;
    const record: StoredArtwork = {
      ...result,
      id: editingSameSource ? initialRecord!.id : crypto.randomUUID(),
      scope,
      createdAt: editingSameSource ? initialRecord!.createdAt : now,
      updatedAt: now,
    };
    await saveArtwork(record);
    if (isFace) {
      await setArtworkSelection(scope, record.id);
    }
    if (!mounted.current) return;
    setRecords((prev) => [record, ...prev.filter((item) => item.id !== record.id)]);
    if (isFace) {
      onApplyFaceArtwork({
        templateId: target.templateId,
        panelId: target.panelId,
        surface: target.surface,
        record,
      });
    } else {
      onApplyPackedBottleLabel(target.modelId, record);
    }
    onClose();
  };

  const handleDeleteSaved = async (record: StoredArtwork) => {
    setBusy(true);
    try {
      await deleteArtwork(record.id);
      if (!mounted.current) return;
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
      if (initialRecord?.id === record.id) {
        selectSaved(undefined);
      }
      if (activeArtworkId === record.id) {
        if (isFace) {
          onRemoveFaceArtwork(target.panelId, target.surface);
        } else {
          onRemovePackedBottleLabel();
        }
      }
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Artwork could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveCurrent = async () => {
    setBusy(true);
    try {
      if (isFace) {
        await setArtworkSelection(scope);
        if (!mounted.current) return;
        onRemoveFaceArtwork(target.panelId, target.surface);
      } else {
        onRemovePackedBottleLabel();
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove artwork.");
    } finally {
      setBusy(false);
    }
  };

  const surfaceLabel = isFace ? (target.surface === "outside" ? "Outside" : "Inside") : "";
  const title = isFace
    ? `${target.label} · ${surfaceLabel}`
    : `${bottleModel?.name ?? target.label} · Label`;
  const subtitle = isFace
    ? `Independent artwork for ${target.label} (${surfaceLabel}) only — other faces remain untouched.`
    : target.packCount && target.packCount > 1
      ? `Position your label inside the dieline. Confirming updates all ${target.packCount} bottles in this tray.`
      : "Position your label inside the dieline to apply it to the packed bottle.";
  const badge = isFace
    ? `${surfaceLabel.toUpperCase()} · ${target.widthMm} × ${target.heightMm} mm`
    : target.packCount && target.packCount > 1
      ? `APPLIES TO ALL ${target.packCount} BOTTLES`
      : dieline.unit === "mm"
        ? `${dieline.width} × ${dieline.height} mm`
        : "BOTTLE LABEL";
  const savedHeading = isFace ? `${target.shortCode} (${surfaceLabel}) history` : "Bottle label history";
  const savedSubheading = isFace
    ? `Isolated artwork history for ${target.label} (${surfaceLabel}) only.`
    : `Isolated label history for ${bottleModel?.name ?? target.modelId} only.`;
  const savedEmptyText = isFace
    ? `Artworks you confirm for ${target.label} (${surfaceLabel}) will be saved here independently from other faces and bottles.`
    : `Labels you confirm for ${bottleModel?.name ?? "this bottle"} will be saved here independently from box faces.`;

  return (
    <ArtworkEditor
      initial={initialRecord}
      editorRevision={editorRevision}
      dieline={dieline}
      title={title}
      subtitle={subtitle}
      badge={badge}
      savedHeading={savedHeading}
      savedSubheading={savedSubheading}
      savedEmptyText={savedEmptyText}
      backgroundColor={isFace ? "transparent" : "white"}
      previewTintColor={isFace ? boardSurfaceColor : undefined}
      faceTint={isFace ? faceTint : undefined}
      defaultFaceTint={isFace ? boardSurfaceColor : undefined}
      onFaceTintChange={isFace ? onFaceTintChange : undefined}
      canRemove={hasCurrentArtwork}
      removeLabel={isFace ? `Remove from ${target.shortCode}` : "Reset tray bottle label"}
      onRemoveCurrent={() => void handleRemoveCurrent()}
      savedArtworks={records}
      savedThumbnails={thumbnails}
      selectedArtworkId={initialRecord?.id}
      savedLoading={loading}
      savedBusy={busy}
      savedError={error}
      onSelectSaved={(record) => selectSaved(record)}
      onEditSaved={(record) => selectSaved(record)}
      onDeleteSaved={(record) => void handleDeleteSaved(record)}
      onConfirm={handleConfirm}
      onClose={onClose}
    />
  );
}
