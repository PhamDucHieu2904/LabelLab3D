import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BASE_URL = process.env.STUDIO_URL || 'http://127.0.0.1:3005';
const CDP_PORT = Number(process.env.CDP_PORT || 9229);

const TARGET_SIZE = 512;
const MAX_DRAW_H = 440; // 86% vertical fill, crisp 36px top/bottom margin
const MAX_DRAW_W = 260; // Balanced visual weight so short wide cans look proportional beside slender bottles
const WEBP_QUALITY = 0.86;

/** All 31 beverage models and their canonical poster WebP output paths. */
const POSTER_TARGETS = [
  // Glass Bottles (10)
  { id: 'glass-280-latte', out: 'models/bottles/glass-280-latte-poster.webp' },
  { id: 'glass-280-short-latte', out: 'models/bottles/glass-280-short-latte-poster.webp' },
  { id: 'basil-strawberry', out: 'models/bottles/glass-290-basil-poster.webp', runtimeMediaId: 'poster-glass-290-basil' },
  { id: 'glass-290-chia', out: 'models/bottles/glass-290-chia-poster.webp' },
  { id: 'glass-290-milk', out: 'models/bottles/glass-290-milk-poster.webp' },
  { id: 'glass-290-pullcap-basil', out: 'models/bottles/glass-290-pullcap-basil-poster.webp' },
  { id: 'glass-290-pullcap-chia', out: 'models/bottles/glass-290-pullcap-chia-poster.webp' },
  { id: 'glass-290-pullcap-milk', out: 'models/bottles/glass-290-pullcap-milk-poster.webp' },
  { id: 'glass-300-milk', out: 'models/bottles/glass-300-milk-poster.webp' },
  { id: 'glass-485-milk', out: 'models/bottles/glass-485-milk-poster.webp' },

  // Aluminum Cans (6)
  { id: 'can-180', out: 'models/cans/posters/can-180.webp' },
  { id: 'can-250-short', out: 'models/cans/posters/can-250-short.webp' },
  { id: 'can-250-slim', out: 'models/cans/posters/can-250.webp' },
  { id: 'can-320', out: 'models/cans/posters/can-320.webp' },
  {
    id: 'can-mango',
    out: 'models/cans/posters/can-330.webp',
    mirrorOut: 'catalog/media/221caa4284916f99a4f787a308a42e7ef19f3717e590127ece37019f0a7023c3.webp',
    runtimeMediaId: 'catalog-webp-221caa4284916f99a4f787a3',
  },
  { id: 'can-500', out: 'models/cans/posters/can-500.webp' },

  // PET Bottles (9)
  { id: 'pet-nata-watermelon', out: 'models/bottles/pet-320-nata-poster.webp', runtimeMediaId: 'poster-pet-320-nata' },
  { id: 'pet-320-full-nata', out: 'models/bottles/pet-320-full-nata-poster.webp' },
  { id: 'pet-325-juice', out: 'models/bottles/pet-325-juice-poster.webp' },
  { id: 'pet-330-energy', out: 'models/bottles/pet-330-energy-poster.webp' },
  { id: 'pet-350-juice', out: 'models/bottles/pet-350-juice-poster.webp' },
  { id: 'pet-aloe', out: 'models/bottles/pet-500-aloe-poster.webp', runtimeMediaId: 'poster-pet-500-aloe' },
  { id: 'pet-1000-juice', out: 'models/bottles/pet-1000-juice-poster.webp' },
  { id: 'pet-1000-short-juice', out: 'models/bottles/pet-1000-short-juice-poster.webp' },
  { id: 'pet-1500-juice', out: 'models/bottles/pet-1500-juice-poster.webp' },

  // PP Bottles (6)
  { id: 'pp-500', out: 'models/bottles/pp-500-poster.webp' },
  { id: 'pp-500-2', out: 'models/bottles/pp-500-2-poster.webp' },
  { id: 'pp-1000', out: 'models/bottles/pp-1000-poster.webp' },
  { id: 'pp-1000-2', out: 'models/bottles/pp-1000-2-poster.webp' },
  { id: 'pp-1250', out: 'models/bottles/pp-1250-poster.webp' },
  { id: 'pp-2000', out: 'models/bottles/pp-2000-poster.webp' },
];

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('No Chromium/Chrome executable found.');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evalAsync(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description ||
          res.exceptionDetails.text ||
          'Browser evaluation failed',
      );
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

