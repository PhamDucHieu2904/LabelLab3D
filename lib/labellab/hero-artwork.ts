import type { EnvironmentPresetId, StudioSpotLightConfig } from "@/lib/mockup/environment-presets";
import { createLocalArtwork } from "@/lib/labellab/local-artwork";

export type HeroLightMoodId = "studio" | "dramatic" | "daylight";

export interface HeroShowcaseScene {
  readonly id: string;
  readonly kind: "beverage" | "packaging";
  readonly modelId: string;
  readonly templateId?: string;
  readonly poster?: string;
  readonly shortVi: string;
  readonly shortEn: string;
  readonly badgeVi: string;
  readonly badgeEn: string;
  readonly specVi: string;
  readonly specEn: string;
  readonly studioHref: string;
  readonly accent: string;
  readonly stageGradient: string;
  readonly haloGradient: string;
  readonly refractionStops: readonly [string, string, string];
  readonly defaultEnvironment: EnvironmentPresetId;
  readonly spotLight: StudioSpotLightConfig;
  readonly displayScale: number;
  readonly labelOffset?: number;
}

export const HERO_SHOWCASE_SCENES: readonly HeroShowcaseScene[] = Object.freeze([
  {
    id: "basil-strawberry",
    kind: "beverage",
    modelId: "basil-strawberry",
    poster: "/models/bottles/glass-290-basil-poster.webp?v=thumb-v2",
    shortVi: "Thủy tinh",
    shortEn: "Glass",
    badgeVi: "Glass 290 mL",
    badgeEn: "Glass 290 mL",
    specVi: "Khúc xạ thực · Hạt é 3D",
    specEn: "Real Refraction · 3D Seeds",
    studioHref: "/studio?model=basil-strawberry#workspace",
    accent: "#ff6b9d",
    stageGradient:
      "radial-gradient(ellipse 78% 66% at 50% 45%, #7c1c46 0%, #420c26 52%, #1d0613 100%)",
    haloGradient:
      "radial-gradient(circle, rgba(255, 221, 234, 0.72) 0%, rgba(255, 118, 169, 0.34) 44%, transparent 74%)",
    refractionStops: ["#ffe7f0", "#c84678", "#35091e"],
    defaultEnvironment: "studio-original",
    spotLight: {
      enabled: true,
      intensity: 1.35,
      azimuthDeg: -38,
      elevationDeg: 44,
      color: "#ffe4ee",
      softness: 0.65,
    },
    displayScale: 1.12,
  },
  {
    id: "can-mango",
    kind: "beverage",
    modelId: "can-mango",
    poster: "/models/cans/posters/can-330.webp?v=thumb-v2",
    shortVi: "Lon 330",
    shortEn: "Can 330",
    badgeVi: "Can 330 mL",
    badgeEn: "Can 330 mL",
    specVi: "Kim loại PBR · In bọc 360°",
    specEn: "PBR Aluminum · 360° Wrap",
    studioHref: "/studio?model=can-mango#workspace",
    accent: "#ffb84d",
    stageGradient:
      "radial-gradient(ellipse 78% 66% at 50% 45%, #703414 0%, #3a1808 52%, #1a0a04 100%)",
    haloGradient:
      "radial-gradient(circle, rgba(255, 236, 198, 0.68) 0%, rgba(255, 158, 66, 0.32) 44%, transparent 74%)",
    refractionStops: ["#fff0d4", "#d97a2b", "#2a1005"],
    defaultEnvironment: "softbox-contrast",
    spotLight: {
      enabled: true,
      intensity: 1.45,
      azimuthDeg: -42,
      elevationDeg: 38,
      color: "#ffe7c2",
      softness: 0.58,
    },
    displayScale: 1.14,
  },
  {
    id: "pet-aloe",
    kind: "beverage",
    modelId: "pet-aloe",
    poster: "/models/bottles/pet-500-aloe-poster.webp?v=thumb-v2",
    shortVi: "PET 500",
    shortEn: "PET 500",
    badgeVi: "PET 500 mL",
    badgeEn: "PET 500 mL",
    specVi: "Nhựa PET trong · Thạch nha đam",
    specEn: "Clear PET · Aloe Pulp",
    studioHref: "/studio?model=pet-aloe#workspace",
    accent: "#5ce0a8",
    stageGradient:
      "radial-gradient(ellipse 78% 66% at 50% 45%, #165944 0%, #0b3327 52%, #051812 100%)",
    haloGradient:
      "radial-gradient(circle, rgba(210, 255, 236, 0.65) 0%, rgba(72, 214, 156, 0.3) 44%, transparent 74%)",
    refractionStops: ["#e8fff4", "#2f9e75", "#071f17"],
    defaultEnvironment: "daylight-window",
    spotLight: {
      enabled: true,
      intensity: 1.3,
      azimuthDeg: -36,
      elevationDeg: 46,
      color: "#fff4d8",
      softness: 0.66,
    },
    displayScale: 1.12,
    labelOffset: 38,
  },
  {
    id: "rigid-lid-base",
    kind: "packaging",
    modelId: "basil-strawberry",
    templateId: "rigid-lid-base",
    shortVi: "Hộp CAD",
    shortEn: "CAD Box",
    badgeVi: "Rigid Box 3D",
    badgeEn: "Rigid Box 3D",
    specVi: "Ép kim vàng · Dieline 1:1 mm",
    specEn: "Gold Foil · 1:1 mm CAD",
    studioHref: "/studio?domain=packaging&template=rigid-lid-base#workspace",
    accent: "#f3c978",
    stageGradient:
      "radial-gradient(ellipse 78% 66% at 50% 45%, #46264d 0%, #24132a 52%, #110915 100%)",
    haloGradient:
      "radial-gradient(circle, rgba(255, 232, 192, 0.52) 0%, rgba(212, 162, 92, 0.24) 44%, transparent 74%)",
    refractionStops: ["#f9e7cc", "#57325e", "#160c1a"],
    defaultEnvironment: "softbox-contrast",
    spotLight: {
      enabled: true,
      intensity: 1.55,
      azimuthDeg: -42,
      elevationDeg: 46,
      color: "#ffecd0",
      softness: 0.56,
    },
    displayScale: 0.96,
  },
]);

