"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Blob decoding and modal mounting are external synchronization. */

import { createPortal } from "react-dom";
import { FileImage, Pencil, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  fitArtwork,
  normalizeArtworkTransform,
  panArtwork,
  resizeArtwork,
  type ArtworkDieline,
  type ArtworkHandle,
  type ArtworkTransform,
} from "@/lib/labellab/artwork-transform";
import { renderArtworkCrop } from "@/lib/labellab/artwork-canvas";
import type { StoredArtwork } from "@/lib/labellab/artwork-store";
import {
  ARTWORK_EDITOR_HEIGHT,
  ARTWORK_EDITOR_PREVIEW_RATIO,
  ARTWORK_EDITOR_SAVED_RATIO,
  ARTWORK_EDITOR_WIDTH,
  getArtworkEditorScale,
  normalizeArtworkPointerDelta,
} from "@/lib/labellab/artwork-editor-layout";
import styles from "./ArtworkEditor.module.css";

export interface ArtworkEditorResult {
  name: string;
  source: Blob;
  preview: Blob;
  width: number;
  height: number;
  transform: ArtworkTransform;
  dieline: ArtworkDieline;
}

export interface ArtworkEditorProps {
  initial?: StoredArtwork;
  dieline: ArtworkDieline;
  savedArtworks?: readonly StoredArtwork[];
  savedThumbnails?: Record<string, string>;
  selectedArtworkId?: string;
  editorRevision?: number;
  savedLoading?: boolean;
  savedBusy?: boolean;
  savedError?: string;
  onSelectSaved?: (record: StoredArtwork) => void;
  onEditSaved?: (record: StoredArtwork) => void;
  onDeleteSaved?: (record: StoredArtwork) => void;
  onConfirm: (result: ArtworkEditorResult) => Promise<void>;
  onClose: () => void;
}

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_EDGE = 8192;
const MAX_PIXELS = 32_000_000;
const HANDLES: ArtworkHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function readImage(blob: Blob): Promise<{ image: HTMLImageElement; width: number; height: number; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new Error("The selected file could not be decoded."));
        return;
      }
      resolve({ image, width: image.naturalWidth, height: image.naturalHeight, url });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected file could not be decoded."));
    };
    image.src = url;
  });
}

function cloneTransform(t: ArtworkTransform): ArtworkTransform {
  return { x: t.x, y: t.y, width: t.width, height: t.height };
}

