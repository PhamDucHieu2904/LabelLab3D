import * as THREE from 'three';
import type { DimensionTripleMm, PackagingPartGroup } from '../types';

export interface DimensionOverlay3D {
  readonly group: THREE.Group;
  update(
    bounds: THREE.Box3,
    displayDims: DimensionTripleMm,
    options: { visible: boolean; highlight?: PackagingPartGroup | null; modeLabel: string },
  ): void;
  dispose(): void;
}

function makePillSpriteTexture(text: string, highlighted: boolean): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const padX = 24;
  const padY = 18;
  const w = canvas.width - padX * 2;
  const h = canvas.height - padY * 2;
  const r = h * 0.5;

  ctx.beginPath();
  ctx.roundRect(padX, padY, w, h, r);
  ctx.fillStyle = highlighted ? '#2563eb' : 'rgba(255, 255, 255, 0.96)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = highlighted ? '#1d4ed8' : 'rgba(41, 44, 48, 0.24)';
  ctx.stroke();

  ctx.font = '650 46px "Mona Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = highlighted ? '#ffffff' : '#1f2328';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Technical 3D CAD dimension callout overlay (`L: 320 mm`, `W: 200 mm`, `H: 60 mm`)
 * matching architectural & packaging mockup precision (like Pacdora's ruler toggle).
 */
export function createDimensionOverlay3D(): DimensionOverlay3D {
  const group = new THREE.Group();
  group.name = 'packaging-dimensions-3d';

  const lineGeo = new THREE.BufferGeometry();
  const lineMat = new THREE.LineBasicMaterial({
    color: '#475569',
    transparent: true,
    opacity: 0.72,
    depthTest: false,
  });
  const highlightLineGeo = new THREE.BufferGeometry();
  const highlightLineMat = new THREE.LineBasicMaterial({
    color: '#2563eb',
    transparent: true,
    opacity: 0.96,
    depthTest: false,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.renderOrder = 20;
  const highlightLines = new THREE.LineSegments(highlightLineGeo, highlightLineMat);
  highlightLines.renderOrder = 21;
  group.add(lines, highlightLines);

  const makeSprite = () => {
    const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 22;
    group.add(sprite);
    return sprite;
  };

  const labelL = makeSprite();
  const labelW = makeSprite();
  const labelH = makeSprite();
  let lastKey = '';

  const setSpriteText = (sprite: THREE.Sprite, text: string, highlighted: boolean) => {
    const tex = makePillSpriteTexture(text, highlighted);
    const prev = sprite.material.map;
    sprite.material.map = tex;
    sprite.material.needsUpdate = true;
    prev?.dispose();
  };

  const pushDimSegment = (
    target: number[],
    a: THREE.Vector3,
    b: THREE.Vector3,
    tickDir: THREE.Vector3,
    tickLen: number,
  ) => {
    // Main dimension line
    target.push(a.x, a.y, a.z, b.x, b.y, b.z);
    // Extension ticks at both endpoints
    target.push(
      a.x - tickDir.x * tickLen, a.y - tickDir.y * tickLen, a.z - tickDir.z * tickLen,
      a.x + tickDir.x * tickLen, a.y + tickDir.y * tickLen, a.z + tickDir.z * tickLen,
    );
    target.push(
      b.x - tickDir.x * tickLen, b.y - tickDir.y * tickLen, b.z - tickDir.z * tickLen,
      b.x + tickDir.x * tickLen, b.y + tickDir.y * tickLen, b.z + tickDir.z * tickLen,
    );
  };

  return {
    group,
    update(bounds, displayDims, options) {
      group.visible = options.visible;
      if (!options.visible || bounds.isEmpty()) return;

      const size = bounds.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.05);
      const offset = Math.max(0.016, maxDim * 0.09);
      const tick = Math.max(0.005, maxDim * 0.024);
      const yBase = bounds.min.y;

      const normalPts: number[] = [];
      const hiPts: number[] = [];

      // Length (X) along front bottom edge
      const lA = new THREE.Vector3(bounds.min.x, yBase, bounds.max.z + offset);
      const lB = new THREE.Vector3(bounds.max.x, yBase, bounds.max.z + offset);
      const lHi = options.highlight === 'length';
      pushDimSegment(lHi ? hiPts : normalPts, lA, lB, new THREE.Vector3(0, 0, 1), tick);

      // Width (Z) along right bottom edge
      const wA = new THREE.Vector3(bounds.max.x + offset, yBase, bounds.min.z);
      const wB = new THREE.Vector3(bounds.max.x + offset, yBase, bounds.max.z);
      const wHi = options.highlight === 'width';
      pushDimSegment(wHi ? hiPts : normalPts, wA, wB, new THREE.Vector3(1, 0, 0), tick);

      // Height (Y) along right-front vertical corner — measure true box height `displayDims.height`
      // (capped by actual folded height) so an open hinged lid does not distort the wall height leader!
      const targetHeightM = Math.min(size.y, Math.max(0.008, displayDims.height * 0.001));
      const showHeight = size.y > 0.012;
      const hA = new THREE.Vector3(bounds.max.x + offset, bounds.min.y, bounds.max.z + offset * 0.35);
      const hB = new THREE.Vector3(bounds.max.x + offset, bounds.min.y + targetHeightM, bounds.max.z + offset * 0.35);
      const hHi = options.highlight === 'height';
      if (showHeight) {
        pushDimSegment(hHi ? hiPts : normalPts, hA, hB, new THREE.Vector3(1, 0, 0), tick);
      }

      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(normalPts, 3));
      lineGeo.computeBoundingSphere();
      highlightLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(hiPts, 3));
      highlightLineGeo.computeBoundingSphere();

      const scaleW = Math.max(0.055, maxDim * 0.24);
      const scaleH = scaleW * (92 / 360);

      labelL.position.set((bounds.min.x + bounds.max.x) * 0.5, yBase, bounds.max.z + offset * 1.48);
      labelL.scale.set(scaleW, scaleH, 1);

      labelW.position.set(bounds.max.x + offset * 1.55, yBase, (bounds.min.z + bounds.max.z) * 0.5);
      labelW.scale.set(scaleW, scaleH, 1);

      labelH.visible = showHeight;
      labelH.position.set(bounds.max.x + offset * 1.58, bounds.min.y + targetHeightM * 0.5, bounds.max.z + offset * 0.35);
      labelH.scale.set(scaleW, scaleH, 1);

      const key = `${Math.round(displayDims.length * 10)}|${Math.round(displayDims.width * 10)}|${Math.round(displayDims.height * 10)}|${options.highlight ?? ''}`;
      if (key !== lastKey) {
        lastKey = key;
        const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
        setSpriteText(labelL, `L: ${fmt(displayDims.length)} mm`, lHi);
        setSpriteText(labelW, `W: ${fmt(displayDims.width)} mm`, wHi);
        setSpriteText(labelH, `H: ${fmt(displayDims.height)} mm`, hHi);
      }
    },
    dispose() {
      lineGeo.dispose();
      lineMat.dispose();
      highlightLineGeo.dispose();
      highlightLineMat.dispose();
      for (const s of [labelL, labelW, labelH]) {
        s.material.map?.dispose();
        s.material.dispose();
      }
    },
  };
}