export function resolveHeroEnvironment(
  scene: HeroShowcaseScene,
  lightMood: HeroLightMoodId,
): { environment: EnvironmentPresetId; spotLight: StudioSpotLightConfig } {
  if (lightMood === "dramatic") {
    return {
      environment: "softbox-contrast",
      spotLight: {
        ...scene.spotLight,
        enabled: true,
        intensity: Math.min(2.1, scene.spotLight.intensity + 0.4),
        azimuthDeg: 142,
        elevationDeg: 32,
        softness: 0.45,
      },
    };
  }
  if (lightMood === "daylight") {
    return {
      environment: "daylight-window",
      spotLight: {
        ...scene.spotLight,
        enabled: true,
        intensity: 1.1,
        azimuthDeg: -26,
        elevationDeg: 58,
        color: "#ffffff",
        softness: 0.78,
      },
    };
  }
  return {
    environment: scene.defaultEnvironment,
    spotLight: scene.spotLight,
  };
}

// ---------------------------------------------------------------------------
// High-craft procedural studio label synthesizer (0 KB network overhead)
// ---------------------------------------------------------------------------

const labelArtworkCache = new Map<string, string>();

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawMicroBarcode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  const pattern = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2];
  const totalUnits = pattern.reduce((sum, n) => sum + n + 1, 0);
  const unit = width / totalUnits;
  let cursor = x;
  for (let i = 0; i < pattern.length; i += 1) {
    const barW = pattern[i] * unit;
    ctx.fillRect(cursor, y, Math.max(1, barW), height);
    cursor += barW + unit * (i % 2 === 0 ? 1.15 : 0.85);
  }
  ctx.restore();
}