export default function ArtworkEditor({ initial, dieline, savedArtworks = [], savedThumbnails = {},
  selectedArtworkId, editorRevision = 0, savedLoading = false, savedBusy = false, savedError, onSelectSaved, onEditSaved,
  onDeleteSaved, onConfirm, onClose }: ArtworkEditorProps) {
  const frameWidth = dieline.width;
  const frameHeight = dieline.height;
  const [source, setSource] = useState<Blob | null>(initial?.source ?? null);
  const [decodedSource, setDecodedSource] = useState<Blob | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: initial?.width ?? 0, height: initial?.height ?? 0 });
  const [transform, setTransform] = useState<ArtworkTransform>(() => cloneTransform(initial?.transform ?? { x: 0, y: 0, width: 1, height: 1 }));
  const [name, setName] = useState(initial?.name ?? "Artwork");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const blocked = pending || savedBusy;
  const [mounted, setMounted] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [viewport, setViewport] = useState({ width: 1920, height: 960 });
  const initialSource = initial?.source;
  const initialTransform = initial?.transform;
  const initialDieline = initial?.dieline;
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; start: ArtworkTransform; handle?: ArtworkHandle } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const fileGeneration = useRef(0);
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(pending);
  const editorRevisionRef = useRef(editorRevision);
  useEffect(() => { onCloseRef.current = onClose; pendingRef.current = blocked; }, [onClose, blocked]);

  useEffect(() => {
    if (editorRevisionRef.current === editorRevision) return;
    editorRevisionRef.current = editorRevision;
    fileGeneration.current += 1;
    dragRef.current = null;
    setImage(null);
    setDecodedSource(null);
    setSourceUrl(null);
    setSource(initial?.source ?? null);
    setDimensions({ width: initial?.width ?? 0, height: initial?.height ?? 0 });
    setTransform(cloneTransform(initial?.transform ?? { x: 0, y: 0, width: 1, height: 1 }));
    setName(initial?.name ?? "Artwork");
    setError("");
  }, [editorRevision, initial]);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    updateViewport();
    setMounted(true);
    previousFocus.current = document.activeElement as HTMLElement | null;
    window.addEventListener("resize", updateViewport);
    return () => { window.removeEventListener("resize", updateViewport); previousFocus.current?.focus?.(); };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!source) { setImage(null); setSourceUrl(null); setDecodedSource(null); setDecoding(false); return; }
    setDecoding(true); setDecodedSource(null); setImage(null);
    readImage(source).then(result => {
      if (!alive) { URL.revokeObjectURL(result.url); return; }
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = result.url;
      setSourceUrl(result.url);
      setImage(result.image);
      setDecodedSource(source);
      setDecoding(false);
      setDimensions({ width: result.width, height: result.height });
      if (!initialSource || source !== initialSource || initialDieline?.width !== frameWidth || initialDieline?.height !== frameHeight) setTransform(fitArtwork(result.width, result.height, { width: frameWidth, height: frameHeight }, "contain"));
      else if (initialTransform) setTransform(cloneTransform(initialTransform));
    }).catch(e => { if (alive) { setDecoding(false); setError(e instanceof Error ? e.message : "Unable to read artwork."); } });
    return () => { alive = false; };
  }, [source, frameWidth, frameHeight, initialSource, initialTransform, initialDieline?.width, initialDieline?.height, editorRevision]);

  useEffect(() => () => { if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current); }, []);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (!node.open) node.showModal();
    const focusable = () => Array.from(node.querySelectorAll<HTMLElement>('button,input,[tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute("disabled"));
    const first = focusable()[0]; first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key === "Tab") {
        const list = focusable(); if (!list.length) return;
        const idx = list.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey ? (idx <= 0 ? list.length - 1 : idx - 1) : (idx === list.length - 1 ? 0 : idx + 1);
        event.preventDefault(); list[next].focus();
      }
    };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [mounted]);

  useEffect(() => {
    const node = dialogRef.current; if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    const workspace = node.querySelector(`.${styles.workspace}`); if (workspace) observer.observe(workspace);
    return () => observer.disconnect();
  }, [mounted]);

  const frameStyle = useMemo(() => {
    const aspect = dieline.width / Math.max(dieline.height, 0.0001);
    const maxW = Math.max(120, stageSize.width * 0.74), maxH = Math.max(120, stageSize.height * 0.76);
    let width = maxW, height = width / aspect;
    if (height > maxH) { height = maxH; width = height * aspect; }
    return { width, height };
  }, [dieline, stageSize]);

  const chooseFile = useCallback(async (file?: File) => {
    if (!file || blocked) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPG, or WebP image."); return; }
    if (file.size > MAX_BYTES) { setError("Images must be 15 MB or smaller."); return; }
    const generation = ++fileGeneration.current;
    setDecoding(true);
    try {
      const result = await readImage(file);
      URL.revokeObjectURL(result.url);
      if (generation !== fileGeneration.current) return;
      if (result.width > MAX_EDGE || result.height > MAX_EDGE || result.width * result.height > MAX_PIXELS) throw new Error("Images must be no larger than 8192 × 8192 and 32 megapixels.");
      setImage(null); setDecodedSource(null); setSource(file); setName(file.name.replace(/\.[^.]+$/, "") || "Artwork");
    } catch (e) { if (generation === fileGeneration.current) { setDecoding(false); setError(e instanceof Error ? e.message : "Unable to read artwork."); } }
  }, [blocked]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; };
  const onDrop = (event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); if (!blocked) void chooseFile(event.dataTransfer.files?.[0]); };

  const beginDrag = (event: ReactPointerEvent, handle?: ArtworkHandle) => {
    if (!image || blocked) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, start: cloneTransform(transform), handle };
  };
  const moveDrag = (event: ReactPointerEvent) => {
    const drag = dragRef.current; if (blocked || !drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    const rendered = frameRef.current?.getBoundingClientRect();
    const { x: nx, y: ny } = normalizeArtworkPointerDelta(dx, dy,
      rendered?.width ?? frameStyle.width, rendered?.height ?? frameStyle.height);
    setTransform(normalizeArtworkTransform(drag.handle ? resizeArtwork(drag.start, drag.handle, nx, ny, event.shiftKey) : panArtwork(drag.start, nx, ny)));
  };
  const endDrag = () => { dragRef.current = null; };

  const resetFit = (mode: "contain" | "cover") => !blocked && image && setTransform(fitArtwork(dimensions.width, dimensions.height, dieline, mode));
  const updateNumber = (key: keyof ArtworkTransform, value: string) => { const n = Number(value); if (!blocked && Number.isFinite(n)) setTransform(normalizeArtworkTransform({ ...transform, [key]: n / 100 })); };
  const onKeyMove = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!image || blocked) return; const step = event.shiftKey ? 0.01 : 0.0025;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0; const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0; setTransform(panArtwork(transform, dx, dy)); }
  };

  const editorScale = getArtworkEditorScale(viewport.width, viewport.height);
  const editorStyle = {
    "--editor-scale": String(editorScale),
    "--editor-preview-ratio": `${ARTWORK_EDITOR_PREVIEW_RATIO}fr`,
    "--editor-saved-ratio": `${ARTWORK_EDITOR_SAVED_RATIO}fr`,
    "--editor-width": `${ARTWORK_EDITOR_WIDTH}px`,
    "--editor-height": `${ARTWORK_EDITOR_HEIGHT}px`,
  } as CSSProperties;

  const confirm = async () => {
    if (!source || source !== decodedSource || !image || decoding || pending || savedBusy) return;
    setPending(true); setError("");
    try {
      const preview = await renderArtworkCrop(image, transform, dieline);
      await onConfirm({ name: name.trim() || "Artwork", source, preview, width: dimensions.width, height: dimensions.height, transform: normalizeArtworkTransform(transform), dieline });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save artwork."); setPending(false); }
  };

  if (!mounted) return null;
  return createPortal(
    <div className={styles.backdrop} role="presentation" style={editorStyle}>
      <dialog className={styles.dialog} aria-labelledby="artwork-editor-title" ref={dialogRef} onCancel={event => { event.preventDefault(); if (!blocked) onClose(); }}>
        <header className={styles.header}><div><h2 id="artwork-editor-title">Choose artwork</h2><p>Position your design inside the label frame.</p></div><button type="button" className={styles.close} aria-label="Close" onClick={onClose} disabled={blocked}>×</button></header>
        <div className={styles.editorBody}>
          <section className={styles.previewPane} aria-label="Artwork preview">
            <div className={styles.workspace} onDragOver={e => e.preventDefault()} onDrop={onDrop} aria-disabled={blocked}><div className={styles.hint}>Drag to move · Shift + resize to keep proportions <span>{dieline.unit === "mm" ? `${dieline.width} × ${dieline.height} mm` : "Provisional frame · 3:2"}</span></div>
              <div className={styles.frame} ref={frameRef} style={frameStyle}>
            {dieline.guideSrc && <img className={styles.dielineGuide} src={dieline.guideSrc} alt="" aria-hidden="true" />}
            {image && sourceUrl ? <>
              <img className={styles.image} src={sourceUrl} alt="Artwork being positioned" draggable={false} style={{ left: `${transform.x * 100}%`, top: `${transform.y * 100}%`, width: `${transform.width * 100}%`, height: `${transform.height * 100}%` }} onPointerDown={e => beginDrag(e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={onKeyMove} tabIndex={0} />
              <div className={styles.overlayTop} /><div className={styles.overlayBottom} /><div className={styles.overlayLeft} /><div className={styles.overlayRight} />
              <div className={styles.selection} style={{ left: `${transform.x * 100}%`, top: `${transform.y * 100}%`, width: `${transform.width * 100}%`, height: `${transform.height * 100}%` }} aria-label="Artwork position" tabIndex={-1}>
                {HANDLES.map(handle => <button key={handle} type="button" aria-label={`Resize ${handle}`} className={`${styles.handle} ${styles[handle]}`} onPointerDown={e => beginDrag(e, handle)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} disabled={blocked} />)}
              </div>
            </> : <label className={styles.empty}><span className={styles.plus}>+</span><strong>Drop artwork here</strong><span>PNG, JPG, or WebP up to 15 MB</span><input ref={inputRef} type="file" aria-label="Add artwork to frame" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} disabled={blocked} /></label>}
              </div>
            </div>
          </section>
          <aside className={styles.savedPane} aria-label="Saved artworks" aria-busy={savedLoading}>
            <div className={styles.savedHeading}><div><h3>Saved artworks</h3><p>Reuse a label you have already mocked up.</p></div><span>{savedArtworks.length}</span></div>
            {savedLoading ? <p className={styles.savedEmpty}>Loading artworks…</p> : savedArtworks.length ?
              <ul className={styles.savedList}>{savedArtworks.map(record => <li key={record.id} className={styles.savedItem}>
                <button type="button" className={styles.savedSelect} aria-label={`Preview ${record.name}`} aria-pressed={selectedArtworkId === record.id}
                  disabled={pending || savedBusy} onClick={() => onSelectSaved?.(record)}>
                  <span className={styles.savedThumbnail}>{savedThumbnails[record.id] && <img src={savedThumbnails[record.id]} alt="" />}</span>
                  <span><strong>{record.name}</strong><small>{record.width} × {record.height} px</small></span>
                </button>
                <div className={styles.savedActions}>
                  <button type="button" aria-label={`Edit ${record.name}`} title="Edit crop" disabled={pending || savedBusy} onClick={() => onEditSaved?.(record)}><Pencil size={16} aria-hidden="true" /></button>
                  <button type="button" aria-label={`Delete ${record.name}`} title="Delete saved artwork" disabled={pending || savedBusy} onClick={() => onDeleteSaved?.(record)}><Trash2 size={16} aria-hidden="true" /></button>
                </div>
              </li>)}</ul> : <div className={styles.savedEmpty}><FileImage size={36} strokeWidth={1.25} aria-hidden="true" /><strong>No saved artworks yet</strong><p>Labels you confirm will appear here, ready for your next mockup.</p></div>}
            {savedError && <p className={styles.error} role="alert">{savedError}</p>}
            <p className={styles.savedNote}>Stored in this browser only.</p>
          </aside>
        </div>
        {decoding && <div className={styles.status}>Decoding artwork…</div>}{error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.controls}>{image && <><label>Name<input value={name} disabled={blocked} onChange={e => setName(e.target.value)} /></label>{(["x", "y", "width", "height"] as const).map(key => <label key={key}>{key.toUpperCase()} %<input type="number" min={key === "width" || key === "height" ? 0.01 : -100} max={key === "width" || key === "height" ? 10000 : 100} step={0.1} value={(transform[key] * 100).toFixed(1)} disabled={blocked} onChange={e => updateNumber(key, e.target.value)} /></label>)}<button type="button" disabled={blocked} onClick={() => resetFit("contain")}>Fit</button><button type="button" disabled={blocked} onClick={() => resetFit("cover")}>Fill</button></>}</div>
        <footer className={styles.footer}><label className={styles.chooseButton}>Choose artwork<input type="file" aria-label="Choose artwork file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} disabled={blocked} /></label><button className={styles.confirm} type="button" onClick={confirm} disabled={!image || source !== decodedSource || decoding || blocked}>{pending ? "Saving…" : "Confirm"}</button></footer>
      </dialog>
    </div>, document.body,
  );
}












