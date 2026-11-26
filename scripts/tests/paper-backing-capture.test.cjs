const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const THREE = require('three');

const filename = path.resolve(__dirname, '../../lib/viewer/paper-backing-capture.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const {
  renderPaperBackingCapture,
  disposePaperBackingCapture,
} = loaded.exports;

function createMockRenderer({ cssWidth = 1000, cssHeight = 700, pixelRatio = 1.5 } = {}) {
  let currentTarget = null;
  let currentCubeFace = 0;
  let currentMipmapLevel = 0;
  const logicalViewport = new THREE.Vector4(0, 0, cssWidth, cssHeight);
  const currentViewport = logicalViewport.clone().multiplyScalar(pixelRatio).floor();
  const logicalScissor = new THREE.Vector4(0, 0, cssWidth, cssHeight);
  const currentScissor = logicalScissor.clone().multiplyScalar(pixelRatio).floor();
  let logicalScissorTest = false;
  let currentScissorTest = false;
  const clearColor = new THREE.Color('#000000');
  let clearAlpha = 0;
  const renderedPasses = [];

  const renderer = {
    getRenderTarget: () => currentTarget,
    getActiveCubeFace: () => currentCubeFace,
    getActiveMipmapLevel: () => currentMipmapLevel,
    getDrawingBufferSize: (target) => target.set(Math.floor(cssWidth * pixelRatio), Math.floor(cssHeight * pixelRatio)),
    getViewport: (target) => target.copy(logicalViewport),
    getCurrentViewport: (target) => target.copy(currentViewport),
    setViewport(x, y, w, h) {
      if (x && x.isVector4) logicalViewport.copy(x);
      else logicalViewport.set(x, y, w, h);
      currentViewport.copy(logicalViewport).multiplyScalar(pixelRatio).round();
    },
    getScissor: (target) => target.copy(logicalScissor),
    setScissor(x, y, w, h) {
      if (x && x.isVector4) logicalScissor.copy(x);
      else logicalScissor.set(x, y, w, h);
      currentScissor.copy(logicalScissor).multiplyScalar(pixelRatio).round();
    },
    getScissorTest: () => logicalScissorTest,
    setScissorTest(value) {
      logicalScissorTest = value;
      currentScissorTest = value;
    },
    getClearColor: (target) => target.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor(color, alpha = 1) {
      clearColor.set(color);
      clearAlpha = alpha;
    },
    setRenderTarget(target, cubeFace = 0, mipmapLevel = 0) {
      currentTarget = target;
      currentCubeFace = cubeFace;
      currentMipmapLevel = mipmapLevel;
      if (target) {
        currentViewport.copy(target.viewport);
        currentScissor.copy(target.scissor);
        currentScissorTest = target.scissorTest;
      } else {
        currentViewport.copy(logicalViewport).multiplyScalar(pixelRatio).floor();
        currentScissor.copy(logicalScissor).multiplyScalar(pixelRatio).floor();
        currentScissorTest = logicalScissorTest;
      }
    },
    clear() {},
    render() {
      renderedPasses.push({
        target: currentTarget,
        viewport: currentViewport.clone(),
        scissorTest: currentScissorTest,
      });
    },
  };

  return { renderer, logicalViewport, currentViewport, renderedPasses };
}

function createPaperBackingScene() {
  const scene = new THREE.Scene();
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
  backing.userData.basilWebLabelBackBeauty = true;
  label.add(backing);
  scene.add(label);
  return { scene, label, backing };
}

test('renderPaperBackingCapture preserves offscreen tile viewport for tiled 4K/8K transmission exports', () => {
  const { renderer, logicalViewport, renderedPasses } = createMockRenderer({
    cssWidth: 960,
    cssHeight: 640,
    pixelRatio: 1.5,
  });
  const { scene } = createPaperBackingScene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);

  // Simulate an 8129px tiled export tile (1472x1472) while the live canvas is 960x640 @ 1.5x DPR.
  const tileTarget = new THREE.WebGLRenderTarget(1472, 1472);
  renderer.setRenderTarget(tileTarget);

  let drawTarget = null;
  let drawViewport = null;
  renderPaperBackingCapture(renderer, scene, camera, () => {
    drawTarget = renderer.getRenderTarget();
    drawViewport = renderer.getCurrentViewport(new THREE.Vector4());
  });

  // Paper backing capture pass must render at exact physical tile dimensions (not multiplied by DPR).
  assert.equal(renderedPasses.length, 1);
  assert.deepEqual(renderedPasses[0].viewport.toArray(), [0, 0, 1472, 1472]);
  assert.equal(renderedPasses[0].scissorTest, false);

  // The beauty + transmission draw must still see the tile's exact 1472x1472 viewport so
  // Three's renderTransmissionPass allocates a matching 1472x1472 transmissionRenderTarget.
  assert.equal(drawTarget, tileTarget);
  assert.deepEqual(drawViewport.toArray(), [0, 0, 1472, 1472]);
  assert.deepEqual(logicalViewport.toArray(), [0, 0, 960, 640], 'Main canvas viewport must never be clobbered');

  disposePaperBackingCapture(renderer);
  tileTarget.dispose();
});

test('renderPaperBackingCapture preserves default canvas HiDPI viewport when rendering to screen', () => {
  const { renderer, logicalViewport, renderedPasses } = createMockRenderer({
    cssWidth: 800,
    cssHeight: 600,
    pixelRatio: 2,
  });
  const { scene } = createPaperBackingScene();
  const camera = new THREE.PerspectiveCamera(30, 800 / 600, 0.01, 10);

  let drawTarget = 'unset';
  let drawViewport = null;
  renderPaperBackingCapture(renderer, scene, camera, () => {
    drawTarget = renderer.getRenderTarget();
    drawViewport = renderer.getCurrentViewport(new THREE.Vector4());
  });

  assert.equal(renderedPasses.length, 1);
  assert.deepEqual(renderedPasses[0].viewport.toArray(), [0, 0, 1600, 1200]);
  assert.equal(drawTarget, null);
  assert.deepEqual(drawViewport.toArray(), [0, 0, 1600, 1200]);
  assert.deepEqual(logicalViewport.toArray(), [0, 0, 800, 600]);

  disposePaperBackingCapture(renderer);
});

test('renderPaperBackingCapture restores scene and target state without calling draw if capture throws', () => {
  const { renderer } = createMockRenderer({ cssWidth: 900, cssHeight: 600, pixelRatio: 1 });
  const { scene, label } = createPaperBackingScene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  const tileTarget = new THREE.WebGLRenderTarget(1536, 1536);
  renderer.setRenderTarget(tileTarget);
  renderer.render = () => { throw new Error('simulated WebGL failure'); };

  let drawCalled = false;
  assert.throws(() => {
    renderPaperBackingCapture(renderer, scene, camera, () => { drawCalled = true; });
  }, /simulated WebGL failure/);

  assert.equal(drawCalled, false);
  assert.equal(renderer.getRenderTarget(), tileTarget);
  assert.deepEqual(renderer.getCurrentViewport(new THREE.Vector4()).toArray(), [0, 0, 1536, 1536]);
  assert.equal(label.visible, true);

  disposePaperBackingCapture(renderer);
  tileTarget.dispose();
});