function paintBasilStrawberryLabel(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Warm pearl-ivory luxury coated stock
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#fff8f6");
  bg.addColorStop(0.55, "#fff2f5");
  bg.addColorStop(1, "#fbe2ea");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Delicate vertical paper texture lines
  ctx.save();
  ctx.strokeStyle = "rgba(176, 48, 92, 0.035)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.restore();

  // Conical upper collar sweep (follows glass-290-screwcap.svg top curve)
  ctx.save();
  const topGrad = ctx.createLinearGradient(0, 0, w, h * 0.32);
  topGrad.addColorStop(0, "#7b0f3a");
  topGrad.addColorStop(0.5, "#c51955");
  topGrad.addColorStop(1, "#7b0f3a");
  ctx.fillStyle = topGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h * 0.24);
  ctx.quadraticCurveTo(w * 0.5, h * 0.4, 0, h * 0.24);
  ctx.closePath();
  ctx.fill();

  // Gold hairline accent following upper arc
  ctx.strokeStyle = "#e6bc7c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.252);
  ctx.quadraticCurveTo(w * 0.5, h * 0.412, w, h * 0.252);
  ctx.stroke();

  // Lower crimson curved base ribbon
  ctx.fillStyle = "#5c0b2b";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.85);
  ctx.quadraticCurveTo(w * 0.5, h * 0.99, w, h * 0.85);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Soft blush botanical halo behind center crest
  const cx = w * 0.5;
  const cy = h * 0.61;
  const halo = ctx.createRadialGradient(cx, cy, 12, cx, cy, w * 0.23);
  halo.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  halo.addColorStop(0.7, "rgba(255, 214, 227, 0.42)");
  halo.addColorStop(1, "rgba(255, 214, 227, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.23, 0, Math.PI * 2);
  ctx.fill();

  // Center editorial oval-rounded gold & berry medallion (proportioned cleanly for front 3/4 view)
  ctx.save();
  drawRoundedRect(ctx, cx - 172, cy - 126, 344, 240, 32);
  ctx.fillStyle = "rgba(255, 252, 253, 0.94)";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#d9a966";
  ctx.stroke();

  drawRoundedRect(ctx, cx - 162, cy - 116, 324, 220, 25);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(197, 25, 85, 0.34)";
  ctx.stroke();

  // Small ruby berry diamond crest at top of medallion
  ctx.fillStyle = "#cc1957";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 98);
  ctx.lineTo(cx + 11, cy - 85);
  ctx.lineTo(cx, cy - 72);
  ctx.lineTo(cx - 11, cy - 85);
  ctx.closePath();
  ctx.fill();

  // Eyebrow micro-copy
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#9d5a34";
  ctx.font = "700 14px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("ARTISAN BOTANICAL · NO. 01", cx, cy - 52);

  // Main luxury brand wordmark
  ctx.fillStyle = "#3f081e";
  ctx.font = "800 54px Georgia, 'Times New Roman', serif";
  ctx.fillText("HYPER", cx, cy + 2);

  // Vivid berry flavor pill
  drawRoundedRect(ctx, cx - 126, cy + 36, 252, 34, 17);
  const pillGrad = ctx.createLinearGradient(cx - 126, cy + 36, cx + 126, cy + 70);
  pillGrad.addColorStop(0, "#df1b60");
  pillGrad.addColorStop(1, "#9f0c41");
  ctx.fillStyle = pillGrad;
  ctx.fill();

  ctx.fillStyle = "#fff9fb";
  ctx.font = "700 16px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("STRAWBERRY BASIL", cx, cy + 53);

  // Fine footer metadata
  ctx.fillStyle = "#6e384e";
  ctx.font = "600 13.5px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("REAL BASIL SEEDS  ·  290 mL", cx, cy + 88);
  ctx.restore();

  // Left & right wrap wing craft accents (visible while orbiting 360°)
  ctx.save();
  ctx.fillStyle = "#6e384e";
  ctx.font = "700 15px 'Mona Sans', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("COLD INFUSED", 64, h * 0.56);
  ctx.fillStyle = "#996075";
  ctx.font = "500 13px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("Natural Fruit Juice", 64, h * 0.6);
  ctx.fillText("100% Real Basil Seeds", 64, h * 0.635);
  ctx.fillText("Serve Chilled · Shake Well", 64, h * 0.67);

  ctx.textAlign = "right";
  ctx.fillStyle = "#6e384e";
  ctx.font = "700 15px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("HYPERMOCKUP.COM", w - 64, h * 0.56);
  drawMicroBarcode(ctx, w - 188, h * 0.59, 124, 52, "#4a172b");
  ctx.restore();
}