async function waitForCdpTarget(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const pages = await res.json();
        const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error('Timed out waiting for headless Chrome DevTools endpoint.');
}

async function main() {
  const onlyArg = process.argv[2];
  const targets = onlyArg
    ? POSTER_TARGETS.filter((t) => onlyArg.split(',').includes(t.id))
    : POSTER_TARGETS;

  if (!targets.length) {
    throw new Error(`No matching targets for filter: ${onlyArg}`);
  }

  // Verify local dev server is reachable before launching browser.
  const ping = await fetch(`${BASE_URL}/studio`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!ping || !ping.ok) {
    throw new Error(`Dev server is not reachable at ${BASE_URL}/studio`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'labellab-posters-'));
  const chromeExe = findChrome();
  const chrome = spawn(
    chromeExe,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--window-size=1280,1024',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let client;
  const runtimeMediaUpdates = new Map();

  try {
    const wsUrl = await waitForCdpTarget(CDP_PORT);
    client = new CdpClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 1024,
      deviceScaleFactor: 2,
      mobile: false,
    });

    // Inject preserveDrawingBuffer before page scripts run so we can read the WebGL canvas directly.
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          const origGetContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type, attrs) {
            if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') {
              attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
            }
            return origGetContext.call(this, type, attrs);
          };
        })();
      `,
    });

    // Prime origin once so localStorage can be set cleanly.
    await client.send('Page.navigate', { url: `${BASE_URL}/studio` });
    await sleep(1200);

    for (let idx = 0; idx < targets.length; idx++) {
      const target = targets[idx];
      const dummyDifferentId = target.id === 'basil-strawberry' ? 'can-180' : 'basil-strawberry';

      // Set clean white website scene + motion off + different stored modelId so LabellabApp applies
      // target's exact getModelMaterialDefaults(target.id) and starts in level front view (view-1).
      await client.evalAsync(`
        (() => {
          localStorage.setItem('labellab.domain.v1', 'beverage');
          localStorage.setItem('labellab.scene.preferences.v1', JSON.stringify({
            version: 1,
            preferences: {
              modelId: ${JSON.stringify(dummyDifferentId)},
              sceneMode: 'website',
              style: 'white',
              background: '#ffffff',
              grid: false,
              highlight: false,
              motion: 'off',
              frame: 'square',
              resolution: 1024,
              transparent: false
            }
          }));
        })()
      `);

      const url = `${BASE_URL}/studio?domain=beverage&model=${encodeURIComponent(target.id)}`;
      await client.send('Page.navigate', { url });

      const result = await client.evalAsync(`
        (async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const raf = () => new Promise((r) => requestAnimationFrame(r));
          const deadline = Date.now() + 25000;
          let host = null;
          while (Date.now() < deadline) {
            host = document.querySelector('.viewer-host');
            if (host && host.dataset.viewerReady === 'true' && Number(host.dataset.renderFrames || 0) >= 2) {
              break;
            }
            await wait(120);
          }
          if (!host || host.dataset.viewerReady !== 'true') {
            throw new Error('Viewer never became ready for ${target.id} (phase=' + (host?.dataset.mockupPhase || 'missing') + ')');
          }

          // Switch to level telephoto View 2 for minimal perspective distortion, or keep level View 1.
          // Wait for idle MSAA refinement + optical refraction backdrop to settle cleanly.
          await wait(750);
          for (let i = 0; i < 6; i++) await raf();

          const glCanvas = host.querySelector('canvas');
          if (!glCanvas || !glCanvas.width || !glCanvas.height) {
            throw new Error('Missing WebGL canvas for ${target.id}');
          }

          const src = document.createElement('canvas');
          src.width = glCanvas.width;
          src.height = glCanvas.height;
          const sctx = src.getContext('2d', { willReadFrequently: true });
          sctx.clearRect(0, 0, src.width, src.height);
          sctx.drawImage(glCanvas, 0, 0);

          const img = sctx.getImageData(0, 0, src.width, src.height).data;
          const W = src.width;
          const H = src.height;
          let minX = W, minY = H, maxX = -1, maxY = -1;
          for (let y = 0; y < H; y++) {
            const row = y * W * 4;
            for (let x = 0; x < W; x++) {
              const a = img[row + x * 4 + 3];
              if (a > 12) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX <= minX || maxY <= minY) {
            throw new Error('Rendered canvas was empty for ${target.id}');
          }

          // Add 2px anti-aliasing halo margin inside source bounds.
          minX = Math.max(0, minX - 2);
          minY = Math.max(0, minY - 2);
          maxX = Math.min(W - 1, maxX + 2);
          maxY = Math.min(H - 1, maxY + 2);
          const bw = maxX - minX + 1;
          const bh = maxY - minY + 1;

          const out = document.createElement('canvas');
          out.width = ${TARGET_SIZE};
          out.height = ${TARGET_SIZE};
          const octx = out.getContext('2d');
          octx.imageSmoothingEnabled = true;
          octx.imageSmoothingQuality = 'high';
          // Keep seamless transparent alpha background so thumbnails blend identically on pure white
          // model cards, Pack Your Bottles selectors, and any theme without gray/green boxes!
          octx.clearRect(0, 0, ${TARGET_SIZE}, ${TARGET_SIZE});

          const scale = Math.min(${MAX_DRAW_W} / bw, ${MAX_DRAW_H} / bh);
          const dw = bw * scale;
          const dh = bh * scale;
          const dx = (${TARGET_SIZE} - dw) * 0.5;
          const dy = (${TARGET_SIZE} - dh) * 0.5;
          octx.drawImage(src, minX, minY, bw, bh, dx, dy, dw, dh);

          const dataUrl = out.toDataURL('image/webp', ${WEBP_QUALITY});
          return {
            dataUrl,
            srcSize: [W, H],
            cropBox: [bw, bh],
            drawSize: [Math.round(dw), Math.round(dh)],
          };
        })()
      `);

      if (!result?.dataUrl?.startsWith('data:image/webp;base64,')) {
        throw new Error(`Expected WebP data URL for ${target.id}, got ${String(result?.dataUrl).slice(0, 40)}`);
      }
      const bytes = Buffer.from(result.dataUrl.slice('data:image/webp;base64,'.length), 'base64');
      const outPath = path.join(PUBLIC_DIR, target.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, bytes);
      if (target.mirrorOut) {
        const mirrorPath = path.join(PUBLIC_DIR, target.mirrorOut);
        fs.mkdirSync(path.dirname(mirrorPath), { recursive: true });
        fs.writeFileSync(mirrorPath, bytes);
      }
      if (target.runtimeMediaId) {
        runtimeMediaUpdates.set(target.runtimeMediaId, {
          bytes: bytes.length,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
          width: TARGET_SIZE,
          height: TARGET_SIZE,
        });
      }
      console.log(
        `[${String(idx + 1).padStart(2, ' ')}/${targets.length}] ${target.id.padEnd(26)} -> ${target.out} (${(bytes.length / 1024).toFixed(1)} KB, draw ${result.drawSize[0]}x${result.drawSize[1]})`,
      );
    }

    // Keep source-catalog-runtime.json poster metadata strictly synchronized.
    if (runtimeMediaUpdates.size > 0) {
      const runtimeJsonPath = path.join(ROOT, 'lib/labellab/source-catalog-runtime.json');
      const runtimeData = JSON.parse(fs.readFileSync(runtimeJsonPath, 'utf8'));
      for (const media of runtimeData.media || []) {
        const patch = runtimeMediaUpdates.get(media.id);
        if (patch) {
          media.bytes = patch.bytes;
          media.sha256 = patch.sha256;
          media.width = patch.width;
          media.height = patch.height;
        }
      }
      fs.writeFileSync(runtimeJsonPath, JSON.stringify(runtimeData));
      console.log(`Updated ${runtimeMediaUpdates.size} poster hashes in lib/labellab/source-catalog-runtime.json`);
    }
  } finally {
    client?.close();
    try {
      chrome.kill();
    } catch {}
    await sleep(300);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
