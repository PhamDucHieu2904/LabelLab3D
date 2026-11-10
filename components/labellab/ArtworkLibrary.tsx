"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import ArtworkEditor, { type ArtworkEditorResult } from "./ArtworkEditor";
import { getArtworkDieline } from "@/lib/labellab/artwork-transform";
import { getArtworkEditorInitial } from "@/lib/labellab/artwork-editor-state";
import {
  deleteArtwork, getArtworkSelection, listArtworks, saveArtwork, setArtworkSelection,
  type StoredArtwork,
} from "@/lib/labellab/artwork-store";
import styles from "./ArtworkLibrary.module.css";

type Props = {
  modelId: string;
  disabled: boolean;
  resetSignal: number;
  onApply: (blob: Blob, name: string) => void;
  onClear: () => void;
  onEditorStateChange?: (open: boolean) => void;
};

export default function ArtworkLibrary({ modelId, disabled, resetSignal, onApply, onClear, onEditorStateChange }: Props) {
  const [records, setRecords] = useState<StoredArtwork[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<string>();
  const [editor, setEditor] = useState<{ initial?: StoredArtwork; revision: number }>();
  const editorOpen = editor !== undefined;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const callbacks = useRef({ onApply, onClear, onEditorStateChange });
  const mounted = useRef(true);
  const previousReset = useRef(resetSignal);
  const dieline = useMemo(() => getArtworkDieline(modelId), [modelId]);
  useEffect(() => { callbacks.current = { onApply, onClear, onEditorStateChange }; }, [onApply, onClear, onEditorStateChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    onEditorStateChange?.(editorOpen);
    return () => { if (editorOpen) onEditorStateChange?.(false); };
  }, [editorOpen, onEditorStateChange]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listArtworks(), getArtworkSelection(modelId)]).then(async ([items, id]) => {
      if (cancelled) return;
      setRecords(items);
      const selected = items.find(item => item.id === id);
      if (id && !selected) await setArtworkSelection(modelId);
      if (cancelled) return;
      setSelection(selected?.id);
      if (selected) callbacks.current.onApply(selected.preview, selected.name);
      setError("");
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Saved artworks could not be loaded.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [modelId]);

  useEffect(() => {
    const urls = Object.fromEntries(records.map(record => [record.id, URL.createObjectURL(record.preview)]));
    // Blob URLs are display-only and never enter persisted scene settings.
    const frame = requestAnimationFrame(() => setThumbnails(urls));
    return () => {
      cancelAnimationFrame(frame);
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [records]);

  useEffect(() => {
    if (previousReset.current === resetSignal) return;
    previousReset.current = resetSignal;
    void setArtworkSelection(modelId).then(() => setSelection(undefined)).catch(reason => {
      setError(reason instanceof Error ? reason.message : "The saved selection could not be cleared.");
    });
  }, [modelId, resetSignal]);

  const closeEditor = () => {
    setEditor(undefined);
  };

  const openEditorWith = (initial?: StoredArtwork) => {
    setEditor(previous => ({ initial, revision: (previous?.revision ?? 0) + 1 }));
  };

  const confirm = async (result: ArtworkEditorResult) => {
    const now = Date.now();
    const record: StoredArtwork = {
      ...result, id: editor?.initial?.id ?? crypto.randomUUID(),
      createdAt: editor?.initial?.createdAt ?? now, updatedAt: now,
    };
    await saveArtwork(record);
    await setArtworkSelection(modelId, record.id);
    if (!mounted.current) return;
    setRecords(items => [record, ...items.filter(item => item.id !== record.id)]);
    setSelection(record.id);
    callbacks.current.onApply(record.preview, record.name);
    setError("");
    closeEditor();
  };

  const removeRecord = async (record: StoredArtwork) => {
    setBusy(true);
    try {
      await deleteArtwork(record.id);
      if (!mounted.current) return;
      setRecords(items => items.filter(item => item.id !== record.id));
      if (editor?.initial?.id === record.id) openEditorWith();
      if (selection === record.id) { setSelection(undefined); callbacks.current.onClear(); }
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Artwork could not be deleted."); }
    finally { setBusy(false); }
  };

  const openEditor = () => {
    openEditorWith(getArtworkEditorInitial(records, selection));
  };

  return <div className={styles.library}>
    <button className={styles.choose} type="button" disabled={disabled || busy || loading} onClick={openEditor}
      aria-haspopup="dialog" aria-expanded={editorOpen}>
      <Upload size={16} aria-hidden="true" /> Add your artwork
    </button>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {editor && <ArtworkEditor initial={editor.initial} editorRevision={editor.revision} dieline={dieline}
      savedArtworks={records} savedThumbnails={thumbnails} selectedArtworkId={editor.initial?.id}
      savedLoading={loading} savedBusy={busy} savedError={error}
      onSelectSaved={record => openEditorWith(record)} onEditSaved={record => openEditorWith(record)}
      onDeleteSaved={record => void removeRecord(record)} onConfirm={confirm} onClose={closeEditor} />}
  </div>;
}