function paintCanMangoLabel(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Radiant mango-tangerine to deep berry gradient wrapping seamlessly horizontally
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#ffce47");
  bg.addColorStop(0.42, "#ff8b2b");
  bg.addColorStop(0.82, "#d82b52");
  bg.addColorStop(1, "#700c34");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Bold sweeping abstract cream-gold diagonal ribbons (seamless wrap!)
  ctx.save();
  ctx.fillStyle = "rgba(255, 246, 224, 0.16)";
  for (let i = -1; i <= 3; i += 1) {
    ctx.beginPath();
    const bx = i * (w * 0.33);
    ctx.moveTo(bx, h);
    ctx.bezierCurveTo(bx + 140, h * 0.65, bx + 200, h * 0.3, bx + 380, 0);
    ctx.lineTo(bx + 460, 0);
    ctx.bezierCurveTo(bx + 280, h * 0.35, bx + 220, h * 0.7, bx + 80, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Top & bottom metallic gold trim stripes
  ctx.fillStyle = "#fff1c2";
  ctx.fillRect(0, 26, w, 6);
  ctx.fillStyle = "rgba(255, 241, 194, 0.45)";
  ctx.fillRect(0, h - 34, w, 4);

  // Center front graphic medallion (u = 0.5)
  const cx = w * 0.5;
  const cy = h * 0.49;

  // Radiant concentric sun rings
  ctx.save();
  for (let r = 215; r >= 155; r -= 28) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 246, 214, ${r === 155 ? 0.55 : 0.22})`;
    ctx.lineWidth = r === 155 ? 3 : 2;
    ctx.stroke();
  }

  // Luminous mango sun disc
  const sun = ctx.createRadialGradient(cx, cy - 22, 10, cx, cy, 132);
  sun.addColorStop(0, "#fff8dc");
  sun.addColorStop(0.58, "#ffd45c");
  sun.addColorStop(1, "#ff9724");
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(cx, cy, 132, 0, Math.PI * 2);
  ctx.fill();

  // Top curved pill badge
  drawRoundedRect(ctx, cx - 94, cy - 104, 188, 28, 14);
  ctx.fillStyle = "#3a0b1d";
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffdf85";
  ctx.font = "700 13px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("HYPER EDITION · 330 mL", cx, cy - 90);

  // Bold punchy display title (tightened for crisp 3/4 cylinder readability)
  ctx.fillStyle = "#36071a";
  ctx.font = "900 70px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("SOLAR", cx, cy - 16);

  // Tilted vibrant flavor banner
  ctx.save();
  ctx.translate(cx, cy + 48);
  ctx.rotate(-0.04);
  drawRoundedRect(ctx, -134, -28, 268, 54, 14);
  ctx.fillStyle = "#8a0c3e";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffe596";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 28px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("MANGO SPARK", 0, 2);
  ctx.restore();

  ctx.fillStyle = "#fff5dc";
  ctx.font = "700 14.5px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("COLD PRESSED TROPICAL JUICE", cx, cy + 118);
  ctx.restore();

  // Rear / side wrap craft details
  ctx.save();
  ctx.fillStyle = "rgba(255, 248, 228, 0.9)";
  ctx.font = "800 22px 'Mona Sans', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("100% REAL FRUIT", 76, h * 0.42);
  ctx.font = "600 15px 'Mona Sans', Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 245, 224, 0.78)";
  ctx.fillText("No Artificial Colors · Crisp Fizz", 76, h * 0.47);
  ctx.fillText("Best Served Ice Cold at 4°C", 76, h * 0.515);

  drawRoundedRect(ctx, w - 234, h * 0.38, 162, 108, 14);
  ctx.fillStyle = "rgba(54, 7, 26, 0.42)";
  ctx.fill();
  drawMicroBarcode(ctx, w - 216, h * 0.41, 126, 54, "#fff6de");
  ctx.fillStyle = "#ffe7a3";
  ctx.textAlign = "center";
  ctx.font = "700 13px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("330 mL · ALU CAN", w - 153, h * 0.515);
  ctx.restore();
}

function paintPetAloeLabel(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Crisp botanical ivory top + lush emerald wave bottom
  ctx.fillStyle = "#f7fcf9";
  ctx.fillRect(0, 0, w, h);

  const waveGrad = ctx.createLinearGradient(0, h * 0.52, w, h);
  waveGrad.addColorStop(0, "#0d5940");
  waveGrad.addColorStop(0.5, "#19805d");
  waveGrad.addColorStop(1, "#0d5940");
  ctx.fillStyle = waveGrad;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.68);
  ctx.bezierCurveTo(w * 0.25, h * 0.55, w * 0.75, h * 0.82, w, h * 0.68);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Soft translucent aloe leaf silhouettes flanking the centerpiece
  ctx.save();
  const drawLeaf = (lx: number, ly: number, rx: number, ry: number, angle: number, color: string) => {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -ry);
    ctx.quadraticCurveTo(rx, 0, 0, ry);
    ctx.quadraticCurveTo(-rx, 0, 0, -ry);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  drawLeaf(w * 0.34, h * 0.48, 34, 130, -0.42, "rgba(25, 138, 98, 0.14)");
  drawLeaf(w * 0.37, h * 0.52, 24, 100, -0.18, "rgba(25, 138, 98, 0.18)");
  drawLeaf(w * 0.66, h * 0.48, 34, 130, 0.42, "rgba(25, 138, 98, 0.14)");
  drawLeaf(w * 0.63, h * 0.52, 24, 100, 0.18, "rgba(25, 138, 98, 0.18)");
  ctx.restore();

  // Top emerald hairline & gold trim
  ctx.fillStyle = "#116649";
  ctx.fillRect(0, 0, w, 18);
  ctx.fillStyle = "#d9b36c";
  ctx.fillRect(0, 18, w, 4);

  // Centerpiece front panel (compactly proportioned so full crest fits cleanly on 3/4 PET face)
  const cx = w * 0.5;
  const cy = h * 0.46;
  ctx.save();
  drawRoundedRect(ctx, cx - 182, cy - 114, 364, 228, 24);
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#cfa55c";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#177a58";
  ctx.font = "700 14px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("HYPER BOTANICALS · MANGO ALOE", cx, cy - 70);

  ctx.fillStyle = "#093325";
  ctx.font = "800 66px Georgia, 'Times New Roman', serif";
  ctx.fillText("VERA", cx, cy - 8);

  drawRoundedRect(ctx, cx - 126, cy + 34, 252, 34, 17);
  ctx.fillStyle = "#126d4e";
  ctx.fill();
  ctx.fillStyle = "#f2fff8";
  ctx.font = "700 16px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("ALOE VERA PULP", cx, cy + 51);

  ctx.fillStyle = "#487060";
  ctx.font = "600 13.5px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("VITAMIN C  ·  REAL PULP  ·  500 mL", cx, cy + 88);
  ctx.restore();

  // Wrap-around left/right minimal details
  ctx.save();
  ctx.fillStyle = "#0f4e39";
  ctx.font = "700 16px 'Mona Sans', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("NATURAL HYDRATION", 64, h * 0.38);
  ctx.fillStyle = "#4c7868";
  ctx.font = "500 14px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("Gentle aloe chunks · Crisp finish", 64, h * 0.46);
  ctx.fillText("Recyclable PET · 500 mL", 64, h * 0.53);

  drawMicroBarcode(ctx, w - 196, h * 0.34, 132, 58, "#0c3d2d");
  ctx.fillStyle = "#4c7868";
  ctx.textAlign = "right";
  ctx.font = "700 13px 'Mona Sans', Arial, sans-serif";
  ctx.fillText("HYPERMOCKUP STUDIO", w - 64, h * 0.53);
  ctx.restore();
}

/**
 * Synthesize (and cache) an editorial studio label texture Data URL for a hero beverage model.
 * Returns `undefined` during SSR so server renders stay pure and lightweight.
 */
export function getHeroLabelArtworkUrl(sceneId: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const cached = labelArtworkCache.get(sceneId);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  let w = 1024;
  let h = 675;
  if (sceneId === "can-mango") {
    w = 1280;
    h = 675;
  } else if (sceneId === "pet-aloe") {
    w = 1280;
    h = 448;
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  if (sceneId === "basil-strawberry") {
    paintBasilStrawberryLabel(ctx, w, h);
  } else if (sceneId === "can-mango") {
    paintCanMangoLabel(ctx, w, h);
  } else if (sceneId === "pet-aloe") {
    paintPetAloeLabel(ctx, w, h);
  } else {
    return undefined;
  }

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  if (!base64) return undefined;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  // Register via createLocalArtwork so viewer-config's strict `isLocalArtwork` security gate accepts it.
  const blobUrl = createLocalArtwork(new Blob([bytes], { type: "image/png" }));
  labelArtworkCache.set(sceneId, blobUrl);
  return blobUrl;
}
